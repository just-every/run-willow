// PEOPLE-003: dated rows in a person's record tables. Every read goes through
// personRecordTables under the reader's current authority; every change appends
// a complete version (removal included) so earlier dates stay reconstructable.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, auditRead, commit, guard, insist, newId, now, one, stmt } from '../core'
import { addDays, isDate } from '../dates'
import type { Input } from '../input'
import type { FieldValue } from '../custom-fields/types'
import { ASSETS, CERTIFICATIONS, CONTACTS, RENEWAL_LEAD_DAYS, readsTable, recordTables, validateRowValues, writesTable, type RecordTable } from './schema'

export interface RowVersion { id: string; sequence: number; tableVersionId: string; effectiveFrom: string; values: Record<string, FieldValue>; removed: boolean; origin: string; recordedAt: number; recordedBy: string }
interface VersionRow { id: string; row_id: string; sequence: number; table_version_id: string; effective_from: string; values_json: string; removed: number; origin: string; recorded_at: number; recorded_by: string; table_id: string; person_id: string }

const versionOf = (row: VersionRow): RowVersion => ({ id: row.id, sequence: row.sequence, tableVersionId: row.table_version_id, effectiveFrom: row.effective_from,
  values: JSON.parse(row.values_json), removed: !!row.removed, origin: row.origin, recordedAt: row.recorded_at, recordedBy: row.recorded_by })
/** The version in force on a date: latest effective date on or before it, highest sequence on a tie. */
export const inForce = (history: RowVersion[], date: string) => history.filter(version => version.effectiveFrom <= date)
  .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.sequence - a.sequence)[0]

async function versionsFor(env: Bindings, personId: string, tableIds: string[]) {
  if (!tableIds.length) return []
  return all<VersionRow>(env, `SELECT v.*, r.table_id, r.person_id FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id = v.row_id
    WHERE r.person_id = ? AND r.table_id IN (${tableIds.map(() => '?').join(',')}) ORDER BY v.row_id, v.sequence`, personId, ...tableIds)
}

/** The shared projection for pages, JSON, agent context, exports and reports. Unreadable tables are absent, not empty. */
export async function personRecordTables(env: Bindings, actor: Actor, personId: string, asOf = actor.today,
  { audit = true, allow }: { audit?: boolean; allow?: (table: RecordTable) => boolean } = {}) {
  insist(isDate(asOf), 'invalid_asOf')
  const readable = (await recordTables(env)).filter(table => readsTable(actor, personId, table) && (!allow || allow(table)))
  const rows = await versionsFor(env, personId, readable.map(table => table.id))
  const restricted = readable.filter(table => table.classification !== 'general')
  if (audit && actor.personId !== personId && restricted.length) await auditRead(env, actor.id, 'recordTable.private.read', personId, { asOf, tables: restricted.map(table => table.key) })
  return { asOf, tables: readable.map(table => {
    const ids = [...new Set(rows.filter(row => row.table_id === table.id).map(row => row.row_id))]
    const entries = ids.map(id => {
      const history = rows.filter(row => row.row_id === id).map(versionOf), current = inForce(history, asOf)
      return { id, effectiveFrom: current?.effectiveFrom ?? null, values: current && !current.removed ? current.values : null, history }
    })
    return { id: table.id, key: table.key, label: table.current.label, classification: table.classification, builtIn: table.builtIn, retired: table.current.retired,
      columns: table.current.columns, versions: table.versions, rows: entries.filter(entry => entry.values), formerRows: entries.filter(entry => !entry.values) }
  }) }
}
export type PersonRecordTables = Awaited<ReturnType<typeof personRecordTables>>

function rowInput(input: Input, table: RecordTable): unknown {
  if (input.has('values')) return input.json('values')
  return Object.fromEntries(table.current.columns.map(column => [column.key, input.text(`col.${column.key}`, { optional: true, max: 10000 })]))
}

export async function writeRow(env: Bindings, actor: Actor, input: Input) {
  const personId = input.text('person', { max: 100 }), effectiveFrom = input.text('effectiveFrom', { optional: true, max: 10 }) || actor.today
  insist(isDate(effectiveFrom), 'invalid_effectiveFrom')
  insist(await one(env, 'SELECT 1 FROM wl_people WHERE id = ?', personId), 'not_found', 404)
  const table = (await recordTables(env)).find(item => item.id === input.text('table', { max: 100 }) || item.key === input.text('table', { max: 100 }))
  insist(table && readsTable(actor, personId, table), 'not_found', 404)
  insist(writesTable(actor, personId, table), 'forbidden', 403)
  insist(!table.current.retired, 'table_retired', 409)
  const rowId = input.text('row', { optional: true, max: 100 }) || null
  const history = (await versionsFor(env, personId, [table.id])).filter(row => row.row_id === rowId).map(versionOf)
  insist(!rowId || history.length, 'not_found', 404)
  const remove = input.flag('remove')
  insist(!remove || rowId, 'row_required')
  const previous = rowId ? inForce(history, effectiveFrom) ?? history[history.length - 1] : undefined
  const values = remove ? previous!.values : validateRowValues(table.current.columns, rowInput(input, table))
  if (table.id === ASSETS) insist(!values.returned_on || values.returned_on >= values.assigned_on!, 'returned_before_assigned')
  const statements = [guard(env, 'table_definition_changed', '(SELECT id FROM wl_record_table_versions WHERE table_id = ? ORDER BY version DESC LIMIT 1) = ?', table.id, table.current.id)]
  if (table.id === CONTACTS && values.primary === true && !remove) {
    // One primary emergency contact at a time; demote the other first.
    const others = (await personRecordTables(env, actor, personId, effectiveFrom, { audit: false })).tables.find(item => item.id === CONTACTS)!.rows
    insist(!others.some(row => row.id !== rowId && row.values?.primary === true), 'primary_contact_exists', 409)
  }
  const id = rowId ?? newId(), sequence = Math.max(0, ...history.map(version => version.sequence)) + 1
  statements.push(guard(env, 'stale', '(SELECT COUNT(*) FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id = v.row_id WHERE r.person_id = ? AND r.table_id = ?) = ?',
    personId, table.id, (await one<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id = v.row_id WHERE r.person_id = ? AND r.table_id = ?', personId, table.id))!.n))
  if (!rowId) statements.push(stmt(env, "INSERT INTO wl_record_rows (id, table_id, person_id, origin, revision, created_at) VALUES (?, ?, ?, 'native', ?, ?)", id, table.id, personId, newId(), now()))
  statements.push(versionStatement(env, id, sequence, table.current.id, effectiveFrom, values, remove, actor.id))
  await commit(env, statements, { actor: actor.id, action: remove ? 'recordRow.remove' : 'recordRow.write', subject: personId, detail: { table: table.key, row: id, effectiveFrom } })
  return { id, person: personId, table: table.key, effectiveFrom, sequence }
}

const versionStatement = (env: Bindings, rowId: string, sequence: number, tableVersionId: string, effectiveFrom: string, values: Record<string, FieldValue>, removed: boolean, by: string) =>
  stmt(env, "INSERT INTO wl_record_row_versions (id, row_id, sequence, table_version_id, effective_from, values_json, removed, origin, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'native', ?, ?)",
    newId(), rowId, sequence, tableVersionId, effectiveFrom, JSON.stringify(values), +removed, now(), by)

async function latestVersions(env: Bindings, tableId: string, personId?: string) {
  const rows = await all<VersionRow>(env, `SELECT v.*, r.table_id, r.person_id FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id = v.row_id
    WHERE r.table_id = ?${personId ? ' AND r.person_id = ?' : ''} ORDER BY v.row_id, v.effective_from, v.sequence`, tableId, ...(personId ? [personId] : []))
  const latest = new Map<string, VersionRow>()
  for (const row of rows) latest.set(row.row_id, row)
  return [...latest.values()]
}

/** Assets still held by the person: their latest version is neither removed nor returned. */
export async function heldAssets(env: Bindings, personId: string) {
  return (await latestVersions(env, ASSETS, personId)).filter(row => !row.removed && !JSON.parse(row.values_json).returned_on)
    .map(row => ({ rowId: row.row_id, values: JSON.parse(row.values_json) as Record<string, string>, sequence: row.sequence }))
}

/** Closing a device-return task appends the returned version of the asset in the same batch. */
export async function assetReturnStatements(env: Bindings, actor: Actor, rowId: string, input: Input) {
  const returnedOn = input.text('returnedOn', { max: 10 }), condition = input.text('condition', { max: 20 })
  insist(isDate(returnedOn), 'invalid_returnedOn')
  const table = (await recordTables(env)).find(item => item.id === ASSETS)!
  const history = (await all<VersionRow>(env, 'SELECT v.*, r.table_id, r.person_id FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id = v.row_id WHERE v.row_id = ? ORDER BY v.sequence', rowId)).map(versionOf)
  const latest = history[history.length - 1]
  insist(latest && !latest.removed, 'asset_not_found', 404)
  const values = validateRowValues(table.current.columns, { ...latest.values, returned_on: returnedOn, condition })
  insist(values.returned_on! >= values.assigned_on!, 'returned_before_assigned')
  return [
    guard(env, 'stale', '(SELECT MAX(sequence) FROM wl_record_row_versions WHERE row_id = ?) = ?', rowId, latest.sequence),
    versionStatement(env, rowId, latest.sequence + 1, table.current.id, returnedOn, values, false, actor.id),
  ]
}

/** Certifications in force whose expiry is within the renewal lead (or past). The version id keys the work, so a renewal closes it. */
export async function renewalsDue(env: Bindings, date: string) {
  const people = new Set((await all<{ person_id: string }>(env, "SELECT person_id FROM wl_periods WHERE end_date IS NULL OR end_date >= ?", date)).map(row => row.person_id))
  return (await latestVersions(env, CERTIFICATIONS)).flatMap(row => {
    const values = JSON.parse(row.values_json)
    return !row.removed && row.effective_from <= date && values.expires_on && values.expires_on <= addDays(date, RENEWAL_LEAD_DAYS) && people.has(row.person_id)
      ? [{ id: row.id, row: row.row_id, person_id: row.person_id, due: values.expires_on as string }] : []
  })
}

/** Report: one table's rows in force on a date for every person the reader may read it for. */
export async function tableReport(env: Bindings, actor: Actor, key: string, asOf: string, people: { id: string; name: string }[]) {
  const table = (await recordTables(env)).find(item => item.key === key)
  insist(table, 'not_found', 404)
  insist(isDate(asOf), 'invalid_asOf')
  const readable = people.filter(person => readsTable(actor, person.id, table))
  const rows: { personId: string; person: string; rowId: string; effectiveFrom: string; values: Record<string, FieldValue> }[] = []
  for (const person of readable) {
    const projected = (await personRecordTables(env, actor, person.id, asOf, { audit: false })).tables.find(item => item.id === table.id)!
    for (const row of projected.rows) rows.push({ personId: person.id, person: person.name, rowId: row.id, effectiveFrom: row.effectiveFrom!, values: row.values! })
  }
  if (table.classification !== 'general' && rows.some(row => row.personId !== actor.personId)) await auditRead(env, actor.id, 'recordTable.private.read', 'report', { table: key, asOf, people: new Set(rows.map(row => row.personId)).size })
  return { table: { key: table.key, label: table.current.label, classification: table.classification, columns: table.current.columns }, asOf, people: readable.length, rows }
}
