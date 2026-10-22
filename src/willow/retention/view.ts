// The retention doors' read models. The owner reads everything; HR reads only erasure
// requests (it may open them). No one else reads this.
import type { Bindings } from '../../auth.server'
import { can, requireOwner, type Actor } from '../actor'
import { all, auditRead, insist, json, one } from '../core'
import { isDate } from '../dates'
import { holds } from './holds'
import { providerRequests } from './providers'
import { previewApplicant } from './applicant'
import { expiringSoon } from './purge'
import { requests, previewErasure } from './erasure'
import { CLASSES, TABLE_VERSION } from './rules'
import { adoption, contractorStatus, mappings, stateRules } from './settings'

export async function retention(env: Bindings, actor: Actor, asOf = actor.today) {
  insist(isDate(asOf), 'invalid_asOf')
  insist(actor.owner || can(actor, 'people.manage'), 'forbidden', 403)
  const open = (await requests(env)).map(row => ({ id: row.id, person: { id: row.person_id ?? row.application_id, name: row.name }, applicant: !!row.application_id, source: row.source, receivedOn: row.received_on, status: row.status, receipt: row.receipt_id }))
  if (!actor.owner) return { requests: open }
  const mapped = await mappings(env)
  const label = (kind: string, ref: string) => mapped.get(`${kind}:${ref}`) ?? null
  const people = await all<{ id: string; name: string; ended: string | null }>(env, `SELECT p.id, p.legal_name AS name, MAX(e.end_date) AS ended FROM wl_people p JOIN wl_periods e ON e.person_id = p.id GROUP BY p.id HAVING SUM(e.end_date IS NULL OR e.end_date >= ?) = 0 ORDER BY p.legal_name`, actor.today)
  await auditRead(env, actor.id, 'retention.read', 'employer')
  return {
    tableVersion: TABLE_VERSION, classes: Object.entries(CLASSES).map(([key, value]) => ({ key, ...value })), adopted: await adoption(env),
    contractor: await contractorStatus(env, actor.today),
    workStates: (await all<{ state: string }>(env, 'SELECT DISTINCT work_state AS state FROM wl_locations WHERE work_state IS NOT NULL ORDER BY work_state')).map(row => row.state),
    states: await stateRules(env), holds: await holds(env),
    mappings: {
      documentCategories: (await all<{ id: string; name: string }>(env, 'SELECT id, name FROM wl_doc_categories ORDER BY name')).map(row => ({ ...row, class: label('document_category', row.id) })),
      customFields: (await all<{ id: string; key: string }>(env, 'SELECT id, key FROM wl_custom_fields ORDER BY key')).map(row => ({ ...row, class: label('custom_field', row.id) })),
      recordTables: (await all<{ id: string; key: string }>(env, 'SELECT id, key FROM wl_record_tables WHERE built_in = 0 ORDER BY key')).map(row => ({ ...row, class: label('record_table', row.id) })),
    },
    requests: open, former: people, expiring: await expiringSoon(env, asOf),
  }
}

export async function erasurePreview(env: Bindings, actor: Actor, url: URL) {
  requireOwner(actor)
  if (url.searchParams.has('application')) return await previewApplicant(env, actor, url.searchParams.get('application') ?? '')
  return await previewErasure(env, actor, url.searchParams.get('person') ?? '')
}

/** The value-free receipt of one erasure: counts and labels only. */
export async function erasureReceipt(env: Bindings, actor: Actor, id: string) {
  requireOwner(actor)
  const row = await one<Record<string, any>>(env, 'SELECT * FROM wl_erasure_receipts WHERE id = ?', id)
  insist(row, 'not_found', 404)
  const counts = json<{ store: string; table: string; disposition: string; class: string | null; expiry: string | null; hold: string | null; rows: number }[]>(row.counts_json, [])
  const approver = await one<{ name: string }>(env, 'SELECT name FROM wl_members WHERE id = ?', row.approved_by)
  await auditRead(env, actor.id, 'erasure.receipt.read', id)
  return { id: row.id, label: row.label, source: row.source, receivedOn: row.received_on, approvedBy: approver?.name ?? null, approvedAt: row.approved_at, digest: row.digest, counts,
    totals: Object.fromEntries(['erased', 'anonymized', 'redacted', 'retained', 'held'].map(kind => [kind, counts.filter(item => item.disposition === kind).reduce((sum, item) => sum + item.rows, 0)])),
    blobs: { total: row.blobs_total, bytes: row.blobs_bytes, deleted: row.blobs_deleted }, scrubbed: json(row.scrubbed_json, {}), copies: json(row.copies_json, {}), providerRequests: await providerRequests(env, id) }
}

/** Retained and held records in restricted custody: the owner alone reads them; EEO-class values also need eeo.individual. */
export async function retainedRecords(env: Bindings, actor: Actor) {
  requireOwner(actor)
  const rows = await all<{ id: number; erasure_id: string; store: string; table_name: string; class: string | null; rule: string | null; expiry: string | null; hold_id: string | null; row_json: string }>(env,
    'SELECT id, erasure_id, store, table_name, class, rule, expiry, hold_id, row_json FROM wl_retained_records ORDER BY erasure_id, store, id')
  const labels = new Map((await all<{ id: string; label: string }>(env, 'SELECT id, label FROM wl_erasure_receipts')).map(row => [row.id, row.label]))
  const mayRead = (cls: string | null) => cls !== 'eeo' || actor.permissions.has('eeo.individual')
  await auditRead(env, actor.id, 'retained.read', 'employer', { records: rows.length })
  return { records: rows.map(row => ({ id: row.id, person: labels.get(row.erasure_id) ?? 'Former person', store: row.store, table: row.table_name, class: row.class, rule: row.rule, expiry: row.expiry, hold: row.hold_id,
    values: mayRead(row.class) ? json<Record<string, unknown>>(row.row_json, {}) : null, restricted: mayRead(row.class) ? null : 'EEO compliance (eeo.individual) is required to read EEO values' })) }
}
