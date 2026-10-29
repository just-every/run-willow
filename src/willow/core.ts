// Shared primitives: typed errors, ids, D1 helpers, audited atomic commits and
// in-batch preconditions (wl_guard rows abort the whole batch when false).
import type { Bindings } from '../auth.server'
import { agentAttribution } from './agent-attribution'

export class WillowError extends Error {
  constructor(readonly code: string, readonly status = 400, readonly detail?: unknown) {
    super(code)
  }
}

export function insist(condition: unknown, code: string, status = 400, detail?: unknown): asserts condition {
  if (!condition) throw new WillowError(code, status, detail)
}

export const newId = () => crypto.randomUUID()
export const now = () => Date.now()

export type Row = Record<string, any>

export async function one<T = Row>(env: Bindings, sql: string, ...params: unknown[]): Promise<T | null> {
  return await env.DB.prepare(sql).bind(...params).first<T>()
}

export async function all<T = Row>(env: Bindings, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await env.DB.prepare(sql).bind(...params).all<T>()).results
}

export const stmt = (env: Bindings, sql: string, ...params: unknown[]) => env.DB.prepare(sql).bind(...params)

/** A precondition evaluated inside the batch: `condition` is a scalar SQL boolean. */
export const guard = (env: Bindings, code: string, condition: string, ...params: unknown[]) =>
  stmt(env, `INSERT INTO wl_guard (code, ok) SELECT ?, CASE WHEN (${condition}) THEN 1 ELSE 0 END`, code, ...params)

export interface Audit { actor: string; action: string; subject: string; detail?: unknown }

/** Runs the statements atomically with an audit event in the same batch. A failed guard raises its code. */
export async function commit(env: Bindings, statements: D1PreparedStatement[], audit: Audit | Audit[]) {
  const events = Array.isArray(audit) ? audit : [audit]
  const agent = agentAttribution(env)
  try {
    await env.DB.batch([
      ...statements,
      stmt(env, 'DELETE FROM wl_guard'),
      ...events.map(event => stmt(env, 'INSERT INTO wl_audit (at, actor, action, subject, detail, agent_id, agent_name, operation_id, approvers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', now(), event.actor, event.action, event.subject, JSON.stringify(event.detail ?? {}), agent?.agent.id ?? null, agent?.actor.label ?? null, agent?.operationId ?? null, agent ? JSON.stringify(agent.approvers) : null)),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = message.match(/willow_guard_(\w+)/)?.[1]
    if (code) throw new WillowError(code === 'failed' ? 'precondition_failed' : code, 409)
    if (/willow_immutable|willow_ledger_append_only/.test(message)) throw new WillowError('record_is_immutable', 409)
    if (/UNIQUE constraint failed: wl_ledger|UNIQUE constraint failed: wl_payroll_items/.test(message)) throw new WillowError('stale', 409)
    throw error
  }
}

/** Records a read of private data. Reads of private fields are always audited. */
export async function auditRead(env: Bindings, actor: string, action: string, subject: string, detail?: unknown) {
  const agent = agentAttribution(env)
  await env.DB.prepare('INSERT INTO wl_audit (at, actor, action, subject, detail, agent_id, agent_name, operation_id, approvers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(now(), actor, action, subject, JSON.stringify(detail ?? {}), agent?.agent.id ?? null, agent?.actor.label ?? null, agent?.operationId ?? null, agent ? JSON.stringify(agent.approvers) : null).run()
}

export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export const json = <T = unknown>(text: string | null | undefined, fallback: T): T => {
  if (!text) return fallback
  try { return JSON.parse(text) as T } catch { return fallback }
}
