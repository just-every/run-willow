import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { insist, one, stmt } from './core'
import { Input } from './input'
import { previewTemplate, publishTemplate } from './workflow-review'
import { requireStepApprovals } from './ai-workflows-approvals'
import { requireWorkflowSource, workflowAuthority } from './ai-workflows-source'
import { workflowData, workflowRecord } from './ai-workflows-store'

async function publicationReady(env: Bindings, actor: Actor, input: Input) {
  input.only(['workflow', 'returnTo'])
  const row = await workflowRecord(env, input.text('workflow', { max: 100 })), gaps = JSON.parse(row.gaps)
  insist(row.status !== 'blocked' && !gaps.length, 'workflow_unresolved_gaps', 409, { gaps })
  insist(row.status === 'pending' && row.template_id, 'workflow_not_pending', 409)
  insist(row.created_by === actor.id, 'workflow_reviewer_required', 403)
  await requireWorkflowSource(env, workflowData(row).source)
  await requireStepApprovals(env, row)
  return row
}

/** Refresh the exact native review after the signoff audit events. */
export async function previewAiWorkflow(env: Bindings, actor: Actor, input: Input) {
  actor = await workflowAuthority(env, actor)
  const row = await publicationReady(env, actor, input)
  const review = await previewTemplate(env, actor, Input.of({ template: row.template_id, asOf: row.as_of }))
  const saved = await one(env, 'SELECT audit_seq FROM wl_workflow_reviews WHERE id=?', review.id)
  await stmt(env, 'UPDATE wl_ai_workflows SET review_id=?,audit_seq=? WHERE id=?', review.id, saved!.audit_seq, row.id).run()
  return { id: row.id, review: review.id }
}

export async function publishAiWorkflow(env: Bindings, actor: Actor, input: Input) {
  actor = await workflowAuthority(env, actor)
  const row = await publicationReady(env, actor, input)
  insist(row.review_id, 'workflow_review_required', 409)
  // Native review consumption, current step authorities, source guards and the
  // published status all share the native publication transaction.
  const published = await publishTemplate(env, actor, Input.of({ review: row.review_id }))
  return { id: row.id, status: 'published', template: published.id }
}
