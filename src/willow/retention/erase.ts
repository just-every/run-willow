import { CATEGORY_SIGNATURE_STORES, signingCategoryStores, redactSigningReviews } from './signatures'
import { confirmPreboarding } from './preboarding'
// DATA-002 execution: the owner confirms a preview's digest and one journaled D1 batch removes the
// person. Retained and held records move to restricted custody, erasable rows are deleted, the person's
// identity in other people's records and in audit and history becomes one random "Former person"
// label, and portability's restore fence is advanced in the same transaction. Blob bytes are deleted
// after the commit from a durable work list.
import { erasureStatements, invalidateTransfersStatements, redactionStatements } from '@runeditrun/rer/modules/portability/journal'
import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { addDays } from '../dates'
import { all, commit as commitBatch, guard, insist, newId, now, one, stmt, WillowError } from '../core'
import type { Input } from '../input'
import { confirmApplicant } from './applicant'
import { redactPayroll } from './payroll'
import { captureErasureSql, retireImportCustody } from './import-custody'
import { AUTHORED, AUTHORED_STORES, STORES, type Store } from './inventory'
import { COMPENSATION_AUTHORSHIP, compensationRedactions } from './compensation'
import { BUSINESS_SEQUENCE, planErasure, type Item, type Plan } from './erasure'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
const hex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('')

export interface Target { id: string; table: string; label: string; from: string; item: Item; blob?: string }

/** The stores an item stands for, with the rows each one removes. Dynamic items stand for per-category documents, fields and tables. */
export function targets(plan: Plan): Target[] {
  const result: Target[] = []
  const known = new Map([...STORES, ...AUTHORED_STORES].map(store => [store.id, store] as [string, Store]))
  for (const item of plan.view.items) {
    const [kind, ref] = item.id.split(/:(.*)/s)
    const category = quote(ref ?? '')
    if (kind === 'documents') {
      result.push({ id: item.id + ':versions', table: 'wl_document_versions', label: item.label, item, blob: 't.size', from: `wl_document_versions t WHERE t.document_id IN (SELECT id FROM wl_documents WHERE person_id = ?1 AND category_id = ${category})` })
      result.push({ id: item.id, table: 'wl_documents', label: item.label, item, from: `wl_documents t WHERE t.person_id = ?1 AND t.category_id = ${category}` })
    } else if (CATEGORY_SIGNATURE_STORES.has(kind) && ref) {
      const store = signingCategoryStores(ref).find(store => store.id === item.id)!
      result.push({ id: item.id, table: store.table, label: store.label, item, blob: store.blob, from: store.from })
    } else if (kind === 'custom_field') result.push({ id: item.id, table: 'wl_custom_field_values', label: item.label, item, from: `wl_custom_field_values t WHERE t.person_id = ?1 AND t.field_id = ${category}` })
    else if (kind === 'record_table') {
      result.push({ id: item.id + ':versions', table: 'wl_record_row_versions', label: item.label, item, from: `wl_record_row_versions t WHERE t.row_id IN (SELECT id FROM wl_record_rows WHERE person_id = ?1 AND table_id = ${category})` })
      result.push({ id: item.id, table: 'wl_record_rows', label: item.label, item, from: `wl_record_rows t WHERE t.person_id = ?1 AND t.table_id = ${category}` })
    } else {
      const store = known.get(item.id)
      insist(store, 'inventory_incomplete', 409, { store: item.id })
      result.push({ id: item.id, table: store.table, label: store.label, item, blob: store.blob, from: store.from })
    }
  }
  return result
}

const SOURCE_TABLES = ['wl_sign_files', 'wl_document_versions', 'wl_hiring_resumes', 'wl_protected_certifications', 'wl_company_file_versions']

export interface RowTarget { id: string; table: string; from: string; blob?: string; item: Pick<Item, 'disposition' | 'class' | 'rule' | 'expiry' | 'hold'> }

/** The keys of every row each target removes, and the bytes only erased rows own. */
export async function readTargets(env: Bindings, rowTargets: RowTarget[], params: string[]) {
  const ids = new Map<string, string[]>(), blobs = new Map<string, number>(), erasedShas = new Map<string, number>()
  const retainedShas = new Set<string>(), erasedRows = new Set<string>()
  for (const target of rowTargets) {
    const rowid = !(await one<{ sql: string }>(env, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", target.table))!.sql.includes('WITHOUT ROWID')
    const pk = (await all<{ name: string; pk: number }>(env, `PRAGMA table_info(${target.table})`)).filter(row => row.pk > 0).sort((a, b) => a.pk - b.pk).map(row => row.name)
    const key = rowid ? 't.rowid' : `json_array(${pk.map(name => `t.${name}`).join(', ')})`
    const sql = `SELECT ${key} AS k${target.blob ? ', t.sha256 AS sha, t.size AS size' : ''} FROM ${target.from}`
    const max = Math.max(1, ...[...sql.matchAll(/\?(\d)/g)].map(match => Number(match[1])))
    const rows = (await env.DB.prepare(sql).bind(...params.slice(0, max)).all<{ k: unknown; sha?: string; size?: number }>()).results
    ids.set(target.id, rows.map(row => rowid ? row.k as string : JSON.parse(String(row.k))))
    Object.assign(target, { rowid, pk })
    if (target.blob) for (const row of rows) {
      if (target.item.disposition !== 'erased') { retainedShas.add(row.sha!); continue }
      blobs.set(row.sha!, row.size!)
      const key = `${target.table}:${JSON.stringify(row.k)}`
      if (!erasedRows.has(key)) { erasedRows.add(key); erasedShas.set(row.sha!, (erasedShas.get(row.sha!) ?? 0) + 1) }
    }
  }
  // Content-addressed bytes still referenced by a record that stays, here or elsewhere, are kept.
  for (const [sha] of [...blobs]) {
    if (retainedShas.has(sha)) { blobs.delete(sha); continue }
    const refs = (await one<{ n: number }>(env, `SELECT (${SOURCE_TABLES.map(table => `(SELECT COUNT(*) FROM ${table} WHERE sha256 = ?1)`).join(' + ')} + (SELECT COUNT(*) FROM wl_retained_records WHERE instr(row_json, ?1) > 0) + (SELECT COUNT(*) FROM wl_change_requests WHERE instr(attachments_json, ?1) > 0)) AS n`, sha))!.n
    if (refs > (erasedShas.get(sha) ?? 0)) blobs.delete(sha)
  }
  return { ids, blobs }
}

/** Retained and held rows are copied whole into custody, then every target's rows are deleted. */
export async function moveRows(env: Bindings, rowTargets: RowTarget[], ids: Map<string, string[]>, erasureId: string, at: number) {
  const statements: D1PreparedStatement[] = [], deletions: D1PreparedStatement[] = []
  for (const target of rowTargets) {
    const list = ids.get(target.id) ?? []
    if (!list.length) continue
    const meta = target as RowTarget & { rowid: boolean; pk: string[] }
    const where = meta.rowid ? 'rowid IN (SELECT value FROM json_each(?1))' : `json_array(${meta.pk.join(', ')}) IN (SELECT value FROM json_each(?1))`
    if (target.item.disposition === 'retained' || target.item.disposition === 'held') {
      const columns = (await all<{ name: string }>(env, `PRAGMA table_info(${target.table})`)).map(row => row.name).filter(name=>name!=='token_hash')
      statements.push(stmt(env, `INSERT INTO wl_retained_records (erasure_id, store, table_name, class, rule, expiry, hold_id, row_json, created_at)
        SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, json_object(${columns.map(column => `'${column}', t.${column}`).join(', ')}), ?9 FROM ${target.table} t WHERE ${meta.rowid ? 't.rowid' : `json_array(${meta.pk.map(column => `t.${column}`).join(', ')})`} IN (SELECT value FROM json_each(?1))`,
        JSON.stringify(list), erasureId, target.id, target.table, target.item.class, target.item.rule, target.item.expiry, target.item.hold, at))
    }
    // Peer awards and shared signing records stay live with anonymized attribution.
    // Holds preserve the original in restricted custody before that redaction.
    if (target.id !== COMPENSATION_AUTHORSHIP && !(target.id.startsWith('wl_sign_') || ['signature_reviews', 'signature_cohorts'].includes(target.id) || target.table === 'wl_sign_reviews')) deletions.push(stmt(env, `DELETE FROM ${target.table} WHERE ${where}`, JSON.stringify(list)))
  }
  // A preview blob can be evidence for several categories. Copy every applicable
  // retained use before deleting its one live file row.
  return [...statements, ...deletions]
}

export async function confirmErasure(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['person', 'application', 'preboarding', 'digest', 'returnTo'])
  if (input.provided('preboarding')) return await confirmPreboarding(env,actor,input)
  if (input.provided('application')) return await confirmApplicant(env, actor, input)
  const captured = captureErasureSql(env)
  env = captured.env
  const personId = input.text('person', { max: 64 }), digest = input.text('digest', { max: 64 })
  const request = await one<{ id: string; source: string; received_on: string }>(env, "SELECT id, source, received_on FROM wl_erasure_requests WHERE person_id = ? AND status = 'open'", personId)
  insist(request, 'erasure_request_required', 409)
  const plan = await planErasure(env, actor, personId)
  insist(plan.view.digest === digest, 'preview_stale', 409)
  if (plan.view.blockers.length) throw new WillowError('erasure_blocked', 409, plan.view.blockers)
  const { subject, person, view } = plan
  const label = `Former person ${hex(4)}`, stubPerson = newId(), stubMember = newId(), erasureId = newId(), at = now()
  // Recipient lists are shared with other people's schedules and alerts: the person leaves the list, the record stays.
  const recipientStores = new Map([['report_recipients', 'wl_report_schedules'], ['alert_recipients', 'wl_date_alerts']])
  const rowTargets = targets(plan).filter(target => ['erased', 'retained', 'held'].includes(target.item.disposition) && !recipientStores.has(target.id) && target.id !== 'payroll_batches')
  const { ids, blobs } = await readTargets(env, rowTargets, [subject.personId, subject.memberId, subject.workEmail, subject.employeeNumber, subject.memberEmail])

  const textColumns = [['wl_audit', 'detail'], ['wl_work_history', 'detail']] as const
  const swap: [string, string][] = [[subject.personId, stubPerson], [subject.memberId, stubMember], [subject.workEmail, label], [subject.memberEmail, label], [person.legal_name, label], [person.preferred_name ?? '', label]].filter(([from]) => from.length >= 5) as [string, string][]
  const replaced = (column: string) => swap.reduce((expression, [from, to]) => `replace(${expression}, ${quote(from)}, ${quote(to)})`, column)
  const scrubbed: Record<string, number> = {}
  for (const [table, column] of textColumns) scrubbed[table] = (await one<{ n: number }>(env, `SELECT COUNT(*) AS n FROM ${table} WHERE ${swap.map(([from]) => `instr(${column}, ${quote(from)}) > 0`).join(' OR ') || '0'}`))!.n
  const awards = await compensationRedactions(env, subject, swap)
  scrubbed.wl_comp_records = awards.count

  const fk: { tbl: string; col: string; parent: string }[] = []
  for (const { name } of await all<{ name: string }>(env, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")) {
    for (const row of await all<{ table: string; from: string }>(env, `PRAGMA foreign_key_list(${name})`)) if (row.table === 'wl_members' || row.table === 'wl_people') fk.push({ tbl: name, col: row.from, parent: row.table })
  }
  const statements: D1PreparedStatement[] = [
    guard(env, 'preview_stale', `${BUSINESS_SEQUENCE} = ?`, plan.sequence),
    stmt(env, 'DELETE FROM wl_agent_people WHERE member_id=?', subject.memberId),
    stmt(env, 'INSERT INTO wl_erasure_window (token) VALUES (?)', erasureId),
    stmt(env, 'PRAGMA defer_foreign_keys = on'),
    stmt(env, "INSERT INTO wl_people (id, legal_name, origin, revision, created_at, updated_at) VALUES (?, ?, 'native', ?, ?, ?)", stubPerson, label, newId(), at, at),
    stmt(env, "INSERT INTO wl_members (id, email, name, person_id, status, created_at) VALUES (?, ?, ?, ?, 'ended', ?)", stubMember, `erased-${hex(8)}@erased.invalid`, label, stubPerson, at),
  ]
  for (const [store, table] of recipientStores) if (subject.memberId) statements.push(stmt(env, `UPDATE ${table} SET recipients_json = (SELECT COALESCE(json_group_array(value), '[]') FROM json_each(recipients_json) WHERE value NOT IN (?1, 'member:' || ?1, ?2, ?3)) WHERE ?1 <> '' AND instr(recipients_json, ?1) > 0`, subject.memberId, subject.workEmail, subject.memberEmail))
  statements.push(...await moveRows(env, rowTargets, ids, erasureId, at), ...redactSigningReviews(env, subject.personId, subject.memberId, stubMember, at), ...await redactPayroll(env, subject, view.items.find(item => item.id === 'payroll_batches'), erasureId, at))
  for (const { tbl, col, parent } of fk) {
    if (tbl === 'wl_members' && col === 'person_id') continue
    const [real, stub] = parent === 'wl_members' ? [subject.memberId, stubMember] : [subject.personId, stubPerson]
    if (real) statements.push(stmt(env, `UPDATE ${tbl} SET ${col} = ? WHERE ${col} = ?`, stub, real))
  }
  for (const [table, column] of AUTHORED) if (subject.memberId) statements.push(stmt(env, `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, stubMember, subject.memberId))
  statements.push(...awards.statements)
  for (const [table, column, real, stub] of [['wl_audit', 'actor', subject.memberId, stubMember], ['wl_audit', 'subject', subject.memberId, stubMember], ['wl_audit', 'subject', subject.personId, stubPerson], ['wl_work_history', 'actor', subject.memberId, stubMember], ['wl_permissions', 'granted_by', subject.memberId, stubMember], ['wl_level_permissions', 'granted_by', subject.memberId, stubMember]] as const) {
    if (real) statements.push(stmt(env, `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, stub, real))
  }
  for (const [table, column] of textColumns) statements.push(stmt(env, `UPDATE ${table} SET ${column} = ${replaced(column)}`))
  const counts = view.items.map(item => ({ store: item.id, table: item.table, disposition: item.disposition, class: item.class, expiry: item.expiry, hold: item.hold, rows: item.rows }))
  const blobList = [...blobs]
  statements.push(
    stmt(env, 'INSERT INTO wl_erasure_receipts (id, request_id, label, source, received_on, approved_by, approved_at, digest, counts_json, blobs_total, blobs_bytes, scrubbed_json, copies_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      erasureId, request.id, label, request.source, request.received_on, actor.id, at, digest, JSON.stringify(counts), blobList.length, blobList.reduce((sum, [, size]) => sum + size, 0), JSON.stringify(scrubbed), JSON.stringify(view.copies)),
    ...view.copies.providers.map(provider => stmt(env, 'INSERT INTO wl_provider_requests (id, erasure_id, provider, copies, assignee, due_date, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), erasureId, provider.provider, provider.copies, actor.id, addDays(actor.today, 30), at)),
    ...blobList.map(([sha, size]) => stmt(env, 'INSERT INTO wl_erasure_blobs (erasure_id, sha256, size) VALUES (?, ?, ?)', erasureId, sha, size)),
    stmt(env, "UPDATE wl_erasure_requests SET status = 'confirmed', confirmed_digest = ?, confirmed_by = ?, confirmed_at = ?, receipt_id = ? WHERE id = ? AND status = 'open'", digest, actor.id, at, erasureId, request.id),
    ...await erasureStatements(env.DB, 'wl_people', { id: subject.personId }), ...await redactionStatements(env.DB), ...await invalidateTransfersStatements(env.DB),
    stmt(env, 'DELETE FROM wl_erasure_window'),
  )
  statements.push(stmt(env, 'DELETE FROM wl_guard'), stmt(env, 'INSERT INTO wl_audit (at, actor, action, subject, detail) VALUES (?, ?, ?, ?, ?)', at, actor.id, 'erasure.execute', erasureId, JSON.stringify({ digest, rows: view.summary.rows })))
  await retireImportCustody(env, actor, { ...subject, legalName: person.legal_name }, captured.sql(statements), captured.sql(await redactionStatements(env.DB)), erasureId)
  // The erasure is committed; a failed object delete stays on the durable list and the scheduler retries it.
  await finishBlobs(env, erasureId).catch(() => 0)
  return { id: request.id, status: 'confirmed', receipt: erasureId, label, digest }
}

/** Deletes the object bytes recorded in the batch, after the commit; each key is read back and leaves the list only once the object is gone. */
export async function finishBlobs(env: Bindings, erasureId: string) {
  let done = 0
  for (const row of await all<{ sha256: string }>(env, 'SELECT sha256 FROM wl_erasure_blobs WHERE erasure_id = ? AND deleted = 0', erasureId)) {
    await env.FILES.delete(`sha256/${row.sha256}`)
    if (await env.FILES.head(`sha256/${row.sha256}`)) continue
    await commitBatch(env, [stmt(env, 'UPDATE wl_erasure_blobs SET deleted = 1 WHERE erasure_id = ? AND sha256 = ?', erasureId, row.sha256)], { actor: 'system', action: 'erasure.blob', subject: erasureId })
    done++
  }
  await stmt(env, 'UPDATE wl_erasure_receipts SET blobs_deleted = (SELECT COUNT(*) FROM wl_erasure_blobs WHERE erasure_id = ?1 AND deleted = 1) WHERE id = ?1', erasureId).run()
  return done
}
