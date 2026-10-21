// DATA-002 erasure requests and the read-only preview. The preview classifies every store in
// the inventory for one former worker, binds the result in a digest, and writes nothing but
// its audit row. The owner confirms that digest; a changed preview is refused as stale.
import type { Bindings } from '../../auth.server'
import { can, employerZone, requireOwner, type Actor } from '../actor'
import { all, auditRead, commit, guard, insist, newId, now, one, sha256Hex, stmt, WillowError } from '../core'
import { isDate, today as dayOf } from '../dates'
import type { Input } from '../input'
import { holds, type Hold } from './holds'
import { AUTHORED_STORES, DYNAMIC, OUT_OF_SCOPE, STORES, type Store } from './inventory'
import { CLASSES, TABLE_VERSION, classExpiry, type ClassKey, type Contractor } from './rules'
import { adoption, contractorStatus, mappings, stateRules } from './settings'

export const SOURCES = ['own_request', 'retention_expiry', 'counsel', 'other'] as const

export async function openRequest(env: Bindings, actor: Actor, input: Input) {
  insist(can(actor, 'people.manage'), 'forbidden', 403)
  input.only(['person', 'source', 'receivedOn', 'returnTo'])
  const person = input.text('person', { max: 64 }), source = input.text('source', { max: 24 }), receivedOn = input.text('receivedOn', { max: 10 })
  insist((SOURCES as readonly string[]).includes(source), 'invalid_source')
  insist(isDate(receivedOn) && receivedOn <= actor.today, 'invalid_receivedOn')
  insist(await one(env, 'SELECT 1 FROM wl_people WHERE id = ?', person), 'not_found', 404)
  insist(!await one(env, "SELECT 1 FROM wl_erasure_requests WHERE person_id = ? AND status IN ('open', 'confirmed')", person), 'request_exists', 409)
  const id = newId()
  await commit(env, [
    guard(env, 'request_exists', "NOT EXISTS (SELECT 1 FROM wl_erasure_requests WHERE person_id = ? AND status IN ('open', 'confirmed'))", person),
    stmt(env, 'INSERT INTO wl_erasure_requests (id, person_id, source, received_on, requested_by, requested_at) VALUES (?, ?, ?, ?, ?, ?)', id, person, source, receivedOn, actor.id, now()),
  ], { actor: actor.id, action: 'erasure.request', subject: id, detail: { person, source, receivedOn } })
  return { id }
}

export async function withdrawRequest(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['request', 'returnTo'])
  const id = input.text('request', { max: 64 })
  insist(await one(env, 'SELECT 1 FROM wl_erasure_requests WHERE id = ?', id), 'not_found', 404)
  await commit(env, [stmt(env, "UPDATE wl_erasure_requests SET status = 'withdrawn' WHERE id = ? AND status IN ('open', 'confirmed')", id)], { actor: actor.id, action: 'erasure.withdraw', subject: id })
  return { id }
}

export async function requests(env: Bindings) {
  return await all<{ id: string; person_id: string; name: string; source: string; received_on: string; status: string; requested_at: number }>(env,
    `SELECT r.id, r.person_id, p.legal_name AS name, r.source, r.received_on, r.status, r.requested_at FROM wl_erasure_requests r JOIN wl_people p ON p.id = r.person_id ORDER BY r.requested_at DESC`)
}

export interface Item { id: string; table: string; label: string; disposition: 'erased' | 'anonymized' | 'redacted' | 'retained' | 'held'; class: ClassKey | null; rule: string | null; expiry: string | null; hold: string | null; rows: number; blobs: number; bytes: number }
export interface Blocker { kind: string; ref: string; reason: string }

/** Every table that exists must be classified. A new migration that adds a store fails here, not silently. */
async function inventoryCoverage(env: Bindings) {
  const known = new Set([...STORES, ...AUTHORED_STORES].map(store => store.table).concat(DYNAMIC))
  const tables = (await all<{ name: string }>(env, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'")).map(row => row.name)
  const missing = tables.filter(name => !known.has(name) && !OUT_OF_SCOPE.has(name))
  insist(!missing.length, 'inventory_incomplete', 409, { tables: missing })
  return tables.length
}

interface Subject { personId: string; memberId: string; workEmail: string; employeeNumber: string; memberEmail: string }
const bindFor = (sql: string, subject: Subject) => {
  const max = Math.max(...[...sql.matchAll(/\?(\d)/g)].map(match => Number(match[1])))
  return [subject.personId, subject.memberId, subject.workEmail, subject.employeeNumber, subject.memberEmail].slice(0, max)
}

async function measure(env: Bindings, store: Pick<Store, 'from' | 'ms' | 'date' | 'blob'>, subject: Subject, zone: string) {
  const sql = `SELECT COUNT(*) AS n, ${store.ms ? `MAX(${store.ms})` : 'NULL'} AS ms, ${store.date ? `MAX(${store.date})` : 'NULL'} AS dt, ${store.blob ? `COALESCE(SUM(${store.blob}), 0)` : '0'} AS bytes FROM ${store.from}`
  const row = (await env.DB.prepare(sql).bind(...bindFor(sql, subject)).first<{ n: number; ms: number | null; dt: string | null; bytes: number }>())!
  const day = row.ms ? dayOf(zone, row.ms) : row.dt
  return { rows: row.n, bytes: row.bytes, blobs: store.blob ? row.n : 0, record: day }
}

interface Context { today: string; hire: string; end: string; contractor: Contractor; holds: Hold[]; periods: { start: string; end: string | null }[]; personId: string; extra: (cls: ClassKey) => number }

function heldBy(context: Context, cls: ClassKey | null, category: string | null) {
  return context.holds.find(hold => {
    if (hold.scope_kind === 'employer') return true
    if (hold.scope_kind === 'person') return hold.scope_ref === context.personId
    if (hold.scope_kind === 'record_class') return cls !== null && hold.scope_ref === cls
    if (hold.scope_kind === 'document_category') return category !== null && hold.scope_ref === category
    return context.periods.some(period => period.start <= hold.to_date! && (period.end ?? '9999-12-31') >= hold.from_date!)
  })?.id ?? null
}

function classify(context: Context, store: { id: string; table: string; label: string }, kind: Store['kind'], cls: ClassKey | null, measured: { rows: number; bytes: number; blobs: number; record: string | null }, category: string | null = null): Item {
  const base = { id: store.id, table: store.table, label: store.label, rows: measured.rows, blobs: measured.blobs, bytes: measured.bytes, class: cls, rule: cls ? CLASSES[cls].citation : null, expiry: null as string | null, hold: null as string | null }
  if (typeof kind === 'object' || cls) {
    const key = cls ?? (kind as { class: ClassKey }).class
    const hold = heldBy(context, key, category)
    if (hold) return { ...base, class: key, rule: CLASSES[key].citation, disposition: 'held', hold }
    const expiry = classExpiry(key, { hire: context.hire, end: context.end, record: measured.record }, context.contractor, context.extra(key))
    return { ...base, class: key, rule: CLASSES[key].citation, expiry, disposition: expiry > context.today ? 'retained' : 'erased' }
  }
  const hold = heldBy(context, null, null)
  if (hold) return { ...base, disposition: 'held', hold }
  return { ...base, disposition: kind === 'authored' || kind === 'history' ? 'anonymized' : kind === 'custody' ? 'redacted' : 'erased' }
}

const OPEN_WORK: [string, string, string, string][] = [
  ['open_case', 'wl_cases', "person_id = ?1 AND status = 'open'", 'An open joiner, mover or leaver case'],
  ['open_task', 'wl_case_tasks', "assignee_person_id = ?1 AND status = 'open' AND superseded_at IS NULL", 'Open work assigned to the person'],
  ['pending_leave', 'wl_leave_requests', "person_id = ?1 AND status = 'pending'", 'A pending time-off request'],
  ['pending_proposal', 'wl_proposals', "status = 'pending' AND (instr(plan, ?1) > 0 OR instr(diff, ?1) > 0)", 'A pending employee-change proposal'],
  ['pending_change', 'wl_change_requests', "person_id = ?1 AND status IN ('pending', 'returned')", 'An open change request'],
  ['pending_self_change', 'wl_self_changes', 'person_id = ?1 AND id NOT IN (SELECT change_id FROM wl_self_decisions)', 'An undecided personal-detail change'],
  ['open_alert_task', 'wl_date_alert_tasks', "person_id = ?1 AND status = 'open'", 'An open date-alert review task'],
  ['payroll_exception', 'wl_payroll_batches', "status IN ('draft', 'exported') AND instr(exceptions, ?1) > 0", 'An unresolved payroll exception'],
]

export async function previewErasure(env: Bindings, actor: Actor, personId: string) {
  requireOwner(actor)
  const person = await one<{ id: string; legal_name: string; work_email: string | null; employee_number: string | null; created_at: number }>(env, 'SELECT id, legal_name, work_email, employee_number, created_at FROM wl_people WHERE id = ?', personId)
  insist(person, 'not_found', 404)
  const examined = await inventoryCoverage(env), zone = await employerZone(env)
  const member = await one<{ id: string; email: string; status: string }>(env, 'SELECT id, email, status FROM wl_members WHERE person_id = ?', personId)
  const subject: Subject = { personId, memberId: member?.id ?? '', workEmail: (person.work_email ?? '').toLowerCase(), employeeNumber: person.employee_number ?? '', memberEmail: (member?.email ?? '').toLowerCase() }
  const periods = await all<{ start: string; end: string | null }>(env, 'SELECT start_date AS start, end_date AS end FROM wl_periods WHERE person_id = ? ORDER BY start_date', personId)
  const [adopted, rules, activeHolds, contractor, mapped] = await Promise.all([adoption(env), stateRules(env), holds(env, { active: true }), contractorStatus(env, actor.today), mappings(env)])
  const blockers: Blocker[] = []
  if (periods.some(period => !period.end || period.end >= actor.today)) blockers.push({ kind: 'current_employment', ref: personId, reason: 'The person has a current or future employment period' })
  if (member && (await one(env, "SELECT 1 FROM oa_operators WHERE lower(email) = ? AND role = 'owner'", subject.memberEmail))) blockers.push({ kind: 'owner_account', ref: member.id, reason: 'The owner account cannot be erased' })
  for (const [kind, table, where, reason] of OPEN_WORK) {
    const sql = `SELECT id FROM ${table} WHERE ${where}`
    for (const row of (await env.DB.prepare(sql).bind(personId).all<{ id: string }>()).results) blockers.push({ kind, ref: String(row.id), reason })
  }
  if (!adopted) blockers.push({ kind: 'retention_not_adopted', ref: TABLE_VERSION, reason: 'The owner has not adopted the retention table' })
  const states = new Set<string>()
  for (const term of await all<{ location_id: string | null; work_state: string | null }>(env, `SELECT t.location_id, l.work_state FROM wl_terms t JOIN wl_periods p ON p.id = t.period_id LEFT JOIN wl_locations l ON l.id = t.location_id WHERE p.person_id = ? AND t.location_id IS NOT NULL`, personId)) {
    if (!term.work_state) blockers.push({ kind: 'location_state_missing', ref: term.location_id!, reason: 'A work location has no state' })
    else states.add(term.work_state)
  }
  for (const state of states) if (!rules.some(rule => rule.state === state)) blockers.push({ kind: 'state_unconfirmed', ref: state, reason: `The owner has not confirmed retention rules for ${state}` })
  const extra = (cls: ClassKey) => Math.max(0, ...rules.filter(rule => states.has(rule.state) && rule.decision === 'longer' && (rule.class === 'all' || rule.class === cls)).map(rule => rule.years ?? 0))
  const context: Context = { today: actor.today, hire: periods[0]?.start ?? actor.today, end: periods.reduce((latest, period) => period.end && period.end > latest ? period.end : latest, periods[0]?.start ?? actor.today), contractor, holds: activeHolds, periods, personId, extra }
  const items: Item[] = []
  for (const store of [...STORES, ...AUTHORED_STORES]) {
    const measured = await measure(env, store, subject, zone)
    if (measured.rows) items.push(classify(context, store, store.kind, null, measured))
  }
  for (const row of await all<{ category: string; name: string; docs: number; versions: number; blobs: number; bytes: number; ms: number | null }>(env, `SELECT d.category_id AS category, c.name, COUNT(DISTINCT d.id) AS docs, COUNT(v.id) AS versions, COUNT(DISTINCT v.sha256) AS blobs, COALESCE(SUM(v.size), 0) AS bytes, MAX(v.uploaded_at) AS ms
      FROM wl_documents d JOIN wl_doc_categories c ON c.id = d.category_id LEFT JOIN wl_document_versions v ON v.document_id = d.id WHERE d.person_id = ? GROUP BY d.category_id, c.name`, personId)) {
    const cls = (mapped.get(`document_category:${row.category}`) ?? null) as ClassKey | null
    const measured = { rows: row.docs + row.versions, blobs: row.blobs, bytes: row.bytes, record: row.ms ? dayOf(zone, row.ms) : null }
    if (!cls) blockers.push({ kind: 'unmapped_class', ref: row.category, reason: `Document category “${row.name}” holds the person's documents and has no retention class` })
    items.push(cls ? classify(context, { id: `documents:${row.category}`, table: 'wl_documents', label: `Documents in “${row.name}” and their versions` }, { class: cls }, cls, measured, row.category)
      : { id: `documents:${row.category}`, table: 'wl_documents', label: `Documents in “${row.name}” and their versions`, disposition: 'retained', class: null, rule: null, expiry: null, hold: null, rows: measured.rows, blobs: measured.blobs, bytes: measured.bytes })
  }
  for (const row of await all<{ id: string; key: string; n: number; ms: number | null }>(env, `SELECT f.id, f.key, COUNT(*) AS n, MAX(v.recorded_at) AS ms FROM wl_custom_field_values v JOIN wl_custom_fields f ON f.id = v.field_id WHERE v.person_id = ? GROUP BY f.id, f.key`, personId)) {
    const cls = (mapped.get(`custom_field:${row.id}`) ?? null) as ClassKey | null
    if (!cls) blockers.push({ kind: 'unmapped_class', ref: row.id, reason: `Custom field “${row.key}” holds the person's values and has no retention class` })
    const measured = { rows: row.n, blobs: 0, bytes: 0, record: row.ms ? dayOf(zone, row.ms) : null }
    items.push(cls ? classify(context, { id: `custom_field:${row.id}`, table: 'wl_custom_field_values', label: `Custom field “${row.key}”` }, { class: cls }, cls, measured)
      : { id: `custom_field:${row.id}`, table: 'wl_custom_field_values', label: `Custom field “${row.key}”`, disposition: 'retained', class: null, rule: null, expiry: null, hold: null, rows: row.n, blobs: 0, bytes: 0 })
  }
  for (const row of await all<{ id: string; key: string; built_in: number; n: number; versions: number; ms: number | null }>(env, `SELECT t.id, t.key, t.built_in, COUNT(DISTINCT r.id) AS n, COUNT(rv.id) AS versions, MAX(rv.recorded_at) AS ms FROM wl_record_rows r JOIN wl_record_tables t ON t.id = r.table_id LEFT JOIN wl_record_row_versions rv ON rv.row_id = r.id WHERE r.person_id = ? GROUP BY t.id, t.key, t.built_in`, personId)) {
    const cls = (row.built_in ? 'personnel' : mapped.get(`record_table:${row.id}`) ?? null) as ClassKey | null
    if (!cls) blockers.push({ kind: 'unmapped_class', ref: row.id, reason: `Record table “${row.key}” holds the person's rows and has no retention class` })
    const measured = { rows: row.n + row.versions, blobs: 0, bytes: 0, record: row.ms ? dayOf(zone, row.ms) : null }
    items.push(cls ? classify(context, { id: `record_table:${row.id}`, table: 'wl_record_rows', label: `Record table “${row.key}”` }, { class: cls }, cls, measured)
      : { id: `record_table:${row.id}`, table: 'wl_record_rows', label: `Record table “${row.key}”`, disposition: 'retained', class: null, rule: null, expiry: null, hold: null, rows: measured.rows, blobs: 0, bytes: 0 })
  }
  // The identity rows stay only as long as something retained or held needs them.
  const needing = items.filter(item => item.disposition === 'retained' || item.disposition === 'held')
  for (const item of items) {
    if (!['people', 'private'].includes(item.id)) continue
    const hold = needing.find(other => other.disposition === 'held')
    const last = needing.filter(other => other.expiry).map(other => other.expiry!).sort().at(-1) ?? null
    if (hold) Object.assign(item, { disposition: 'held', hold: hold.hold, expiry: null })
    else if (needing.length) Object.assign(item, { disposition: 'retained', expiry: last, rule: 'longest retained rule' })
    else Object.assign(item, { disposition: 'erased', expiry: null })
  }
  items.sort((a, b) => a.id.localeCompare(b.id))
  const copies = await declaredCopies(env, subject, person.created_at)
  const request = await one<{ id: string; status: string; source: string; received_on: string }>(env, "SELECT id, status, source, received_on FROM wl_erasure_requests WHERE person_id = ? AND status IN ('open', 'confirmed')", personId)
  blockers.sort((a, b) => (a.kind + a.ref).localeCompare(b.kind + b.ref))
  const digest = await sha256Hex(JSON.stringify({ version: TABLE_VERSION, adopted: adopted?.id ?? null, rules: rules.map(rule => rule.id), holds: activeHolds.map(hold => [hold.id, hold.review_date]), contractor, mapped: [...mapped].sort(),
    items: items.map(item => [item.id, item.id.endsWith('audit') || item.id === 'work_history' ? 1 : item.rows, item.blobs, item.bytes, item.disposition, item.class, item.expiry, item.hold]), blockers: blockers.map(blocker => [blocker.kind, blocker.ref]), copies, personId }))
  await auditRead(env, actor.id, 'erasure.preview', personId, { digest, blockers: blockers.length })
  const total = (disposition: Item['disposition']) => items.filter(item => item.disposition === disposition).reduce((sum, item) => sum + item.rows, 0)
  return {
    person: { id: personId, name: person.legal_name }, asOf: actor.today, tableVersion: TABLE_VERSION, adopted: adopted ? { version: adopted.table_version, at: adopted.adopted_at } : null, states: [...states].sort(),
    eligible: !blockers.some(blocker => ['current_employment', 'owner_account'].includes(blocker.kind)), confirmable: blockers.length === 0, blockers, request, examined,
    summary: { rows: items.reduce((sum, item) => sum + item.rows, 0), blobs: items.reduce((sum, item) => sum + item.blobs, 0), bytes: items.reduce((sum, item) => sum + item.bytes, 0), erased: total('erased'), anonymized: total('anonymized'), redacted: total('redacted'), retained: total('retained'), held: total('held') },
    items, copies, digest,
  }
}

/** Outside copies are declared, never claimed removed: exports carry no per-person record, so every earlier export may include the person. */
async function declaredCopies(env: Bindings, subject: Subject, createdAt: number) {
  const exports = (await one<{ n: number; first: number | null }>(env, "SELECT COUNT(*) AS n, MIN(at) AS first FROM wl_audit WHERE (action LIKE '%export%' OR action LIKE '%bundle%') AND at >= ?", createdAt))!
  const notices = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM wl_notices WHERE ?1 <> '' AND lower(recipient) IN (?1, ?2) AND status IN ('accepted', 'development')", subject.workEmail || subject.memberEmail, subject.memberEmail))!.n
  const payroll = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM wl_payroll_batches WHERE status IN ('exported', 'acknowledged') AND instr(lines, ?1) > 0", subject.personId))!.n
  const sso = subject.memberEmail ? (await one<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM oa_external_identities WHERE operator_id IN (SELECT id FROM oa_operators WHERE lower(email) = ?)', subject.memberEmail))!.n : 0
  return { exports: { count: exports.n, since: exports.first ? new Date(exports.first).toISOString().slice(0, 10) : null, statement: 'Exports and archives made while this person\'s records existed may include them; Willow does not record which people each contained.' },
    providers: [{ provider: 'Email notice provider', copies: notices }, { provider: 'Payroll provider (exported handoff files)', copies: payroll }, { provider: 'Single sign-on provider (identity link)', copies: sso }].filter(provider => provider.copies > 0) }
}

export async function confirmErasure(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['person', 'digest', 'returnTo'])
  const personId = input.text('person', { max: 64 }), digest = input.text('digest', { max: 64 })
  const request = await one<{ id: string }>(env, "SELECT id FROM wl_erasure_requests WHERE person_id = ? AND status = 'open'", personId)
  insist(request, 'erasure_request_required', 409)
  const preview = await previewErasure(env, actor, personId)
  insist(preview.digest === digest, 'preview_stale', 409)
  if (preview.blockers.length) throw new WillowError('erasure_blocked', 409, preview.blockers)
  await commit(env, [
    guard(env, 'stale', "EXISTS (SELECT 1 FROM wl_erasure_requests WHERE id = ? AND status = 'open')", request.id),
    stmt(env, "UPDATE wl_erasure_requests SET status = 'confirmed', confirmed_digest = ?, confirmed_by = ?, confirmed_at = ? WHERE id = ? AND status = 'open'", digest, actor.id, now(), request.id),
  ], { actor: actor.id, action: 'erasure.confirm', subject: request.id, detail: { digest, person: personId } })
  return { id: request.id, status: 'confirmed', digest }
}
