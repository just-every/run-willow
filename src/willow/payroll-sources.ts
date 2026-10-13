// Payroll's single source: one SQL value captures every calculation dependency,
// including claims and cancellation state. The calculation decodes only this
// value; comparing it inside the commit closes changes before draft/export.
// Revisions also detect a mutable value changed and changed back after capture.
// Private contact values, document bytes and audit events never enter this snapshot.
import type { Bindings } from '../auth.server'
import { guard, one } from './core'

const sources = {
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
} as const
export type PayrollSourceRows = { [Table in keyof typeof sources]: { [Column in typeof sources[Table][number]]: any }[] }

// The same ordered table/column definitions encode, decode and fence the data.
const snapshot = `json_array(${Object.entries(sources).map(([table, columns]) =>
  `(SELECT json_group_array(json_array(${columns.join(',')})) FROM (SELECT ${columns.join(',')} FROM ${table} ORDER BY ${columns.join(',')}))`).join(',')})`

export function decodePayrollSources(value: string): PayrollSourceRows {
  const tables: (string | number | null)[][][] = JSON.parse(value)
  return Object.fromEntries(Object.entries(sources).map(([table, columns], index) => [table,
    tables[index].map(row => Object.fromEntries(columns.map((column, columnIndex) => [column, row[columnIndex]]))),
  ])) as PayrollSourceRows
}

export async function payrollSources(env: Bindings) {
  return (await one<{ snapshot: string }>(env, `SELECT ${snapshot} AS snapshot`))!.snapshot
}
export const guardPayrollSources = (env: Bindings, expected: string) => guard(env, 'stale', `${snapshot} = ?`, expected)
