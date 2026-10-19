// PEOPLE-003: record-table CSV for reports and exports. One layout serves both,
// and the BambooHR move-in reads it back (employeeNumber identifies the person).
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { sees } from '../access'
import { employeeCsv } from '../export-formats'
import { directory } from '../profile'
import type { FieldValue } from '../custom-fields/types'
import { tableReport } from './rows'
import type { Column } from './schema'

const cell = (value: FieldValue | undefined) => value === null || value === undefined ? '' : String(value)

export function tableRows(columns: Column[], rows: { personId: string; employeeNumber: string | null; rowId: string; effectiveFrom: string; values: Record<string, FieldValue> }[]): string[][] {
  return [['person_id', 'employeeNumber', 'row_id', 'effectiveFrom', ...columns.map(column => column.key)],
    ...rows.map(row => [row.personId, row.employeeNumber ?? '', row.rowId, row.effectiveFrom, ...columns.map(column => cell(row.values[column.key]))])]
}

export async function tableReportCsv(env: Bindings, actor: Actor, key: string, asOf: string) {
  const people = await directory(env, actor, asOf)
  const report = await tableReport(env, actor, key, asOf, people)
  const numbers = new Map((await env.DB.prepare('SELECT id, employee_number FROM wl_people').all<{ id: string; employee_number: string | null }>()).results.map(row => [row.id, row.employee_number]))
  return employeeCsv(tableRows(report.table.columns, report.rows.map(row => ({ ...row, employeeNumber: sees(actor, row.personId, 'employment') ? numbers.get(row.personId) ?? null : null }))))
}
