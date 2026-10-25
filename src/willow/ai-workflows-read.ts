import type { Bindings } from '../auth.server'
import { requirePermission, type Actor } from './actor'
import { all, one } from './core'
import { auditSequence } from './workflow-review'
import { workflowStepApprovals } from './ai-workflows-approvals'
import { workflowRecipe } from './ai-workflows-impact'
import { workflowSourceChanged } from './ai-workflows-source'
import { workflowData, workflowRecord } from './ai-workflows-store'

export async function aiWorkflows(env: Bindings, actor: Actor) {
  requirePermission(actor, 'people.manage')
  return all(env, 'SELECT id,status,failure,model,template_id,review_id,created_at,published_at FROM wl_ai_workflows ORDER BY created_at DESC LIMIT 100')
}

export async function aiWorkflow(env: Bindings, actor: Actor, id: string) {
  requirePermission(actor, 'people.manage')
  const row = await workflowRecord(env, id), { source, edits, output } = workflowData(row)
  const review = row.review_id ? await one(env, 'SELECT detail,consumed_at FROM wl_workflow_reviews WHERE id=?', row.review_id) : null
  const detail = review ? JSON.parse(review.detail) : row.impact ? JSON.parse(row.impact) : null
  const approvals = await workflowStepApprovals(env, row)
  const gaps = [...JSON.parse(row.gaps), ...approvals.filter(step => !step.approvals.length).map(step => ({ code: `${step.authority}_step_approval_required`, position: step.position, detail: `A distinct member with current explicit ${step.authority === 'it' ? 'IT task' : 'payroll handoff'} authority must approve this exact step version.` }))]
  const stale = row.audit_seq !== null && row.audit_seq !== await auditSequence(env)
  const sourceStale = row.status !== 'published' && await workflowSourceChanged(env, source)
  const canReview = row.status === 'pending' && row.created_by === actor.id && !sourceStale && !gaps.length
  return { id: row.id, status: row.status, failure: row.failure, model: row.model, callId: row.call_id, responseId: row.response_id,
    source: { template: { id: source.template.id, name: source.template.name, version: source.template.version, kind: source.template.kind }, connections: source.connections },
    output, recipe: output ? workflowRecipe(source, output, edits) : [], impact: detail, approvals, revision: row.approval_revision,
    gaps, template: row.template_id, review: row.review_id, createdAt: row.created_at, stale, sourceStale,
    canReview, canPublish: canReview && !!row.review_id && !stale }
}
