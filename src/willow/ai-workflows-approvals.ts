import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { freshAiActor } from './ai-provider'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import type { Input } from './input'
import { auditSequence } from './workflow-review'
import { workflowRecipe } from './ai-workflows-impact'
import { requireWorkflowSource, workflowSourceChanged } from './ai-workflows-source'
import { workflowData, workflowRecord } from './ai-workflows-store'

export async function workflowStepApprovals(env: Bindings, row: Row) {
  const requirements = await all(env, 'SELECT position,authority FROM wl_ai_workflow_step_requirements WHERE workflow_id=? ORDER BY position,authority', row.id)
  const sourceStale = row.status !== 'published' && requirements.length > 0 && await workflowSourceChanged(env, workflowData(row).source)
  const receipts = sourceStale ? [] : await all(env, 'SELECT position,authority,approved_by,approved_at,approver_name FROM wl_ai_workflow_valid_step_approvals WHERE workflow_id=? ORDER BY approved_at', row.id)
  return requirements.map(required => ({ position: required.position as number, authority: required.authority as string,
    approvals: receipts.filter(receipt => receipt.position === required.position && receipt.authority === required.authority).map(receipt => ({ member: receipt.approved_by, name: receipt.approver_name, at: receipt.approved_at })) }))
}

export async function requireStepApprovals(env: Bindings, row: Row) {
  const missing = (await workflowStepApprovals(env, row)).filter(step => !step.approvals.length)
  insist(!missing.length, 'workflow_step_approval_required', 409, { missing: missing.map(step => ({ position: step.position, authority: step.authority })) })
}

async function explicitAuthorities(env: Bindings, actor: Actor): Promise<string[]> {
  return (await all(env, "SELECT permission FROM wl_effective_permissions WHERE member_id=? AND permission IN ('it.tasks','payroll.handoff')", actor.id)).map(row => row.permission === 'it.tasks' ? 'it' : 'payroll')
}

/** The privileged reviewer receives the typed graph, never a person projection. */
export async function aiWorkflowApprovals(env: Bindings, actor: Actor) {
  actor = await freshAiActor(env, actor)
  const authorities = await explicitAuthorities(env, actor)
  if (!authorities.length) return []
  const rows = await all(env, "SELECT * FROM wl_ai_workflows WHERE status IN ('pending','blocked') AND output IS NOT NULL AND created_by<>? ORDER BY created_at DESC LIMIT 100", actor.id)
  const result = []
  for (const row of rows) {
    const requirements = await workflowStepApprovals(env, row)
    if (!requirements.some(step => authorities.includes(step.authority))) continue
    const { source, output, edits } = workflowData(row)
    const sourceStale = await workflowSourceChanged(env, source)
    result.push({ id: row.id, status: row.status, revision: row.approval_revision,
      source: { id: source.template.id, version: source.template.version, connectionRevision: source.connections.revision },
      recipe: workflowRecipe(source, output!, edits).map(step => ({ position: step.position, assignee: step.assignee, dueOffsetDays: step.dueOffsetDays,
        conditions: { ...(step.conditions.workState ? { workState: step.conditions.workState } : {}), ...(step.conditions.employmentType ? { employmentType: step.conditions.employmentType } : {}) },
        sourceConditionsWithheld: !!(step.conditions.jobTitle || step.conditions.location), dependencies: step.dependencies,
        approvalGate: step.approvalGate, evidenceRequired: step.evidenceRequired, connectorSource: step.connectorSource, action: step.action })), sourceStale, gaps: JSON.parse(row.gaps),
      steps: requirements.map(step => ({ position: step.position, authority: step.authority, approved: !!step.approvals.length,
        canApprove: !sourceStale && row.status === 'pending' && authorities.includes(step.authority) && !step.approvals.some(receipt => receipt.member === actor.id) })) })
  }
  return result
}

export async function workflowStepApprove(env: Bindings, actor: Actor, input: Input) {
  actor = await freshAiActor(env, actor)
  input.only(['workflow', 'position', 'authority', 'revision', 'returnTo'])
  const row = await workflowRecord(env, input.text('workflow', { max: 100 }))
  const position = input.integer('position', { min: 1, max: 40 }), authority = input.text('authority', { max: 20 })
  insist(row.status === 'pending' && row.output && row.approval_revision, 'workflow_not_pending', 409)
  insist(actor.id !== row.created_by, 'workflow_distinct_step_reviewer_required', 403)
  insist(input.text('revision', { max: 100 }) === row.approval_revision, 'workflow_source_stale', 409)
  insist((await explicitAuthorities(env, actor)).includes(authority), 'workflow_step_authority_required', 403)
  insist(await one(env, 'SELECT 1 FROM wl_ai_workflow_step_requirements WHERE workflow_id=? AND position=? AND authority=?', row.id, position, authority), 'workflow_step_not_required')
  const sequence = await auditSequence(env)
  await requireWorkflowSource(env, workflowData(row).source)
  const permission = authority === 'it' ? 'it.tasks' : 'payroll.handoff'
  await commit(env, [guard(env, 'workflow_source_stale', '(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=? AND EXISTS(SELECT 1 FROM wl_ai_workflows WHERE id=? AND status=\'pending\' AND approval_revision=?)', sequence, row.id, row.approval_revision),
    guard(env, 'workflow_step_authority_changed', `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email) JOIN wl_effective_permissions p ON p.member_id=m.id AND p.permission=? WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`, permission, actor.sessionId, actor.id, now()),
    guard(env, 'workflow_step_already_approved', 'NOT EXISTS(SELECT 1 FROM wl_ai_workflow_valid_step_approvals WHERE workflow_id=? AND position=? AND authority=? AND approved_by=?)', row.id, position, authority, actor.id),
    stmt(env, 'INSERT INTO wl_ai_workflow_step_approvals(id,workflow_id,position,authority,revision,approved_by,approved_at) VALUES(?,?,?,?,?,?,?)', newId(), row.id, position, authority, row.approval_revision, actor.id, now())],
  { actor: actor.id, action: 'workflow.step.approve', subject: row.id, detail: { position, authority, revision: row.approval_revision } })
  return { id: row.id, position, authority, status: 'approved' }
}
