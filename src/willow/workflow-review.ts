// Reviews are bound to the exact audited business snapshot. Any intervening write
// requires a fresh preview; publishing never silently changes an existing case.
import type { Bindings } from '../auth.server'
import { requirePermission, type Actor } from './actor'
import { all, commit, guard, insist, json, newId, now, one, stmt, type Row } from './core'
import { requireDate } from './dates'
import type { Input } from './input'
import { answersFor } from './lifecycle'
import { workMembers } from './work-sources'
import { displayName, termsOn } from './people'
import { plannedTasks, workflowContext } from './workflow-plan'

export const auditSequence = async (env: Bindings) => (await one(env, 'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq as number

export async function saveReview(env: Bindings, actor: Actor, kind: string, subject: string, template: string, date: string, sequence: number, detail: unknown) {
  const id = newId()
  await stmt(env, 'INSERT INTO wl_workflow_reviews(id,actor,kind,subject,template_id,audit_seq,as_of,detail) VALUES(?,?,?,?,?,?,?,?)', id, actor.id, kind, subject, template, sequence, date, JSON.stringify(detail)).run()
  return { id, detail }
}

export async function readReview(env: Bindings, actor: Actor, id: string, kind?: string): Promise<Row & { detail: any }> {
  requirePermission(actor, 'people.manage')
  const review = await one(env, 'SELECT * FROM wl_workflow_reviews WHERE id=? AND actor=?', id, actor.id)
  insist(review && (!kind || review.kind === kind), 'review_not_found', 404)
  return { ...review, detail: json<any>(review.detail, {}) }
}

export function reviewGuards(env: Bindings, actor: Actor, review: Row) {
  return [guard(env, 'review_stale', 'EXISTS(SELECT 1 FROM wl_workflow_reviews WHERE id=? AND actor=? AND consumed_at IS NULL) AND (SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?', review.id, actor.id, review.audit_seq),
    stmt(env, 'UPDATE wl_workflow_reviews SET consumed_at=? WHERE id=?', now(), review.id)]
}

export async function previewTemplate(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const id = input.text('template'), template = await one(env, 'SELECT * FROM wl_templates WHERE id=?', id)
  insist(template?.publication === 'draft', 'template_not_draft', 409)
  const date = requireDate(input.text('asOf', { optional: true }) || actor.today, 'invalid_asOf')
  const sequence = await auditSequence(env)
  const people = await all(env, 'SELECT p.*,e.id AS period,e.employment_type FROM wl_people p JOIN wl_periods e ON e.person_id=p.id WHERE e.start_date<=? AND (e.end_date IS NULL OR e.end_date>=?) ORDER BY p.id', date, date)
  const members = await workMembers(env)
  const affected = []
  for (const person of people) {
    const terms = await termsOn(env, person.period, date)
    if (!terms) continue
    const tasks = await plannedTasks(env, id, await workflowContext(env, terms, person.employment_type), date, terms.manager_person_id)
    affected.push({ person: person.id, name: displayName(person), tasks: tasks.map(task => ({ position: task.position, title: task.title, assignee: task.assignee, recipients: members.filter(member => answersFor(member, { ...task, assignee_person_id: task.manager }, { person_id: person.id })).map(member => ({ id: member.id, name: member.name })), manager: task.manager, dueDate: task.dueDate, system: task.system, action: task.action, evidenceRequired: !!task.evidence_required, dependencies: task.dependencies.filter(p => tasks.some(t => t.position === p)) })) })
  }
  const openCases = await all(env, "SELECT c.id,c.person_id,c.template_id,t.version FROM wl_cases c JOIN wl_templates t ON t.id=c.template_id WHERE t.family_id=? AND c.status='open'", template.family_id)
  const recipe = await all(env, 'SELECT position,title,assignee,due_offset_days,evidence_required,system,action,rule FROM wl_template_tasks WHERE template_id=? ORDER BY position', id)
  const locationNames = Object.fromEntries((await all(env, 'SELECT id,name FROM wl_locations')).map(l => [l.id, l.name]))
  return saveReview(env, actor, 'publication', id, id, date, sequence, { template: { id, name: template.name, kind: template.kind, version: template.version }, asOf: date, affected, openCases, recipe, locationNames, boundary: 'Preview only. New cases use the published recipe; existing cases retain their version. External steps are assigned evidence-required work, not provider execution.' })
}

export async function publishTemplate(env: Bindings, actor: Actor, input: Input) {
  const review = await readReview(env, actor, input.text('review'), 'publication')
  const template = (await one(env, 'SELECT * FROM wl_templates WHERE id=?', review.template_id))!
  await commit(env, [
    ...reviewGuards(env, actor, review),
    guard(env, 'template_not_draft', "EXISTS(SELECT 1 FROM wl_templates WHERE id=? AND publication='draft')", template.id),
    stmt(env, "UPDATE wl_templates SET status='retired' WHERE family_id=? AND status='active'", template.family_id),
    stmt(env, "UPDATE wl_templates SET status='active',publication='published' WHERE id=?", template.id),
  ], { actor: actor.id, action: 'template.publish', subject: template.id, detail: { review: review.id, asOf: review.as_of, version: template.version } })
  return { id: template.id, status: 'active' }
}
