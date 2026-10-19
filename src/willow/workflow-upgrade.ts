// Deliberate upgrades preserve completed work and the superseded task history.
import type { Bindings } from '../auth.server'
import { requirePermission, type Actor } from './actor'
import { all, commit, guard, insist, json, newId, now, one, stmt, type Row } from './core'
import type { Input } from './input'
import { answersFor } from './lifecycle'
import { termsOn } from './people'
import { plannedTasks, workflowContext } from './workflow-plan'
import { auditSequence, readReview, reviewGuards, saveReview } from './workflow-review'

async function upgradePlan(env: Bindings, caseId: string, templateId: string) {
  const current = await one(env, 'SELECT c.*,t.family_id FROM wl_cases c JOIN wl_templates t ON t.id=c.template_id WHERE c.id=?', caseId)
  const template = await one(env, "SELECT * FROM wl_templates WHERE id=? AND status='active' AND publication='published'", templateId)
  insist(current?.status === 'open' && template && current.template_id !== templateId && current.family_id === template.family_id, 'invalid_upgrade', 409)
  const period = (await one(env, 'SELECT * FROM wl_periods WHERE id=?', current.period_id))!
  const terms = await termsOn(env, current.period_id, current.anchor_date) ?? {}
  const tasks = await plannedTasks(env, templateId, await workflowContext(env, terms, period.employment_type), current.anchor_date, terms.manager_person_id)
  const previous = await all(env, 'SELECT * FROM wl_case_tasks WHERE case_id=? AND superseded_at IS NULL ORDER BY position', caseId)
  const completed = previous.filter(t => t.status === 'done')
  // Legacy tasks predate source_task; their immutable template supplies the key.
  const oldPlan = await plannedTasks(env, current.template_id, await workflowContext(env, terms, period.employment_type), current.anchor_date, terms.manager_person_id)
  for (const task of completed) task.key = task.source_task ?? oldPlan.find(t => t.position === task.position)?.key
  const used = new Set<string>()
  const selected = tasks.map(task => {
    const retained = completed.find(old => !used.has(old.id) && old.key === task.key)
    if (retained) used.add(retained.id)
    return { ...task, retained: retained?.id ?? null }
  })
  return { current, template, previous, selected, completed }
}

export async function previewUpgrade(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const sequence = await auditSequence(env), caseId = input.text('case'), templateId = input.text('template')
  const plan = await upgradePlan(env, caseId, templateId)
  const detail = { case: caseId, from: plan.current.template_id, to: templateId,
    requiredFields: { before: json((await one(env, 'SELECT required_fields FROM wl_templates WHERE id=?', plan.current.template_id))?.required_fields, []), after: json(plan.template.required_fields, []) },
    retainedCompleted: plan.completed.map(t => ({ id: t.id, title: t.title, evidence: t.evidence })),
    supersededOpen: plan.previous.filter(t => t.status === 'open').map(t => ({ id: t.id, title: t.title, failure: t.failure })),
    tasks: plan.selected.map(t => ({ position: t.position, title: t.title, assignee: t.assignee, dueDate: t.dueDate, system: t.system, dependencies: t.dependencies.filter(p => plan.selected.some(s => s.position === p)), reusedCompletion: t.retained })),
    revision: plan.current.revision }
  return saveReview(env, actor, 'upgrade', caseId, templateId, plan.current.anchor_date, sequence, detail)
}

export async function applyUpgrade(env: Bindings, actor: Actor, input: Input) {
  const review = await readReview(env, actor, input.text('review'), 'upgrade')
  const plan = await upgradePlan(env, review.subject, review.template_id)
  const ids = new Map(plan.selected.map(t => [t.position, t.retained ?? newId()]))
  const at = now(), maximum = Math.max(0, ...(await all(env, 'SELECT position FROM wl_case_tasks WHERE case_id=?', plan.current.id)).map(t => t.position))
  await commit(env, [
    ...reviewGuards(env, actor, review),
    guard(env, 'review_stale', "EXISTS(SELECT 1 FROM wl_cases WHERE id=? AND revision=? AND status='open')", plan.current.id, review.detail.revision),
    stmt(env, "UPDATE wl_case_tasks SET superseded_at=? WHERE case_id=? AND status='open' AND superseded_at IS NULL", at, plan.current.id),
    ...plan.selected.filter(t => !t.retained).map((t, i) => stmt(env, "INSERT INTO wl_case_tasks(id,case_id,position,title,assignee,assignee_person_id,due_date,evidence_required,system,action,status,dependencies,source_task,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'open',?,?,?)", ids.get(t.position), plan.current.id, maximum + i + 1, t.title, t.assignee, t.manager, t.dueDate, t.evidence_required, t.system, t.action, JSON.stringify(t.dependencies.filter(p => ids.has(p)).map(p => ids.get(p))), t.key, at)),
    stmt(env, 'UPDATE wl_cases SET template_id=?,revision=? WHERE id=?', plan.template.id, newId(), plan.current.id),
    stmt(env, 'INSERT INTO wl_workflow_upgrades(id,case_id,from_template,to_template,actor,at,detail) VALUES(?,?,?,?,?,?,?)', newId(), plan.current.id, plan.current.template_id, plan.template.id, actor.id, at, JSON.stringify(review.detail)),
  ], { actor: actor.id, action: 'case.upgrade', subject: plan.current.id, detail: { review: review.id, from: plan.current.template_id, to: plan.template.id } })
  return { id: plan.current.id }
}

export async function failTask(env: Bindings, actor: Actor, input: Input) {
  const task = await one(env, 'SELECT * FROM wl_case_tasks WHERE id=?', input.text('task'))
  insist(task && task.status === 'open' && !task.superseded_at, 'task_not_open', 409)
  const current = (await one(env, 'SELECT * FROM wl_cases WHERE id=?', task.case_id))!
  insist(answersFor(actor, task, current), 'not_your_task', 403)
  const failure = input.text('failure', { max: 2000 })
  await commit(env, [guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_case_tasks WHERE id=? AND status='open' AND superseded_at IS NULL)", task.id),
    stmt(env, 'UPDATE wl_case_tasks SET failure=? WHERE id=?', failure, task.id), stmt(env, 'UPDATE wl_cases SET revision=? WHERE id=?', newId(), current.id)],
    { actor: actor.id, action: 'task.failed', subject: task.id, detail: { case: current.id } })
  return { id: current.id, status: 'open' }
}
