import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt } from '../core'
import { requireDate } from '../dates'
import type { Input } from '../input'
import type { Survey, SurveyKind, SurveyMode, SurveyPlan, SurveyQuestion } from './types'

const BUSINESS_VERSION = "SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit WHERE action NOT LIKE '%.read'"
const ACTIVE_MEMBER = `SELECT 1 FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id
  WHERE m.id=? AND m.status='active' AND o.status='active'`
const ELIGIBLE_MEMBERS = `SELECT m.id,m.person_id FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id
  WHERE m.id IN (SELECT value FROM json_each(?)) AND m.status='active' AND o.status='active'
  AND EXISTS (SELECT 1 FROM wl_periods p WHERE p.person_id=m.person_id AND p.start_date<=? AND (p.end_date IS NULL OR p.end_date>=?))`

/** Score questions use integer 0..10. Choices are one of the frozen options. */
function questionsFrom(input: Input, mode: SurveyMode, kind: SurveyKind): SurveyQuestion[] {
  const keysInput=input.list('questionKey',{keepEmpty:true}), labels=input.list('questionLabel',{keepEmpty:true}), types=input.list('questionType',{keepEmpty:true}), optionsInput=input.list('questionOptions',{keepEmpty:true}), optional=input.list('questionOptional')
  const raw = input.has('questions') ? input.json('questions') : keysInput.flatMap((key,index)=>key&&labels[index]?.trim()?[{key,label:labels[index],type:types[index],optional:optional.includes(String(index)),...(types[index]==='choice'?{options:(optionsInput[index]??'').split('|').map(s=>s.trim())}:{})}]:[])
  insist(Array.isArray(raw) && raw.length >= 1 && raw.length <= 10, 'invalid_questions')
  const keys = new Set<string>()
  const questions = raw.map((value): SurveyQuestion => {
    insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_question')
    const q = value as Record<string, unknown>
    insist(Object.keys(q).every(key => ['key','label','type','options','optional'].includes(key)), 'invalid_question')
    insist(typeof q.key === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(q.key) && !keys.has(q.key), 'invalid_question_key')
    keys.add(q.key)
    insist(typeof q.label === 'string' && q.label.trim().length >= 1 && q.label.trim().length <= 500, 'invalid_question_label')
    insist(q.optional === undefined || typeof q.optional === 'boolean', 'invalid_question_optional')
    const base = { key: q.key, label: q.label.trim(), optional: q.optional === true }
    insist(q.type === 'score' || q.type === 'choice' || q.type === 'text', 'invalid_question_type')
    insist(!base.optional || q.type === 'text', 'invalid_question_optional')
    if (q.type === 'choice') {
      insist(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 20, 'invalid_question_options')
      insist(q.options.every(option => typeof option === 'string' && option.trim().length >= 1 && option.trim().length <= 200), 'invalid_question_options')
      const options = (q.options as string[]).map(option => option.trim())
      insist(new Set(options).size === options.length, 'invalid_question_options')
      return { ...base, type: 'choice' as const, options }
    }
    insist(q.options === undefined, 'invalid_question_options')
    insist(mode !== 'anonymous' || q.type !== 'text' || base.optional, 'anonymous_text_must_be_optional')
    return { ...base, type: q.type }
  })
  insist(mode !== 'anonymous' || questions.filter(q => q.type === 'text').length <= 1, 'anonymous_text_limit')
  insist(kind !== 'enps' || (questions.filter(q => q.type === 'score').length === 1 && questions.every(q => q.type !== 'text' || (mode === 'anonymous' && q.optional))), 'invalid_enps_questions')
  return questions
}

async function surveyRow(env: Bindings, id: string) {
  const row = await one<Survey>(env, 'SELECT * FROM wl_surveys WHERE id=?', id)
  insist(row, 'survey_not_found', 404)
  return row
}

async function cohort(env: Bindings, survey: string) {
  return (await all<{ member_id: string }>(env, 'SELECT member_id FROM wl_survey_members WHERE survey_id=? ORDER BY member_id', survey)).map(row => row.member_id)
}

function sameCohort(left: string[], right: string[]) {
  return left.length === right.length && left.every((member, index) => member === right[index])
}

export async function createSurvey(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['returnTo','name','kind','mode','questions','members','deliveryDate','dueDate','followupOf','questionKey','questionLabel','questionType','questionOptions','questionOptional'])
  const source = (await one<{ seq: number }>(env, BUSINESS_VERSION))!.seq
  const kind = input.text('kind') as SurveyKind, mode = input.text('mode') as SurveyMode
  insist(['onboarding','lifecycle','pulse','enps'].includes(kind), 'invalid_kind')
  insist(mode === 'named' || mode === 'anonymous', 'invalid_mode')
  const name = input.text('name', { max: 160 }), questions = questionsFrom(input, mode, kind)
  const delivery = requireDate(input.text('deliveryDate'), 'invalid_deliveryDate')
  const due = requireDate(input.text('dueDate'), 'invalid_dueDate')
  insist(delivery >= actor.today && due >= delivery, 'invalid_survey_dates')
  const members = [...new Set(input.list('members'))].sort()
  insist(members.length >= (mode === 'anonymous' ? 5 : 1), 'survey_cohort_too_small')
  const memberJSON = JSON.stringify(members)
  const admitted = await all<{ id: string; person_id: string }>(env, ELIGIBLE_MEMBERS, memberJSON, delivery, delivery)
  insist(admitted.length === members.length, 'survey_member_not_active', 409)
  if (mode === 'anonymous') {
    // Any historical overlapping anonymous cohort must be the exact same set.
    const overlap = await one(env, `SELECT s.id FROM wl_surveys s WHERE s.mode='anonymous'
      AND EXISTS (SELECT 1 FROM wl_survey_members m WHERE m.survey_id=s.id AND m.member_id IN (SELECT value FROM json_each(?)))
      AND ((SELECT COUNT(*) FROM wl_survey_members m WHERE m.survey_id=s.id)<>?
        OR EXISTS (SELECT 1 FROM wl_survey_members m WHERE m.survey_id=s.id AND m.member_id NOT IN (SELECT value FROM json_each(?)))) LIMIT 1`, memberJSON, members.length, memberJSON)
    insist(!overlap, 'anonymous_cohort_overlap', 409)
  }
  const followup = input.text('followupOf', { optional: true, max: 100 }) || null
  if (followup) {
    const previous = await surveyRow(env, followup)
    insist(previous.mode === mode && sameCohort(members, await cohort(env, followup)), 'survey_followup_mismatch', 409)
  }
  const id = newId()
  await commit(env, [
    guard(env, 'stale', `(${BUSINESS_VERSION})=?`, source),
    guard(env, 'stale', `(SELECT COUNT(*) FROM (${ELIGIBLE_MEMBERS}))=?`, memberJSON, delivery, delivery, members.length),
    stmt(env, `INSERT INTO wl_surveys (id,name,kind,mode,questions_json,delivery_date,due_date,status,created_by,created_at,followup_of)
      VALUES (?,?,?,?,?,?,?,'open',?,?,?)`, id, name, kind, mode, JSON.stringify(questions), delivery, due, actor.id, now(), followup),
    stmt(env, `INSERT INTO wl_survey_members (survey_id,member_id,person_id)
      SELECT ?,m.id,m.person_id FROM wl_members m WHERE m.id IN (SELECT value FROM json_each(?))`, id, memberJSON),
  ], { actor: actor.id, action: 'survey.create', subject: id, detail: { kind, mode, participants: members.length, followupOf: followup } })
  return { id, status: 'open' as const }
}

export async function closeSurvey(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['returnTo','survey'])
  const id = input.text('survey', { max: 100 })
  await surveyRow(env, id)
  await commit(env, [
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_surveys WHERE id=? AND status='open')", id),
    stmt(env, "UPDATE wl_surveys SET status='closed' WHERE id=?", id),
  ], { actor: actor.id, action: 'survey.close', subject: id })
  return { id, status: 'closed' as const }
}

export async function createActionPlan(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['returnTo','survey','theme','plan','ownerMember','dueDate','followupID'])
  const source = (await one<{ seq: number }>(env, BUSINESS_VERSION))!.seq
  const survey = await surveyRow(env, input.text('survey', { max: 100 }))
  const theme = input.text('theme', { max: 200 }), plan = input.text('plan', { max: 2000 })
  const owner = input.text('ownerMember', { max: 100 })
  insist(await one(env, ACTIVE_MEMBER, owner), 'survey_plan_owner_not_active', 409)
  const due = requireDate(input.text('dueDate'), 'invalid_dueDate')
  insist(due >= actor.today, 'invalid_dueDate')
  const followup = input.text('followupID', { optional: true, max: 100 }) || null
  if (followup) {
    const next = await surveyRow(env, followup)
    insist(next.id !== survey.id && next.mode === survey.mode && sameCohort(await cohort(env, survey.id), await cohort(env, next.id)), 'survey_followup_mismatch', 409)
  }
  const id = newId()
  await commit(env, [
    guard(env, 'stale', `(${BUSINESS_VERSION})=?`, source),
    guard(env, 'stale', `EXISTS(${ACTIVE_MEMBER})`, owner),
    stmt(env, `INSERT INTO wl_survey_plans (id,survey_id,theme,plan,owner_member,due_date,followup_id,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, id, survey.id, theme, plan, owner, due, followup, actor.id, now()),
  ], { actor: actor.id, action: 'survey.plan.create', subject: id, detail: { survey: survey.id, ownerMember: owner, followupID: followup } })
  return { id }
}

export async function completeActionPlan(env: Bindings, actor: Actor, input: Input) {
  input.only(['returnTo','plan','evidence'])
  const id = input.text('plan', { max: 100 }), evidence = input.text('evidence', { max: 1000 })
  insist(evidence.length >= 3, 'survey_plan_evidence_required')
  const plan = await one<SurveyPlan>(env, 'SELECT * FROM wl_survey_plans WHERE id=?', id)
  insist(plan, 'survey_plan_not_found', 404)
  insist(actor.owner || plan.owner_member === actor.id, 'forbidden', 403)
  insist(await one(env, ACTIVE_MEMBER, actor.id), 'access_ended', 403)
  await commit(env, [
    guard(env, 'stale', `EXISTS(${ACTIVE_MEMBER})`, actor.id),
    guard(env, 'stale', `EXISTS(SELECT 1 FROM wl_survey_plans WHERE id=? AND completed_evidence IS NULL AND (?=1 OR owner_member=?))`, id, actor.owner ? 1 : 0, actor.id),
    stmt(env, 'UPDATE wl_survey_plans SET completed_evidence=? WHERE id=?', evidence, id),
  ], { actor: actor.id, action: 'survey.plan.complete', subject: id, detail: { survey: plan.survey_id } })
  return { id, status: 'completed' as const }
}
