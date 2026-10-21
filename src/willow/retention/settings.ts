// Owner-only retention decisions. Each is an appended, audited version; the latest wins.
import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { all, commit, insist, now, one, stmt } from '../core'
import { isDate } from '../dates'
import type { Input } from '../input'
import { TABLE_VERSION, isClass, type Contractor } from './rules'

export const MAPPING_KINDS = ['document_category', 'custom_field', 'record_table'] as const
export type MappingKind = typeof MAPPING_KINDS[number]

export async function adoption(env: Bindings) {
  return await one<{ id: number; table_version: string; adopted_at: number }>(env, 'SELECT id, table_version, adopted_at FROM wl_retention_adoptions ORDER BY id DESC LIMIT 1')
}

/** The owner adopts the dated table once per version; adopting again records a fresh version. */
export async function adoptTable(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['version', 'returnTo'])
  insist(input.text('version', { max: 32 }) === TABLE_VERSION, 'unknown_table_version')
  const last = await adoption(env)
  await commit(env, [
    stmt(env, 'INSERT INTO wl_retention_adoptions (table_version, adopted_by, adopted_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM wl_retention_adoptions WHERE table_version = ?)', TABLE_VERSION, actor.id, now(), TABLE_VERSION),
  ], { actor: actor.id, action: 'retention.adopt', subject: 'employer', detail: { version: TABLE_VERSION, replaced: last?.table_version ?? null } })
  return { version: TABLE_VERSION }
}

/** The latest decision per work state and class. A state is confirmed once any decision exists. */
export async function stateRules(env: Bindings) {
  return await all<{ id: number; state: string; decision: string; class: string; years: number | null; citation: string | null; recorded_at: number }>(env,
    'SELECT id, state, decision, class, years, citation, recorded_at FROM wl_retention_states ORDER BY id')
}

export async function recordState(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['state', 'decision', 'class', 'years', 'citation', 'returnTo'])
  const state = input.text('state', { max: 2 }).toUpperCase()
  insist(/^[A-Z]{2}$/.test(state), 'invalid_state')
  const decision = input.text('decision', { max: 8 })
  insist(decision === 'none' || decision === 'longer', 'invalid_decision')
  const cls = input.text('class', { optional: true, max: 24 }) || 'all'
  insist(cls === 'all' || isClass(cls), 'invalid_class')
  let years: number | null = null, citation: string | null = null
  if (decision === 'longer') {
    years = input.integer('years', { min: 1, max: 99 })
    citation = input.text('citation', { max: 300 })
  }
  await commit(env, [stmt(env, 'INSERT INTO wl_retention_states (state, decision, class, years, citation, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', state, decision, cls, years, citation, actor.id, now())],
    { actor: actor.id, action: 'retention.state', subject: state, detail: { decision, class: cls, years } })
  return { state, decision }
}

/** Latest mapping per kind and reference. */
export async function mappings(env: Bindings): Promise<Map<string, string>> {
  const rows = await all<{ kind: string; ref: string; class: string }>(env, 'SELECT kind, ref, class FROM wl_retention_mappings ORDER BY id')
  return new Map(rows.map(row => [`${row.kind}:${row.ref}`, row.class]))
}

const REFS: Record<MappingKind, string> = { document_category: 'SELECT 1 FROM wl_doc_categories WHERE id = ?', custom_field: 'SELECT 1 FROM wl_custom_fields WHERE id = ?', record_table: 'SELECT 1 FROM wl_record_tables WHERE id = ? AND built_in = 0' }

export async function recordMapping(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['kind', 'ref', 'target', 'class', 'returnTo'])
  const [targetKind, targetRef] = input.text('target', { optional: true, max: 100 }).split(/:(.*)/s)
  const kind = (targetKind || input.text('kind', { max: 24 })) as MappingKind
  insist(MAPPING_KINDS.includes(kind), 'invalid_kind')
  const ref = targetRef || input.text('ref', { max: 64 }), cls = input.text('class', { max: 24 })
  insist(isClass(cls), 'invalid_class')
  insist(await one(env, REFS[kind], ref), 'not_found', 404)
  await commit(env, [stmt(env, 'INSERT INTO wl_retention_mappings (kind, ref, class, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?)', kind, ref, cls, actor.id, now())],
    { actor: actor.id, action: 'retention.map', subject: ref, detail: { kind, class: cls } })
  return { kind, ref, class: cls }
}

export async function contractorStatus(env: Bindings, date: string): Promise<Contractor> {
  const row = await one<{ contractor: number; covered: number }>(env, 'SELECT contractor, covered FROM wl_contractor_status WHERE effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1', date)
  return { contractor: !!row?.contractor, covered: !!row?.covered }
}

/** Dated and audited; federal-contractor status defaults to no. */
export async function recordContractor(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['contractor', 'covered', 'effectiveFrom', 'returnTo'])
  const contractor = input.flag('contractor'), covered = contractor && input.flag('covered')
  const effectiveFrom = input.text('effectiveFrom', { optional: true, max: 10 }) || actor.today
  insist(isDate(effectiveFrom), 'invalid_effectiveFrom')
  await commit(env, [stmt(env, 'INSERT INTO wl_contractor_status (contractor, covered, effective_from, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?)', contractor ? 1 : 0, covered ? 1 : 0, effectiveFrom, actor.id, now())],
    { actor: actor.id, action: 'retention.contractor', subject: 'employer', detail: { contractor, covered, effectiveFrom } })
  return { contractor, covered, effectiveFrom }
}

