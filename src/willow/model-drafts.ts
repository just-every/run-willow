// Deliberately structured intake: no free-form prompt, employee context or task
// title can enter a model request, even when the owner makes it.
import { demoEffect } from '../modules/demo/index.mjs'
import type { Bindings } from '../auth.server'
import { requirePermission, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { connectionSettings } from './connections'

export async function modelAvailable(env: Bindings) {
  return !!(env.MODELS_ENDPOINT && env.MODELS_KEY && (await connectionSettings(env))?.model)
}

export async function draftSources(env: Bindings, actor: Actor) {
  requirePermission(actor, 'people.manage')
  return all(env, "SELECT id, name, kind, version FROM wl_templates WHERE status='active' ORDER BY name")
}

async function source(env: Bindings, id: string, deciding = false) {
  const template = await one(env, "SELECT id,version,kind FROM wl_templates WHERE id=? AND status='active'", id)
  insist(template, deciding ? 'proposal_stale' : 'template_not_found', deciding ? 409 : 404)
  const tasks = await all(env, 'SELECT position,assignee,due_offset_days,evidence_required,action FROM wl_template_tasks WHERE template_id=? ORDER BY position', id)
  return { id: template.id as string, version: template.version as number, kind: template.kind as string, tasks }
}

export async function createModelDraft(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['template', 'returnTo'])
  insist(await modelAvailable(env), 'model_not_configured', 409)
  const template = input.text('template', { max: 100 }), context = await source(env, template)
  const settings = (await connectionSettings(env))!, id = newId(), expected = JSON.stringify(context)
  await commit(env, [stmt(env, "INSERT INTO wl_model_drafts(id,template_id,source,model,status,proposed_by,proposed_at) VALUES(?,?,?,?,'failed',?,?)", id, template, expected, settings.model, actor.id, now())], { actor: actor.id, action: 'model.request', subject: id })
  let content: string
  try {
    const endpoint = new URL(env.MODELS_ENDPOINT!)
    insist(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && (endpoint.protocol === 'https:' || env.AUTH_LOCAL === 'true' && endpoint.protocol === 'http:' && ['localhost','127.0.0.1'].includes(endpoint.hostname)), 'invalid_models_endpoint')
    insist(endpoint.pathname === '/v1/chat/completions', 'invalid_models_endpoint')
    const response = await demoEffect(() => fetch(endpoint, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'content-type': 'application/json', authorization: `Bearer ${env.MODELS_KEY}`, 'x-models-feature': 'willow-checklist-draft' }, body: JSON.stringify({ model: settings.model, messages: [
      { role: 'system', content: 'Draft a lifecycle checklist for human review from the structured template. Return only JSON: {"source":{"id":string,"version":number},"items":[{"position":number,"text":string}]}. Cite the exact source id and version. Include each task position exactly once. Explain the assignee, deadline offset and evidence obligation without inventing systems, people, policy or actions. No employment decisions. Never claim an external task is done.' },
      { role: 'user', content: expected },
    ], temperature: 0 }) }), () => Response.json({ choices: [{ message: { content: JSON.stringify({
      source: { id: context.id, version: context.version },
      items: context.tasks.map(task => ({ position: task.position, text: `${task.assignee} reviews the task at day ${task.due_offset_days}; ${task.evidence_required ? 'record evidence before completion' : 'confirm completion in Willow'}.` })),
    }) } }] }))
    insist(response.ok, 'model_call_failed')
    const reader = response.body!.getReader(); let bytes = 0, text = ''; const decoder = new TextDecoder()
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 32_000) { await reader.cancel(); throw new Error() } text += decoder.decode(part.value, { stream: true }) }
    const body = JSON.parse(text), raw = body.choices?.[0]?.message?.content
    insist(typeof raw === 'string', 'invalid_model_payload')
    const draft = JSON.parse(raw)
    insist(draft.source?.id === context.id && draft.source?.version === context.version, 'model_citation_required')
    insist(Array.isArray(draft.items) && draft.items.length === context.tasks.length && new Set(draft.items.map((i: any) => i.position)).size === context.tasks.length, 'invalid_model_payload')
    insist(draft.items.every((i: any) => context.tasks.some(t => t.position === i.position) && typeof i.text === 'string' && i.text.trim().length > 0 && i.text.length <= 1200), 'invalid_model_payload')
    content = JSON.stringify({ source: { id: context.id, version: context.version }, items: draft.items.map((i: any) => ({ position: i.position, text: i.text })) })
  } catch (error) {
    const code = error instanceof Error && ['model_call_failed','invalid_model_payload','model_citation_required','invalid_models_endpoint'].includes(error.message) ? error.message : 'model_call_failed'
    await stmt(env, 'UPDATE wl_model_drafts SET failure=? WHERE id=?', code, id).run()
    return { id, status: 'failed', failure: code }
  }
  await stmt(env, "UPDATE wl_model_drafts SET status='pending', content=? WHERE id=?", content, id).run()
  return { id, status: 'pending' }
}

export async function modelDrafts(env: Bindings, actor: Actor) {
  requirePermission(actor, 'people.manage')
  return all(env, 'SELECT id,template_id,model,status,failure,proposed_at FROM wl_model_drafts ORDER BY proposed_at DESC')
}
export async function modelDraft(env: Bindings, actor: Actor, id: string): Promise<import('./core').Row> {
  requirePermission(actor, 'people.manage')
  const row = await one(env, 'SELECT * FROM wl_model_drafts WHERE id=?', id)
  insist(row, 'not_found', 404)
  return { ...row, content: row.content ? JSON.parse(row.content) : null, source: JSON.parse(row.source) }
}
export async function decideModelDraft(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const draft = await modelDraft(env, actor, input.text('proposal')), decision = input.text('decision')
  insist(decision === 'accept' || decision === 'decline', 'invalid_decision')
  insist(draft.status === 'pending', 'proposal_decided', 409)
  const checks = [guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_model_drafts WHERE id=? AND status='pending')", draft.id)]
  if (decision === 'accept') {
    insist(JSON.stringify(await source(env, draft.template_id, true)) === JSON.stringify(draft.source), 'proposal_stale', 409)
    checks.push(guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_templates WHERE id=? AND status='active' AND version=?)", draft.template_id, draft.source.version))
  }
  await commit(env, [...checks, stmt(env, 'UPDATE wl_model_drafts SET status=?,decided_by=?,decided_at=? WHERE id=?', decision === 'accept' ? 'accepted' : 'declined', actor.id, now(), draft.id)], { actor: actor.id, action: `model.${decision}`, subject: draft.id })
  return { id: draft.id, status: decision === 'accept' ? 'accepted' : 'declined' }
}
