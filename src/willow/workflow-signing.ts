// Lifecycle assignments never confer signing authority or stand in for signatures.
import type { Bindings } from '../auth.server'
import { can, requirePermission, type Actor } from './actor'
import { readsCategory } from './access'
import { all, commit, guard, insist, json, newId, now, one, stmt, type Row } from './core'
import { Input } from './input'
import { directory } from './profile'
import { selectedPeriods } from './employment'
import { serve } from './files'
import { signatureTemplates } from './sign/templates'
import { previewSignatures, sendSignatures, signatureRequest } from './sign/requests'
import { blockedBy } from './workflow-plan'
import type { SignatureStep } from './workflow-rules'
import { workflowAuthorityGuard } from './ai-workflows-source'

export async function validateSignatureStep(env: Bindings, actor: Actor, step: SignatureStep) {
  requirePermission(actor, 'people.manage')
  const template = (await signatureTemplates(env, actor)).find(t => t.id === step.template)
  insist(template?.approvedAt && template.current, 'signature_approved_template_required', 409)
  const counter = await one(env, `SELECT m.id,m.name FROM wl_members m WHERE m.id=? AND m.status='active' AND
    (EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission='people.manage') OR
     EXISTS(SELECT 1 FROM oa_operators o WHERE lower(o.email)=m.email AND o.role='owner' AND o.status='active'))`, step.hr)
  insist(counter, 'signature_hr_required')
  return { template, counter }
}

/** The planner key is immutable case custody, including the complete signing recipe. */
export function taskSignature(task: Row): SignatureStep | undefined {
  return json<any[]>(task.source_task, [])[6]?.signature
}

export async function mayReadSigningEvidence(env: Bindings, actor: Actor, task: Row) {
  if (task.action !== 'signature') return true
  if (!can(actor, 'people.manage')) return false
  const rows = await all(env, `SELECT r.person_id,c.* FROM wl_workflow_signatures w JOIN wl_sign_requests r ON r.cohort=w.review_id
    JOIN wl_sign_templates t ON t.id=r.template_id JOIN wl_doc_categories c ON c.id=t.category_id WHERE w.task_id=? AND w.issued_at IS NOT NULL`, task.id)
  return rows.length > 0 && rows.every(row => readsCategory(actor, row.person_id, row))
}

/** Named planning information only; exact rendered bytes get a separate issue review. */
export async function signingAssignment(env: Bindings, actor: Actor, step: SignatureStep, person: string) {
  const { template, counter } = await validateSignatureStep(env, actor, step)
  const people = await directory(env, actor)
  const periods = step.cohortKind === 'employment_type' ? await selectedPeriods(env, actor.today) : new Map()
  const levels = step.cohortKind === 'access_level' ? await all(env, "SELECT m.person_id FROM wl_member_levels l JOIN wl_members m ON m.id=l.member_id WHERE l.level_id=? AND m.status='active'", step.cohortValue) : []
  const recipients = people.filter(p => p.status === 'active' && (
    step.cohortKind === 'named' ? p.id === person :
    step.cohortKind === 'location' ? p.location?.id === step.cohortValue :
    step.cohortKind === 'department' ? p.department?.id === step.cohortValue :
    step.cohortKind === 'employment_type' ? periods.get(p.id)?.employment_type === step.cohortValue :
    step.cohortKind === 'access_level' ? levels.some(m => m.person_id === p.id) : true))
  return { action: 'signature.send', provider: 'native', template: { id: template.id, version: template.version, title: template.title, digest: template.digest },
    category: template.category, countersigner: counter, cohortKind: step.cohortKind, cohortValue: step.cohortValue,
    recipients: recipients.map(p => ({ id: p.id, name: p.name })), outbound: false }
}

async function openSigningTask(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const task = await one(env, 'SELECT * FROM wl_case_tasks WHERE id=?', input.text('task', { max: 100 }))
  insist(task?.action === 'signature' && task.status === 'open' && !task.superseded_at, 'signature_task_not_open', 409)
  const current = await one(env, 'SELECT * FROM wl_cases WHERE id=?', task.case_id)
  insist(current?.status === 'open', 'case_already_completed', 409)
  insist(!(await blockedBy(env, task)).length, 'dependencies_open', 409)
  const step = taskSignature(task)
  insist(step, 'signature_task_invalid', 409)
  return { task, current, step }
}

function taskGuards(env: Bindings, actor: Actor, task: Row, current: Row) {
  return [workflowAuthorityGuard(env, actor),
    guard(env, 'signature_task_changed', "EXISTS(SELECT 1 FROM wl_case_tasks WHERE id=? AND status='open' AND superseded_at IS NULL AND source_task=?)", task.id, task.source_task),
    guard(env, 'signature_task_changed', "EXISTS(SELECT 1 FROM wl_cases WHERE id=? AND revision=? AND status='open')", current.id, current.revision),
    guard(env, 'dependencies_open', "NOT EXISTS(SELECT 1 FROM wl_case_tasks d JOIN json_each(?) j ON d.id=j.value WHERE d.status<>'done' AND d.superseded_at IS NULL)", task.dependencies)]
}

export async function previewWorkflowSignatures(env: Bindings, actor: Actor, input: Input) {
  input.only(['task', 'expiryDays', 'returnTo'])
  const { task, current, step } = await openSigningTask(env, actor, input)
  insist(!await one(env, 'SELECT 1 FROM wl_workflow_signatures WHERE task_id=? AND issued_at IS NOT NULL', task.id), 'signature_task_already_issued', 409)
  const review = await previewSignatures(env, actor, Input.of({ template: step.template, hr: step.hr,
    ...(step.cohortKind === 'named' ? { people: [current.person_id] } : { cohortKind: step.cohortKind, cohortValue: step.cohortValue }),
    expiryDays: input.integer('expiryDays', { min: 1, max: 90, optional: true }) ?? 7 }))
  await commit(env, [...taskGuards(env, actor, task, current),
    stmt(env, 'INSERT INTO wl_workflow_signatures(review_id,task_id,case_revision) VALUES(?,?,?)', review.id, task.id, current.revision)],
  { actor: actor.id, action: 'task.signature.preview', subject: task.id, detail: { case: current.id, review: review.id, template: step.template } })
  return { ...review, task: task.id, case: current.id, action: 'signature.send', provider: 'native', outbound: false }
}

export async function issueWorkflowSignatures(env: Bindings, actor: Actor, input: Input) {
  input.only(['task', 'review', 'digest', 'approved', 'returnTo'])
  const { task, current, step } = await openSigningTask(env, actor, input)
  const review = input.text('review', { max: 100 })
  const binding = await one(env, 'SELECT w.*,r.snapshot FROM wl_workflow_signatures w JOIN wl_sign_reviews r ON r.id=w.review_id WHERE w.review_id=? AND w.task_id=?', review, task.id)
  insist(binding && !binding.issued_at && binding.case_revision === current.revision, 'signature_task_changed', 409)
  const snapshot = json<any>(binding.snapshot, {})
  insist(snapshot.template === step.template && snapshot.hr === step.hr && snapshot.cohortKind === step.cohortKind && snapshot.cohortValue === step.cohortValue &&
    (step.cohortKind !== 'named' || snapshot.recipients.length === 1 && snapshot.recipients[0].id === current.person_id), 'signature_task_changed', 409)
  const sent = await sendSignatures(env, actor, Input.of({ review, digest: input.text('digest', { max: 64 }), approved: input.flag('approved') }), [
    ...taskGuards(env, actor, task, current),
    guard(env, 'signature_task_already_issued', 'NOT EXISTS(SELECT 1 FROM wl_workflow_signatures WHERE task_id=? AND issued_at IS NOT NULL)', task.id),
    stmt(env, 'UPDATE wl_workflow_signatures SET issued_at=? WHERE review_id=?', now(), review),
    stmt(env, 'UPDATE wl_cases SET revision=? WHERE id=?', newId(), current.id),
  ])
  return { ...sent, task: task.id, case: current.id, status: 'open' }
}

export async function verifyWorkflowSignatures(env: Bindings, actor: Actor, input: Input) {
  input.only(['task', 'returnTo'])
  const { task, current } = await openSigningTask(env, actor, input)
  const binding = await one(env, 'SELECT * FROM wl_workflow_signatures WHERE task_id=? AND issued_at IS NOT NULL', task.id)
  insist(binding, 'signature_task_not_issued', 409)
  const sequence = (await one(env, 'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
  const requests = await all(env, 'SELECT r.*,v.sha256,v.size,v.filename,v.media_type FROM wl_sign_requests r LEFT JOIN wl_document_versions v ON v.id=r.sealed_version AND v.document_id=r.document_id WHERE r.cohort=? ORDER BY r.person_id', binding.review_id)
  const snapshot = json<any>((await one(env, 'SELECT snapshot FROM wl_sign_reviews WHERE id=?', binding.review_id))?.snapshot, {})
  insist(requests.length > 0 && requests.length === snapshot.recipients?.length, 'signature_completion_required', 409)
  const evidence = []
  for (const row of requests) {
    const detail = await signatureRequest(env, actor, row.id)
    insist(detail.state === 'signed' && row.sealed_version && row.sha256 === row.rendered_sha256 && detail.certificate?.sha256 === row.sha256, 'signature_completion_required', 409)
    // Reading the sealed bytes checks actual custody; evidence text cannot replace it.
    await serve(env, { sha256: row.sha256, size: row.size, filename: row.filename, mediaType: row.media_type })
    evidence.push({ request: row.id, person: row.person_id, version: row.sealed_version, sha256: row.sha256 })
  }
  await commit(env, [...taskGuards(env, actor, task, current),
    guard(env, 'signature_inputs_changed', '(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?', sequence),
    guard(env, 'signature_completion_required', "NOT EXISTS(SELECT 1 FROM wl_sign_requests WHERE cohort=? AND (state<>'signed' OR sealed_version IS NULL OR certificate IS NULL))", binding.review_id),
    stmt(env, "UPDATE wl_case_tasks SET status='done',failure=NULL,evidence=?,completed_by=?,completed_at=? WHERE id=?", JSON.stringify({ cohort: binding.review_id, records: evidence }), actor.id, now(), task.id),
    stmt(env, 'UPDATE wl_workflow_signatures SET verified_at=? WHERE review_id=?', now(), binding.review_id),
    stmt(env, 'UPDATE wl_cases SET revision=? WHERE id=?', newId(), current.id)],
  { actor: actor.id, action: 'task.signature.verify', subject: task.id, detail: { case: current.id, cohort: binding.review_id, records: evidence } })
  return { id: task.id, case: current.id, status: 'done', records: evidence }
}
