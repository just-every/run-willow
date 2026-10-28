// Payroll's single source: one SQL value captures every calculation dependency,
// including claims and cancellation state. The calculation decodes only this
// value; comparing it inside the commit closes changes before draft/export.
// Revisions also detect a mutable value changed and changed back after capture.
// Private contact values, document bytes and audit events never enter this snapshot.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { guard, insist, one } from './core'

const sources = {
  wl_comp_bonuses: ['id','cycle_id','person_id','period_id','effective_from','amount_cents','recorded_at'],
  wl_self_changes: ['id', 'person_id', 'kind', 'due_date', 'requested_at'],
  wl_self_decisions: ['change_id', 'outcome'],
  wl_self_reconciliation: ['change_id'],
  wl_people: ['id', 'legal_name', 'preferred_name', 'employee_number', 'revision'],
  wl_periods: ['id', 'person_id', 'start_date', 'end_date', 'employment_type', 'payroll_id', 'revision'],
  wl_terms: ['id', 'period_id', 'effective_from', 'status', 'job_title', 'department_id', 'location_id', 'schedule_id', 'reason'],
  wl_term_pay: ['term_id', 'pay_basis', 'amount_cents', 'currency'],
  wl_departments: ['id', 'name', 'revision'], wl_locations: ['id', 'name', 'revision'],
  wl_schedules: ['id', 'name', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  wl_ledger: ['id', 'account_id', 'kind', 'minutes', 'request_id', 'reverses', 'recorded_at'],
  wl_leave_requests: ['id', 'person_id', 'start_date', 'end_date', 'status'],
  wl_leave_accounts: ['id', 'period_id', 'policy_id', 'revision'],
  wl_leave_policies: ['id', 'name'],
  wl_payroll_items: ['source_kind', 'source_id'],
  wl_custom_fields: ['id', 'key', 'classification', 'recorded_at', 'recorded_by'],
  wl_custom_field_versions: ['id', 'field_id', 'version', 'effective_from', 'label', 'type', 'required', 'employee_read', 'manager_read', 'validation_json', 'retired', 'recorded_at', 'recorded_by'],
  wl_custom_field_values: ['id', 'person_id', 'field_id', 'definition_version_id', 'effective_from', 'sequence', 'value_json', 'corrects_id', 'origin', 'revision', 'recorded_at', 'recorded_by'],
} as const
export type PayrollSourceRows = { [Table in keyof typeof sources]: { [Column in typeof sources[Table][number]]: any }[] }

// The same ordered table/column definitions encode, decode and fence the data.
const selectedFields = `SELECT f.id FROM wl_custom_fields f WHERE f.classification = 'general' AND EXISTS (
  SELECT 1 FROM wl_payroll_layout l, json_each(l.mapping, '$.columns') c
  WHERE l.singleton = 1 AND l.format = 'generic' AND json_extract(c.value, '$.source') = 'custom.' || f.key
)`

function snapshot(actor: Actor) {
  // Mirror readsCustomField's general-field rule in SQL so unreadable values
  // never enter the captured state. Current flags are read in this same query.
  const currentFlag = (flag: 'employee_read' | 'manager_read') => `(SELECT ${flag} FROM wl_custom_field_versions d WHERE d.field_id = wl_custom_field_values.field_id AND d.effective_from <= ? ORDER BY d.effective_from DESC, d.version DESC LIMIT 1) = 1`
  const unrestricted = can(actor, 'people.manage')
  const readable = unrestricted ? '1' : `((person_id = ? AND ${currentFlag('employee_read')}) OR (person_id IN (SELECT value FROM json_each(?)) AND ${currentFlag('manager_read')}))`
  const filters: Partial<Record<keyof typeof sources, string>> = {
    wl_self_changes: `kind NOT IN ('goal','training')`,
    wl_self_decisions: `change_id IN (SELECT id FROM wl_self_changes WHERE kind NOT IN ('goal','training'))`,
    wl_self_reconciliation: `change_id IN (SELECT id FROM wl_self_changes WHERE kind NOT IN ('goal','training'))`,
    wl_custom_fields: `id IN (${selectedFields})`,
    wl_custom_field_versions: `field_id IN (${selectedFields})`,
    wl_custom_field_values: `field_id IN (${selectedFields}) AND ${readable}`,
  }
  return { sql: `json_array(${Object.entries(sources).map(([table, columns]) =>
    `(SELECT json_group_array(json_array(${columns.join(',')})) FROM (SELECT ${columns.join(',')} FROM ${table}${filters[table as keyof typeof sources] ? ` WHERE ${filters[table as keyof typeof sources]}` : ''} ORDER BY ${columns.join(',')}))`).join(',')})`,
    params: unrestricted ? [] : [actor.personId, actor.today, JSON.stringify([...actor.reports].sort()), actor.today] }
}

export function decodePayrollSources(value: string): PayrollSourceRows {
  const tables: (string | number | null)[][][] = JSON.parse(value)
  // Older drafts lack the custom-source fence and need a fresh calculation.
  insist(Array.isArray(tables) && tables.length === Object.keys(sources).length && tables.every(Array.isArray), 'stale', 409)
  return Object.fromEntries(Object.entries(sources).map(([table, columns], index) => [table,
    tables[index].map(row => Object.fromEntries(columns.map((column, columnIndex) => [column, row[columnIndex]]))),
  ])) as PayrollSourceRows
}

export async function payrollSources(env: Bindings, actor: Actor) {
  const query = snapshot(actor)
  return (await one<{ snapshot: string }>(env, `SELECT ${query.sql} AS snapshot`, ...query.params))!.snapshot
}
export function guardPayrollSources(env: Bindings, expected: string, actor: Actor) {
  const query = snapshot(actor)
  return guard(env, 'stale', `${query.sql} = ?`, ...query.params, expected)
}
