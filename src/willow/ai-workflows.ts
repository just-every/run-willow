import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { aiSettings, callModel } from './ai-provider'
import { commit, guard, insist, newId, now, one, stmt, WillowError } from './core'
import { requireDate } from './dates'
import { Input } from './input'
import { auditSequence, previewTemplate } from './workflow-review'
import { expectedWorkflow, workflowRequest, WORKFLOW_INSTRUCTION } from './ai-workflows-intake'
import { workflowGaps, workflowImpact } from './ai-workflows-impact'
import { requireWorkflowSource, workflowAuthority, workflowAuthorityGuard, workflowSource } from './ai-workflows-source'
import { validateWorkflowOutput } from './ai-workflows-types'
import { workflowTemplate } from './ai-workflows-template'
export { aiWorkflow, aiWorkflows } from './ai-workflows-read'
export { publishAiWorkflow, previewAiWorkflow } from './ai-workflows-publication'
export { workflowStepApprove, aiWorkflowApprovals } from './ai-workflows-approvals'

export async function createAiWorkflowDraft(env: Bindings, actor: Actor, input: Input) {
  actor = await workflowAuthority(env, actor)
  input.only(['template', 'request', 'asOf', 'returnTo'])
  const settings = await aiSettings(env)
  insist(settings.enabled && settings.workflows, 'ai_disabled', 409)
  const source = await workflowSource(env, input.text('template', { max: 100 }))
  const edits = workflowRequest(input.text('request', { max: 12000 }), source)
  const expected = expectedWorkflow(source, edits), date = requireDate(input.text('asOf', { optional: true }) || actor.today, 'invalid_asOf')
  const id = newId()
  await commit(env, [workflowAuthorityGuard(env, actor), stmt(env, `INSERT INTO wl_ai_workflows(id,source_snapshot,normalized_request,status,failure,as_of,created_by,created_at) VALUES(?,?,?,'failed','ai_request_incomplete',?,?,?)`, id, JSON.stringify(source), JSON.stringify(edits), date, actor.id, now())], { actor: actor.id, action: 'workflow.request', subject: id })
  try {
    // Exactly the proposed structural plan crosses the network. Template names,
    // task titles, system labels, original prose and all person data stay local.
    const result = await callModel(env, actor, 'willow-workflow-draft', expected, WORKFLOW_INSTRUCTION)
    const output = validateWorkflowOutput(result.value, expected)
    actor = await workflowAuthority(env, actor)
    await requireWorkflowSource(env, source)
    const gaps = workflowGaps(source, output)
    const sequence = await auditSequence(env)
    const template = gaps.length ? null : await workflowTemplate(env, actor, source, output, edits)
    const impact = gaps.length ? await workflowImpact(env, actor, source, output, edits, date) : null
    await requireWorkflowSource(env, source)
    await commit(env, [workflowAuthorityGuard(env, actor), guard(env, 'workflow_source_stale', '(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?', sequence),
      ...(template?.statements ?? []),
      stmt(env, `UPDATE wl_ai_workflows SET output=?,impact=?,gaps=?,status=?,failure=NULL,model=?,call_id=?,response_id=?,template_id=?,audit_seq=?,approval_revision=? WHERE id=? AND output IS NULL`, JSON.stringify(output), impact ? JSON.stringify(impact) : null, JSON.stringify(gaps), gaps.length ? 'blocked' : 'pending', result.model, result.callId, result.responseId, template?.id ?? null, sequence + (template ? 2 : 1), newId(), id)],
    [...(template ? [{ actor: actor.id, action: 'template.create', subject: template.id, detail: { family: template.family, version: template.version, kind: source.template.kind, tasks: output.steps.length } }] : []),
      { actor: actor.id, action: 'workflow.draft', subject: id, detail: { source: source.template.id, version: source.template.version, call: result.callId, status: gaps.length ? 'blocked' : 'pending' } }])
    if (template) {
      const review = await previewTemplate(env, actor, Input.of({ template: template.id, asOf: date }))
      const saved = await one(env, 'SELECT audit_seq FROM wl_workflow_reviews WHERE id=?', review.id)
      await stmt(env, 'UPDATE wl_ai_workflows SET review_id=?,audit_seq=? WHERE id=?', review.id, saved!.audit_seq, id).run()
    }
    return { id, status: gaps.length ? 'blocked' : 'pending', template: template?.id ?? null, gaps }
  } catch (error) {
    // Store fixed machine failure codes, never provider text or raw output.
    const failure = error instanceof WillowError ? error.code : 'workflow_draft_failed'
    await stmt(env, "UPDATE wl_ai_workflows SET status='failed',failure=? WHERE id=? AND status<>'published'", failure, id).run()
    return { id, status: 'failed', failure }
  }
}
