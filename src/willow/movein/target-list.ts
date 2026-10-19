// Internal import snapshots only: these include private fields for exact fences,
// and must never be returned through a native person/profile read door.
import { customImportInventory, customImportValue, customSetGuards } from '../custom-fields/import'
import type { D1Database, D1Sql, Json, TargetRow } from '../../modules/import-kit/src/d1/index'

export const PRIVATE = ['personal_email', 'phone', 'address', 'date_of_birth', 'emergency_contact'] as const
export const DEPENDENTS = {
  department: "(SELECT COUNT(*) FROM wl_terms WHERE department_id = ?1 AND origin = 'native')",
  location: "(SELECT COUNT(*) FROM wl_terms WHERE location_id = ?1 AND origin = 'native')",
  person: `((SELECT COUNT(*) FROM wl_periods WHERE person_id = ?1 AND origin = 'native') + (SELECT COUNT(*) FROM wl_documents WHERE person_id = ?1 AND origin = 'native')
    + (SELECT COUNT(*) FROM wl_members WHERE person_id = ?1) + (SELECT COUNT(*) FROM wl_terms WHERE manager_person_id = ?1 AND origin = 'native')
    + (SELECT COUNT(*) FROM wl_cases WHERE person_id = ?1) + (SELECT COUNT(*) FROM wl_leave_requests WHERE person_id = ?1) + (SELECT COUNT(*) FROM wl_acknowledgements WHERE person_id = ?1) + (SELECT COUNT(*) FROM wl_custom_field_values WHERE person_id = ?1 AND origin = 'native'))`,
  period: `((SELECT COUNT(*) FROM wl_terms WHERE period_id = ?1 AND origin = 'native') + (SELECT COUNT(*) FROM wl_leave_accounts WHERE period_id = ?1 AND origin = 'native')
    + (SELECT COUNT(*) FROM wl_cases WHERE period_id = ?1) + (SELECT COUNT(*) FROM wl_payroll_items WHERE source_id = ?1 AND source_kind IN ('start', 'end')))`,
  account: '((SELECT COUNT(*) FROM wl_ledger WHERE account_id = ?1) + (SELECT COUNT(*) FROM wl_leave_requests WHERE account_id = ?1))',
  document: '((SELECT COUNT(*) FROM wl_document_versions WHERE document_id = ?1 AND number > 1) + (SELECT COUNT(*) FROM wl_acknowledgements a JOIN wl_document_versions v ON v.id = a.version_id WHERE v.document_id = ?1))',
}

type Value = Record<string, any>
interface Projection {
  table: string
  joins?: string
  // Value paths and SQL columns share one ordering for reads and exact set fences.
  fields: [string, string][]
  valid?: string
}
const projections: Record<string, Projection> = {
  department: { table: 'wl_departments', fields: [['name', 'r.name']] },
  location: { table: 'wl_locations', fields: [['name', 'r.name'], ['timezone', 'r.timezone']] },
  person: {
    table: 'wl_people', joins: 'JOIN wl_person_private v ON v.person_id = r.id',
    fields: [['legalName', 'r.legal_name'], ['preferredName', 'r.preferred_name'], ['workEmail', 'r.work_email'], ['employeeNumber', 'r.employee_number'], ...PRIVATE.map(field => [`private.${field}`, `v.${field}`] as [string, string])],
  },
  period: {
    table: 'wl_periods',
    joins: "LEFT JOIN wl_terms t ON t.id = (SELECT id FROM wl_terms WHERE period_id = r.id AND origin = 'import' LIMIT 1) LEFT JOIN wl_term_pay p ON p.term_id = t.id",
    fields: [['person', 'r.person_id'], ['startDate', 'r.start_date'], ['endDate', 'r.end_date'], ['endReason', 'r.end_reason'], ['employmentType', 'r.employment_type'], ['payrollId', 'r.payroll_id'],
      ['terms.id', 't.id'], ['terms.jobTitle', 't.job_title'], ['terms.departmentId', 't.department_id'], ['terms.locationId', 't.location_id'], ['terms.managerPersonId', 't.manager_person_id'], ['terms.scheduleId', 't.schedule_id'], ['terms.reason', 't.reason'], ['terms.status', 't.status'],
      ['pay.basis', 'p.pay_basis'], ['pay.amountCents', 'p.amount_cents'], ['pay.currency', 'p.currency']],
    // These are also required by the single-row matches guard, even though they
    // are not separate fields in the public kit value.
    valid: '(SELECT COUNT(*) FROM wl_terms WHERE period_id = r.id) = 1 AND t.effective_from IS r.start_date AND p.term_id IS NOT NULL',
  },
  account: {
    table: 'wl_leave_accounts',
    fields: [['period', 'r.period_id'], ['policy', 'r.policy_id'], ['policyVersion', 'r.policy_version_id'], ['cutoverDate', 'r.cutover_date'], ['openingMinutes', 'r.opening_minutes'], ['openingNote', 'r.opening_note'], ['openingStatus', 'r.opening_status'], ['accruedThrough', 'r.accrued_through']],
  },
  document: {
    table: 'wl_documents', joins: 'LEFT JOIN wl_document_versions v ON v.document_id = r.id AND v.number = 1',
    fields: [['person', 'r.person_id'], ['category', 'r.category_id'], ['title', 'r.title'], ['version.id', 'v.id'], ['version.filename', 'v.filename'], ['version.mediaType', 'v.media_type'], ['version.size', 'v.size'], ['version.sha256', 'v.sha256']],
    valid: 'v.id IS NOT NULL',
  },
}
const projection = (kind: string) => { const found = projections[kind]; if (!found) throw new Error(`TARGET_KIND_UNKNOWN: ${kind}`); return found }
const query = (kind: string) => {
  const p = projection(kind)
  const dependents = DEPENDENTS[kind as keyof typeof DEPENDENTS].replace(/\?1/g, 'r.id')
  return `SELECT r.id, r.revision, ${p.fields.map(([, column], index) => `${column} AS f${index}`).join(', ')}, ${dependents} AS dependents, CASE WHEN ${p.valid ?? '1'} THEN 1 ELSE 0 END AS valid FROM ${p.table} r ${p.joins ?? ''} WHERE r.origin = 'import'`
}
function valueOf(kind: string, row: Value): Record<string, Json> {
  const value: Value = {}
  projection(kind).fields.forEach(([path], index) => {
    const [parent, child] = path.split('.')
    if (child) (value[parent] ??= {})[child] = row[`f${index}`]
    else value[parent] = row[`f${index}`]
  })
  if (kind === 'period' && value.terms.id === null) { value.terms = null; value.pay = null }
  if (row.dependents) value.dependents = row.dependents
  return value
}
export async function readTarget(db: D1Database, kind: string, id: string) {
  const row = await db.prepare(`${query(kind)} AND r.id = ?`).bind(id).first<Value>()
  if(!row) return undefined
  const value=valueOf(kind,row)
  if(kind==='person') { const inventory=await customImportInventory(db); Object.assign(value,customImportValue(inventory.values.filter(v=>v.person_id===id),inventory.latest)) }
  return {value,revision:row.revision as string}
}
// A fixed set of reads regardless of import size, including typed owned history.
export async function listTargets(db: D1Database, destination: string): Promise<TargetRow[]> {
  const rows: TargetRow[] = []
  const inventory=await customImportInventory(db)
  for (const kind of Object.keys(projections)) {
    const result = await db.prepare(`${query(kind)} ORDER BY r.id`).all<Value>()
    rows.push(...result.results.map(row => ({ destination, targetKind: kind, targetId: row.id as string, revision: row.revision as string, value: {...valueOf(kind,row),...(kind==='person'?customImportValue(inventory.values.filter(v=>v.person_id===row.id),inventory.latest):{})} })))
  }
  return rows
}

const utf8 = new TextEncoder()
const hex = (text: string) => Array.from(utf8.encode(text), byte => byte.toString(16).toUpperCase().padStart(2, '0')).join('')
const field = (value: unknown) => value == null ? 'n' : `${utf8.encode(String(value)).length}:${String(value)}`
const byteOrder = (a: string, b: string) => {
  const x = utf8.encode(a), y = utf8.encode(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]
  return x.length - y.length
}
// Exact length-prefixed bytes, including nulls and embedded NULs, avoid inlining
// one SQL predicate per field per target. Keep the original no-dependents rule.
export function matchesTargetSet(rows: TargetRow[], destination: string): D1Sql[] {
  if (rows.some(row => row.destination !== destination || !projections[row.targetKind])) return [{ sql: '0' }]
  const guards: D1Sql[] = []
  for (const [kind, p] of Object.entries(projections)) {
    const members = rows.filter(row => row.targetKind === kind).sort((a, b) => byteOrder(a.targetId, b.targetId))
    const expected = members.map(row => [row.targetId, row.revision, ...p.fields.map(([path]) => path.split('.').reduce<any>((value, part) => value?.[part], row.value)), (row.value as Value).dependents ?? 0, 1].map(field).join('')).join('')
    const columns = ['id', 'revision', ...p.fields.map((_, index) => `f${index}`), 'dependents', 'valid']
    const bytes = columns.map(column => `CASE WHEN ${column} IS NULL THEN 'n' ELSE length(CAST(CAST(${column} AS TEXT) AS BLOB))||':'||CAST(${column} AS TEXT) END`).join('||')
    guards.push(
      { sql: `(SELECT COUNT(*) FROM ${p.table} WHERE origin = 'import') = ?`, params: [members.length] },
      { sql: `(SELECT hex(CAST(coalesce(group_concat(${bytes}, '' ORDER BY id), '') AS BLOB)) FROM (${query(kind)})) = ?`, params: [hex(expected)] },
    )
  }
  return [...guards,...customSetGuards(rows)]
}
