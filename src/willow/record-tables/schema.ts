// PEOPLE-003: record table definitions. Built-in tables (emergency contacts,
// education, certifications, assets) ship with fixed columns; HR adds custom
// tables whose typed columns use PEOPLE-001's validator. Key and
// classification never change; every other edit appends a complete version.
import type { Bindings } from '../../auth.server'
import { can, canAbout, requirePermission, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, stmt } from '../core'
import type { Input } from '../input'
import { readsCustomField } from '../custom-fields/read'
import { writesCustomField } from '../custom-fields/store'
import type { FieldDefinition, FieldValue } from '../custom-fields/types'
import { validateFieldDefinition, validateFieldValue } from '../custom-fields/validate'

/** 'contact' is the built-in emergency-contact table: Willow's existing private-contact rule. */
export type TableClassification = 'contact' | 'general' | 'hr' | 'payroll'
export interface Column { key: string; label: string; type: FieldDefinition['type']; required: boolean; validation: Record<string, unknown> }
export interface TableVersion { id: string; version: number; label: string; employeeRead: boolean; managerRead: boolean; columns: Column[]; retired: boolean; recordedAt: number; recordedBy: string }
export interface RecordTable { id: string; key: string; classification: TableClassification; builtIn: boolean; current: TableVersion; versions: TableVersion[] }

export const CERTIFICATIONS = 'table-certifications'
export const ASSETS = 'table-assets'
export const DEPENDENTS = 'table-dependents'
export const CONTACTS = 'table-emergency-contacts'
/** Renewal work opens this many days before a certification's expiry date (inclusive). */
export const RENEWAL_LEAD_DAYS = 30

const KEY = /^[a-z][a-z0-9_]{0,63}$/
const asDefinition = (column: Column): FieldDefinition => ({ effectiveFrom: '2000-01-01', label: column.label, type: column.type, required: column.required,
  employeeRead: false, managerRead: false, retired: false, validation: column.validation } as FieldDefinition)

export function validateColumn(raw: unknown): Column {
  insist(raw !== null && typeof raw === 'object' && !Array.isArray(raw), 'invalid_table_column')
  const { key, label, type, required, validation, ...rest } = raw as Record<string, unknown>
  insist(!Object.keys(rest).length, 'unexpected_table_column_property')
  insist(typeof key === 'string' && KEY.test(key), 'invalid_column_key')
  const definition = validateFieldDefinition({ effectiveFrom: '2000-01-01', label, type, required, employeeRead: false, managerRead: false, retired: false, validation })
  return { key, label: definition.label, type: definition.type, required: definition.required, validation: definition.validation as Record<string, unknown> }
}

/** Validates a complete row against one table version: unknown columns are refused, required ones enforced. */
export function validateRowValues(columns: Column[], raw: unknown): Record<string, FieldValue> {
  insist(raw !== null && typeof raw === 'object' && !Array.isArray(raw), 'invalid_row_values')
  const values = raw as Record<string, unknown>
  insist(Object.keys(values).every(key => columns.some(column => column.key === key)), 'unknown_table_column')
  const result: Record<string, FieldValue> = {}
  for (const column of columns) {
    const input = column.type === 'boolean' && typeof values[column.key] === 'string'
      ? (values[column.key] === '' ? null : values[column.key] === 'true' ? true : values[column.key] === 'false' ? false : values[column.key]) : values[column.key]
    try { result[column.key] = validateFieldValue(asDefinition(column), input) } catch (error) {
      throw Object.assign(error as Error, { detail: { column: column.key } })
    }
  }
  return result
}

const versionFrom = (row: Record<string, any>): TableVersion => ({ id: row.id, version: row.version, label: row.label, employeeRead: !!row.employee_read,
  managerRead: !!row.manager_read, columns: JSON.parse(row.columns_json), retired: !!row.retired, recordedAt: row.recorded_at, recordedBy: row.recorded_by })

/** Metadata only; rows are read through rows.ts under the reader's current authority. */
export async function recordTables(env: Bindings): Promise<RecordTable[]> {
  const [tables, versions] = await Promise.all([
    all(env, 'SELECT * FROM wl_record_tables ORDER BY built_in DESC, key'),
    all(env, 'SELECT * FROM wl_record_table_versions ORDER BY version DESC'),
  ])
  return tables.map(table => {
    const history = versions.filter(version => version.table_id === table.id).map(versionFrom)
    return { id: table.id, key: table.key, classification: table.classification, builtIn: !!table.built_in, current: history[0], versions: history }
  })
}

/** Current visibility flags and the reader's current grants decide every read, including history. */
export function readsTable(actor: Actor, personId: string, table: RecordTable): boolean {
  if (actor.owner) return true
  if (table.classification === 'contact') return actor.personId === personId || canAbout(actor, 'people.private', personId)
  return readsCustomField(actor, personId, { classification: table.classification, employeeRead: table.current.employeeRead, managerRead: table.current.managerRead })
}

export function writesTable(actor: Actor, personId: string, table: RecordTable): boolean {
  if (table.id === DEPENDENTS) return actor.personId !== personId && can(actor, 'people.manage') && can(actor, 'people.private')
  if (table.classification === 'contact') return actor.personId === personId || (can(actor, 'people.manage') && can(actor, 'people.private'))
  return writesCustomField(actor, { classification: table.classification })
}

export async function listRecordTables(env: Bindings, actor: Actor) {
  requirePermission(actor, 'people.manage')
  return recordTables(env)
}

/** Creates a custom table or appends a version. Built-in columns stay fixed; restricted tables never gain self/manager reads. */
export async function defineTable(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const tables = await recordTables(env)
  const existing = input.has('table') ? tables.find(table => table.id === input.text('table') || table.key === input.text('table')) : undefined
  insist(!input.has('table') || existing, 'not_found', 404)
  const key = existing?.key ?? input.text('key', { max: 64 })
  const classification = (existing?.classification ?? input.text('classification', { max: 20 })) as TableClassification
  insist(KEY.test(key), 'invalid_table_key')
  insist(existing || !tables.some(table => table.key === key), 'duplicate_table_key')
  insist(existing || ['general', 'hr', 'payroll'].includes(classification), 'invalid_table_classification')
  insist(!input.has('classification') || input.text('classification') === classification, 'table_identity_is_immutable')
  const columns = existing?.builtIn ? existing.current.columns : (input.has('columns') ? input.json('columns') : JSON.parse(input.text('columnsJson', { max: 40000 }))) as unknown
  insist(Array.isArray(columns) && columns.length > 0 && columns.length <= 40, 'invalid_table_columns')
  const validated = columns.map(validateColumn)
  insist(new Set(validated.map(column => column.key)).size === validated.length, 'duplicate_column_key')
  insist(!existing?.builtIn || !input.has('columns'), 'built_in_columns_are_fixed')
  const employeeRead = input.flag('employeeRead'), managerRead = input.flag('managerRead')
  insist(classification === 'general' || (!employeeRead && !managerRead), 'restricted_table_visibility')
  const version = (existing?.current.version ?? 0) + 1, id = existing?.id ?? newId(), versionId = newId(), at = now()
  const statements = [guard(env, 'table_definition_changed', '(SELECT COUNT(*) FROM wl_record_table_versions WHERE table_id = ?) = ?', id, version - 1)]
  if (!existing) statements.push(stmt(env, 'INSERT INTO wl_record_tables (id, key, classification, built_in, recorded_at, recorded_by) VALUES (?, ?, ?, 0, ?, ?)', id, key, classification, at, actor.id))
  statements.push(stmt(env, 'INSERT INTO wl_record_table_versions (id, table_id, version, label, employee_read, manager_read, columns_json, retired, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    versionId, id, version, input.text('label', { max: 200 }), +employeeRead, +managerRead, JSON.stringify(validated), +input.flag('retired'), at, actor.id))
  await commit(env, statements, { actor: actor.id, action: 'recordTable.define', subject: id, detail: { key, version } })
  return { id, key, version, versionId }
}
