import { readsSurveyThemes } from './authority'
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, auditRead, insist, now, one, stmt } from '../core'
import type { Survey, SurveyPlan, SurveyQuestion } from './types'

export interface SurveyMetadata {
  id: string; name: string; kind: Survey['kind']; mode: Survey['mode']
  deliveryDate: string; dueDate: string; status: Survey['status']; followupOf: string | null
  questions: SurveyQuestion[]
}
export interface SurveyCategory { category: string | null; count: number | null }
export interface SurveyQuestionResult {
  key: string; label: string; type: SurveyQuestion['type']
  count: number | null; mean: number | null; nps: number | null
  categories: SurveyCategory[]
}
export interface SurveyAggregate {
  suppressed: boolean; minimumCellSize: number
  invitedCount: number | null; answerCount: number | null
  questions: SurveyQuestionResult[]
}
export interface SurveyPublishedPlan {
  id: string; theme: string; plan: string; ownerMember: string; ownerName: string
  dueDate: string; followupId: string | null; completedEvidence: string | null
}
export interface SurveyComment { answerId: string; questionKey: string; text: string }
export interface SurveyNamedAnswer { answerId: string; name: string; answers: Record<string, string | number> }
export interface SurveyComparison { survey: SurveyMetadata; aggregate: SurveyAggregate }
export type SurveyResults = {
  access: 'themes'; survey: SurveyMetadata; plans: SurveyPublishedPlan[]
} | {
  access: 'hr'; survey: SurveyMetadata; plans: SurveyPublishedPlan[]
  aggregate: SurveyAggregate; comparisons: SurveyComparison[]
  namedAnswers: SurveyNamedAnswer[]; comments: SurveyComment[]
  calculation: string
}

const MINIMUM = 5
const WATERMARK = "SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit WHERE action NOT LIKE '%.read'"

function metadata(survey: Survey): SurveyMetadata {
  return { id: survey.id, name: survey.name, kind: survey.kind, mode: survey.mode,
    deliveryDate: survey.delivery_date, dueDate: survey.due_date, status: survey.status,
    followupOf: survey.followup_of, questions: JSON.parse(survey.questions_json) }
}

/** Audit only the number of read operations, never answer text, identity,
 * suppressed counts or response timing. The audit commits with the read. */
async function readAudited<T>(env: Bindings, actor: Actor, survey: string, action: string, sql: string, ...params: unknown[]): Promise<T[]> {
  const [result] = await env.DB.batch<T>([
    stmt(env, sql, ...params),
    stmt(env, 'INSERT INTO wl_audit (at,actor,action,subject,detail) VALUES (?,?,?,?,?)',
      now(), actor.id, action, survey, JSON.stringify({ count: 1 })),
  ])
  return result.results
}

interface AggregateRow {
  kind: 'total' | 'question'; question_key: string | null; category: string | null
  count: number; score_sum: number; invited: number
}

// Only grouped counts/sums leave SQL. In particular, no anonymous answer ID,
// member link, JSON answer object or individual score is selected here.
const AGGREGATE_SQL = `WITH questions AS (
  SELECT s.kind, json_extract(q.value,'$.key') AS question_key,
    json_extract(q.value,'$.type') AS question_type,
    json_extract(q.value,'$.options') AS options
  FROM wl_surveys s, json_each(s.questions_json) q WHERE s.id=?1
), values_by_question AS (
  SELECT q.*, e.value, e.type,
    CASE WHEN q.question_type='score' AND e.type='integer' AND e.value BETWEEN 0 AND 10 THEN 1 ELSE 0 END AS valid_score
  FROM questions q JOIN wl_survey_answers a ON a.survey_id=?1
  LEFT JOIN json_each(a.answers_json) e ON e.key=q.question_key
  WHERE q.question_type<>'text'
), classified AS (
  SELECT question_key,
    CASE WHEN valid_score=1 THEN
      CASE WHEN kind='enps' THEN CASE WHEN value>=9 THEN 'promoters' WHEN value>=7 THEN 'passives' ELSE 'detractors' END
        ELSE CAST(value AS TEXT) END
      WHEN question_type='choice' AND type='text' AND value IN (SELECT value FROM json_each(options)) THEN value
      ELSE NULL END AS category,
    CASE WHEN valid_score=1 THEN value ELSE 0 END AS score
  FROM values_by_question
)
SELECT 'total' AS kind, NULL AS question_key, NULL AS category, COUNT(*) AS count, 0 AS score_sum,
  (SELECT COUNT(*) FROM wl_survey_members WHERE survey_id=?1) AS invited
  FROM wl_survey_answers WHERE survey_id=?1
UNION ALL
SELECT 'question',question_key,category,COUNT(*),SUM(score),0
  FROM classified GROUP BY question_key,category`

async function aggregate(env: Bindings, actor: Actor, survey: Survey): Promise<SurveyAggregate> {
  const rows = await readAudited<AggregateRow>(env, actor, survey.id, 'survey.aggregate.read', AGGREGATE_SQL, survey.id)
  const total = rows.find(row => row.kind === 'total')!
  const suppressed = survey.mode === 'anonymous' && (total.invited < MINIMUM || total.count < MINIMUM ||
    rows.some(row => row.kind === 'question' && row.count > 0 && row.count < MINIMUM))
  const protect = (value: number) => suppressed ? null : value
  const questions = metadata(survey).questions.map(question => {
    const groups = rows.filter(row => row.kind === 'question' && row.question_key === question.key)
    const count = groups.filter(row => row.category !== null).reduce((sum, row) => sum + row.count, 0)
    const categories = question.type === 'choice' ? question.options : question.type === 'score'
      ? survey.kind === 'enps' ? ['promoters', 'passives', 'detractors'] : Array.from({ length: 11 }, (_, i) => String(i)) : []
    const categoryCount = (category: string | null) => groups.find(row => row.category === category)?.count ?? 0
    const mean = question.type === 'score' && count > 0 ? groups.reduce((sum, row) => sum + row.score_sum, 0) / count : null
    const nps = question.type === 'score' && survey.kind === 'enps' && count > 0
      ? (categoryCount('promoters') - categoryCount('detractors')) / count * 100 : null
    return { key: question.key, label: question.label, type: question.type,
      // Optional text has no count: comments are released under the survey's
      // answer threshold, and their authors are never linked to membership.
      count: question.type === 'text' ? null : protect(count), mean: suppressed ? null : mean, nps: suppressed ? null : nps,
      categories: question.type === 'text' ? [] : [...categories, '__unanswered__'].map(category => ({ category, count: protect(categoryCount(category)) })) }
  })
  return { suppressed, minimumCellSize: MINIMUM, invitedCount: protect(total.invited), answerCount: protect(total.count), questions }
}

async function publishedPlans(env: Bindings, id: string): Promise<SurveyPublishedPlan[]> {
  const rows = await all<SurveyPlan & { owner_name: string }>(env, `SELECT p.*,m.name AS owner_name
    FROM wl_survey_plans p JOIN wl_members m ON m.id=p.owner_member
    WHERE p.survey_id=? ORDER BY p.created_at,p.id`, id)
  return rows.map(row => ({ id: row.id, theme: row.theme, plan: row.plan,
    ownerMember: row.owner_member, ownerName: row.owner_name, dueDate: row.due_date,
    followupId: row.followup_id, completedEvidence: row.completed_evidence }))
}

/** Recheck the frozen-cohort invariant for every linked comparison. */
async function comparisonSurveys(env: Bindings, survey: Survey): Promise<Survey[]> {
  const surveys = await all<Survey>(env, `SELECT * FROM wl_surveys WHERE id<>?1 AND
    (followup_of=?1 OR id=?2 OR id IN (SELECT followup_id FROM wl_survey_plans WHERE survey_id=?1))
    ORDER BY delivery_date,id`, survey.id, survey.followup_of)
  for (const related of surveys) {
    const mismatch = await one<{ mismatch: number }>(env, `SELECT
      EXISTS(SELECT member_id FROM wl_survey_members WHERE survey_id=?1
        EXCEPT SELECT member_id FROM wl_survey_members WHERE survey_id=?2)
      OR EXISTS(SELECT member_id FROM wl_survey_members WHERE survey_id=?2
        EXCEPT SELECT member_id FROM wl_survey_members WHERE survey_id=?1) AS mismatch`, survey.id, related.id)
    insist(related.mode === survey.mode && mismatch?.mismatch === 0, 'survey_followup_mismatch', 409)
  }
  return surveys
}

function shuffled<T>(values: T[]): T[] {
  return values.map(value => ({ value, order: crypto.randomUUID() }))
    .sort((a, b) => a.order.localeCompare(b.order)).map(entry => entry.value)
}

/** No filters, membership lists, self-ID or manager raw-answer projection. */
export async function surveyResults(env: Bindings, actor: Actor, id: string,
  options: Record<string, unknown> = {}): Promise<SurveyResults> {
  insist(options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).length === 0,
    'survey_filters_not_allowed')
  const hr = can(actor, 'people.manage')
  const started = (await one<{ seq: number }>(env, WATERMARK))!.seq
  const survey = await one<Survey>(env, 'SELECT * FROM wl_surveys WHERE id=?', id)
  insist(survey, 'survey_not_found', hr ? 404 : 403)
  if (!hr) {
    insist(await readsSurveyThemes(env,actor,id), 'forbidden', 403)
  }
  const versions=new Map([[survey.id,survey.response_revision]])
  const plans = await publishedPlans(env, id)
  const fence = async () => {
    insist((await one<{ seq: number }>(env, WATERMARK))!.seq === started, 'survey_source_changed', 409)
    for(const [key,revision] of versions)insist((await one<{response_revision:number}>(env,'SELECT response_revision FROM wl_surveys WHERE id=?',key))?.response_revision===revision,'survey_source_changed',409)
  }
  if (!hr) {
    await fence()
    await auditRead(env, actor.id, 'survey.themes.read', id, { count: plans.length })
    return { access: 'themes', survey: metadata(survey), plans }
  }
  const results = await aggregate(env, actor, survey)
  const comparisons: SurveyComparison[] = []
  for (const related of await comparisonSurveys(env, survey)) {
    versions.set(related.id,related.response_revision)
    comparisons.push({ survey: metadata(related), aggregate: await aggregate(env, actor, related) })
  }
  let namedAnswers: SurveyNamedAnswer[] = [], comments: SurveyComment[] = []
  if (survey.mode === 'named') {
    const rows = await readAudited<{ id: string; name: string; answers_json: string }>(env, actor, id, 'survey.named.read',
      `SELECT a.id,m.name,a.answers_json FROM wl_survey_answers a JOIN wl_members m ON m.id=a.member_id
        WHERE a.survey_id=? ORDER BY m.name,a.id`, id)
    namedAnswers = rows.map(row => ({ answerId: row.id, name: row.name, answers: JSON.parse(row.answers_json) }))
  } else if (!results.suppressed) {
    const rows = await readAudited<{ answer_id: string; question_key: string; comment: string }>(env, actor, id, 'survey.comments.read',
      `SELECT a.id AS answer_id,json_extract(q.value,'$.key') AS question_key,e.value AS comment
        FROM wl_surveys s JOIN json_each(s.questions_json) q
        JOIN wl_survey_answers a ON a.survey_id=s.id
        JOIN json_each(a.answers_json) e ON e.key=json_extract(q.value,'$.key')
        LEFT JOIN wl_survey_hidden_comments h ON h.answer_id=a.id
        WHERE s.id=? AND json_extract(q.value,'$.type')='text' AND e.type='text'
          AND length(trim(e.value))>0 AND h.answer_id IS NULL`, id)
    comments = shuffled(rows.map(row => ({ answerId: row.answer_id, questionKey: row.question_key, text: row.comment })))
  }
  await fence()
  return { access: 'hr', survey: metadata(survey), plans, aggregate: results, comparisons, namedAnswers, comments,
    calculation: 'Results use the entire fixed cohort without filters. Score means use integer answers from 0 to 10. eNPS = 100 × (promoters scoring 9–10 minus detractors scoring 0–6) / scored answers; passives score 7–8. eNPS category counts use these three groups; other score questions use the eleven score categories. Anonymous release requires at least five invitees and five answers. Any positive category count below five, including unanswered categories, suppresses every count, mean, score and comment for that survey. Named answers and released anonymous comments are HR-only. Comments are shown as written in a fresh random order with no author or response instant. Managers receive only human-written themes and plans for a cohort wholly within their current reports. Comparisons use the same aggregate rules and verified identical cohorts and modes.' }
}
