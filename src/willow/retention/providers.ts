// Tracked provider deletion requests: one per outside destination Willow handed the person's data to.
// They are owner-assigned FLOW-002 work. An outcome needs evidence: deleted, retained by the provider with
// its stated reason or expiry, or failed. Failed and unanswered requests stay open.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, commit, insist, one, stmt } from '../core'
import { isDate } from '../dates'
import type { Input } from '../input'

export const OUTCOMES = ['deleted', 'retained', 'failed'] as const

export async function providerRequests(env: Bindings, erasureId?: string) {
  return (await all<{ id: string; erasure_id: string; provider: string; copies: number; assignee: string; status: string; evidence: string | null; reason: string | null; expiry: string | null; due_date: string }>(env,
    `SELECT id, erasure_id, provider, copies, assignee, status, evidence, reason, expiry, due_date FROM wl_provider_requests ${erasureId ? 'WHERE erasure_id = ?' : ''} ORDER BY opened_at, id`, ...(erasureId ? [erasureId] : [])))
    .map(row => ({ id: row.id, erasure: row.erasure_id, provider: row.provider, copies: row.copies, assignee: row.assignee, status: row.status, open: row.status === 'open' || row.status === 'failed', evidence: row.evidence, reason: row.reason, expiry: row.expiry, dueDate: row.due_date }))
}

/** The assignee, or the owner, records what the provider answered. Retained needs the provider's reason; deleted and failed need evidence. */
export async function recordProviderOutcome(env: Bindings, actor: Actor, input: Input) {
  input.only(['request', 'outcome', 'evidence', 'reason', 'expiry', 'returnTo'])
  const id = input.text('request', { max: 64 }), outcome = input.text('outcome', { max: 12 })
  insist((OUTCOMES as readonly string[]).includes(outcome), 'invalid_outcome')
  const row = await one<{ assignee: string; status: string }>(env, 'SELECT assignee, status FROM wl_provider_requests WHERE id = ?', id)
  insist(row, 'not_found', 404)
  insist(actor.owner || actor.id === row.assignee, 'forbidden', 403)
  insist(row.status === 'open' || row.status === 'failed', 'request_closed', 409)
  const evidence = input.text('evidence', { max: 500 })
  const reason = input.text('reason', { optional: true, max: 300 }) || null, expiry = input.text('expiry', { optional: true, max: 10 }) || null
  insist(outcome !== 'retained' || !!reason || !!expiry, 'missing_reason')
  insist(expiry === null || isDate(expiry), 'invalid_expiry')
  await commit(env, [stmt(env, "UPDATE wl_provider_requests SET status = ?, evidence = ?, reason = ?, expiry = ?, recorded_by = ?, recorded_at = ? WHERE id = ? AND status IN ('open', 'failed')", outcome, evidence, reason, expiry, actor.id, Date.now(), id)],
    { actor: actor.id, action: 'erasure.provider', subject: id, detail: { outcome } })
  return { id, status: outcome }
}
