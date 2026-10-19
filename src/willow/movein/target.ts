// The import kit's native targets: imported departments, locations, people,
// employment periods (with their first terms and pay), proposed opening
// balances and documents, written into Willow's own tables with origin
// 'import'. Each effect is one complete native entity. Its snapshot includes
// every later native record that depends on it, so undo (strict) refuses to
// remove anything a person has since edited or built on: those need a
// compensating change in Willow first.
import { customPersonGuard, writeImportedCustomValues } from '../custom-fields/import'
import { ORGANIZATION_ACYCLIC } from '../organization-import'
import { PRIVATE, DEPENDENTS, readTarget, listTargets, matchesTargetSet } from './target-list'
import type { D1Database, D1Sql, D1TargetAdapter, Json, TargetRow } from '../../modules/import-kit/src/d1/index'

const sql = (text: string, ...params: unknown[]): D1Sql => ({ sql: text, params })

interface Kind {
  /** The entity's value as stored, plus a dependents count when later native records rely on it. */
  read(db: D1Database, id: string): Promise<{ value: Record<string, Json>; revision: string } | undefined>
  /** Exact equality of every stored column with the value, and no dependents. */
  matches(value: Record<string, any>, id: string, revision: string): D1Sql
  absent(id: string): D1Sql
  write(value: Record<string, any>, id: string, revision: string): D1Sql[]
  remove(id: string): D1Sql[]
  table: string
}

const eq = (pairs: [string, unknown][]) => ({ text: pairs.map(([column]) => `${column} IS ?`).join(' AND '), params: pairs.map(([, value]) => value ?? null) })
const { department: DEPARTMENT_DEPENDENTS, location: LOCATION_DEPENDENTS, person: PERSON_DEPENDENTS, period: PERIOD_DEPENDENTS, account: ACCOUNT_DEPENDENTS, document: DOCUMENT_DEPENDENTS } = DEPENDENTS
const noDependents = (expression: string, id: string) => ({ text: `${expression.replace(/\?1/g, '?')} = 0`, params: Array((expression.match(/\?1?/g) ?? []).length).fill(id) })

const department: Kind = {
  read: (db, id) => readTarget(db, 'department', id),
  matches(value, id, revision) { const free = noDependents(DEPARTMENT_DEPENDENTS, id); return sql(`EXISTS(SELECT 1 FROM wl_departments WHERE id = ? AND origin = 'import' AND name IS ? AND revision IS ?) AND ${free.text}`, id, value.name, revision, ...free.params) },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_departments WHERE id = ?)', id),
  write: (value, id, revision) => [sql("INSERT INTO wl_departments (id, name, origin, revision, created_at) VALUES (?, ?, 'import', ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, revision = excluded.revision WHERE wl_departments.origin = 'import'", id, value.name, revision, Date.now())],
  remove: id => [sql("DELETE FROM wl_departments WHERE id = ? AND origin = 'import'", id)],
  table: 'wl_departments',
}

const location: Kind = {
  read: (db, id) => readTarget(db, 'location', id),
  matches(value, id, revision) { const free = noDependents(LOCATION_DEPENDENTS, id); return sql(`EXISTS(SELECT 1 FROM wl_locations WHERE id = ? AND origin = 'import' AND name IS ? AND timezone IS ? AND revision IS ?) AND ${free.text}`, id, value.name, value.timezone, revision, ...free.params) },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_locations WHERE id = ?)', id),
  write: (value, id, revision) => [sql("INSERT INTO wl_locations (id, name, timezone, origin, revision, created_at) VALUES (?, ?, ?, 'import', ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, timezone = excluded.timezone, revision = excluded.revision WHERE wl_locations.origin = 'import'", id, value.name, value.timezone, revision, Date.now())],
  remove: id => [sql("DELETE FROM wl_locations WHERE id = ? AND origin = 'import'", id)],
  table: 'wl_locations',
}

const person: Kind = {
  read: (db, id) => readTarget(db, 'person', id),
  matches(value, id, revision) {
    const main = eq([['legal_name', value.legalName], ['preferred_name', value.preferredName], ['work_email', value.workEmail], ['employee_number', value.employeeNumber], ['revision', revision]])
    const contact = eq(PRIVATE.map(field => [field, value.private?.[field]]))
    const free = noDependents(PERSON_DEPENDENTS, id)
    const custom=customPersonGuard(value,id)
    return sql(`EXISTS(SELECT 1 FROM wl_people WHERE id = ? AND origin = 'import' AND ${main.text}) AND EXISTS(SELECT 1 FROM wl_person_private WHERE person_id = ? AND ${contact.text}) AND ${free.text} AND ${custom.map(g=>`(${g.sql})`).join(' AND ')}`, id, ...main.params, id, ...contact.params, ...free.params,...custom.flatMap(g=>g.params??[]))
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_people WHERE id = ?) AND NOT EXISTS(SELECT 1 FROM wl_person_private WHERE person_id = ?)', id, id),
  write: (value, id, revision) => [
    sql("INSERT INTO wl_people (id, legal_name, preferred_name, work_email, employee_number, origin, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'import', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET legal_name = excluded.legal_name, preferred_name = excluded.preferred_name, work_email = excluded.work_email, employee_number = excluded.employee_number, revision = excluded.revision, updated_at = excluded.updated_at WHERE wl_people.origin = 'import'", id, value.legalName, value.preferredName, value.workEmail, value.employeeNumber, revision, Date.now(), Date.now()),
    sql(`INSERT INTO wl_person_private (person_id, ${PRIVATE.join(', ')}) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(person_id) DO UPDATE SET ${PRIVATE.map(field => `${field} = excluded.${field}`).join(', ')} WHERE EXISTS(SELECT 1 FROM wl_people WHERE id = excluded.person_id AND origin = 'import')`, id, ...PRIVATE.map(field => value.private?.[field] ?? null)),
    ...writeImportedCustomValues(value,id),
  ],
  remove: id => [sql("DELETE FROM wl_custom_field_values WHERE person_id=? AND origin='import'",id),sql('DELETE FROM wl_person_private WHERE person_id = ?', id), sql("DELETE FROM wl_people WHERE id = ? AND origin = 'import'", id)],
  table: 'wl_people',
}

const period: Kind = {
  read: (db, id) => readTarget(db, 'period', id),
  matches(value, id, revision) {
    const main = eq([['person_id', value.person], ['start_date', value.startDate], ['end_date', value.endDate], ['end_reason', value.endReason], ['employment_type', value.employmentType], ['payroll_id', value.payrollId], ['revision', revision]])
    const terms = eq([['id', value.terms.id], ['period_id', id], ['effective_from', value.startDate], ['job_title', value.terms.jobTitle], ['department_id', value.terms.departmentId], ['location_id', value.terms.locationId], ['manager_person_id', value.terms.managerPersonId], ['schedule_id', value.terms.scheduleId], ['reason', value.terms.reason], ['status', value.terms.status]])
    const pay = eq([['term_id', value.terms.id], ['pay_basis', value.pay.basis], ['amount_cents', value.pay.amountCents], ['currency', value.pay.currency]])
    const free = noDependents(PERIOD_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM wl_periods WHERE id = ? AND origin = 'import' AND ${main.text}) AND EXISTS(SELECT 1 FROM wl_terms WHERE origin = 'import' AND ${terms.text}) AND EXISTS(SELECT 1 FROM wl_term_pay WHERE ${pay.text}) AND (SELECT COUNT(*) FROM wl_terms WHERE period_id = ?) = 1 AND ${free.text}`,
      id, ...main.params, ...terms.params, ...pay.params, id, ...free.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_periods WHERE id = ?) AND NOT EXISTS(SELECT 1 FROM wl_terms WHERE period_id = ?)', id, id),
  write: (value, id, revision) => [
    // The immutable terms/pay triggers allow deleting imported initial terms.
    // Base fences the exact before-image and absence of native dependents first.
    sql("DELETE FROM wl_term_pay WHERE term_id IN (SELECT t.id FROM wl_terms t JOIN wl_periods p ON p.id = t.period_id WHERE p.id = ? AND p.origin = 'import' AND t.origin = 'import')", id),
    sql("DELETE FROM wl_terms WHERE period_id = ? AND origin = 'import' AND EXISTS(SELECT 1 FROM wl_periods WHERE id = ? AND origin = 'import')", id, id),
    sql("INSERT INTO wl_periods (id, person_id, start_date, end_date, end_reason, employment_type, payroll_id, origin, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?, ?) ON CONFLICT(id) DO UPDATE SET person_id = excluded.person_id, start_date = excluded.start_date, end_date = excluded.end_date, end_reason = excluded.end_reason, employment_type = excluded.employment_type, payroll_id = excluded.payroll_id, revision = excluded.revision WHERE wl_periods.origin = 'import'", id, value.person, value.startDate, value.endDate, value.endReason, value.employmentType, value.payrollId, revision, Date.now()),
    sql("INSERT INTO wl_terms (id, period_id, effective_from, job_title, department_id, location_id, manager_person_id, schedule_id, reason, status, origin, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', 'import', ?)", value.terms.id, id, value.startDate, value.terms.jobTitle, value.terms.departmentId, value.terms.locationId, value.terms.managerPersonId, value.terms.scheduleId, value.terms.reason, value.terms.status, Date.now()),
    sql('INSERT INTO wl_term_pay (term_id, pay_basis, amount_cents, currency) VALUES (?, ?, ?, ?)', value.terms.id, value.pay.basis, value.pay.amountCents, value.pay.currency),
    sql(`INSERT INTO wl_guard (code, ok) SELECT 'stale', CASE WHEN (${ORGANIZATION_ACYCLIC}) THEN 1 ELSE 0 END`),
  ],
  remove: id => [
    sql("DELETE FROM wl_term_pay WHERE term_id IN (SELECT id FROM wl_terms WHERE period_id = ? AND origin = 'import')", id),
    sql("DELETE FROM wl_terms WHERE period_id = ? AND origin = 'import'", id),
    sql("DELETE FROM wl_periods WHERE id = ? AND origin = 'import'", id),
  ],
  table: 'wl_periods',
}

const account: Kind = {
  read: (db, id) => readTarget(db, 'account', id),
  matches(value, id, revision) {
    const main = eq([['period_id', value.period], ['policy_id', value.policy], ['policy_version_id', value.policyVersion], ['cutover_date', value.cutoverDate], ['opening_minutes', value.openingMinutes], ['opening_note', value.openingNote], ['opening_status', value.openingStatus], ['accrued_through', value.accruedThrough], ['revision', revision]])
    const free = noDependents(ACCOUNT_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM wl_leave_accounts WHERE id = ? AND origin = 'import' AND ${main.text}) AND ${free.text}`, id, ...main.params, ...free.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_leave_accounts WHERE id = ?)', id),
  write: (value, id, revision) => [sql("INSERT INTO wl_leave_accounts (id, period_id, policy_id, policy_version_id, cutover_date, opening_minutes, opening_note, opening_status, accrued_through, origin, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, ?) ON CONFLICT(id) DO UPDATE SET period_id = excluded.period_id, policy_id = excluded.policy_id, policy_version_id = excluded.policy_version_id, cutover_date = excluded.cutover_date, opening_minutes = excluded.opening_minutes, opening_note = excluded.opening_note, opening_status = excluded.opening_status, accrued_through = excluded.accrued_through, revision = excluded.revision WHERE wl_leave_accounts.origin = 'import'", id, value.period, value.policy, value.policyVersion, value.cutoverDate, value.openingMinutes, value.openingNote, value.openingStatus, value.accruedThrough, revision, Date.now())],
  remove: id => [sql("DELETE FROM wl_leave_accounts WHERE id = ? AND origin = 'import'", id)],
  table: 'wl_leave_accounts',
}

const document: Kind = {
  read: (db, id) => readTarget(db, 'document', id),
  matches(value, id, revision) {
    const main = eq([['person_id', value.person], ['category_id', value.category], ['title', value.title], ['revision', revision]])
    const version = eq([['id', value.version.id], ['document_id', id], ['number', 1], ['filename', value.version.filename], ['media_type', value.version.mediaType], ['size', value.version.size], ['sha256', value.version.sha256]])
    const free = noDependents(DOCUMENT_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM wl_documents WHERE id = ? AND origin = 'import' AND ${main.text}) AND EXISTS(SELECT 1 FROM wl_document_versions WHERE ${version.text}) AND ${free.text}`, id, ...main.params, ...version.params, ...free.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_documents WHERE id = ?) AND NOT EXISTS(SELECT 1 FROM wl_document_versions WHERE document_id = ?)', id, id),
  write: (value, id, revision) => [
    // Version rows are immutable. Replace only the import-owned first version;
    // the before-image guard refuses later versions or acknowledgements.
    sql("DELETE FROM wl_document_versions WHERE document_id = ? AND number = 1 AND EXISTS(SELECT 1 FROM wl_documents WHERE id = ? AND origin = 'import')", id, id),
    sql("INSERT INTO wl_documents (id, person_id, category_id, title, origin, revision, created_by, created_at) VALUES (?, ?, ?, ?, 'import', ?, 'import', ?) ON CONFLICT(id) DO UPDATE SET person_id = excluded.person_id, category_id = excluded.category_id, title = excluded.title, revision = excluded.revision WHERE wl_documents.origin = 'import'", id, value.person, value.category, value.title, revision, Date.now()),
    sql("INSERT INTO wl_document_versions (id, document_id, number, filename, media_type, size, sha256, uploaded_by, uploaded_at) VALUES (?, ?, 1, ?, ?, ?, ?, 'import', ?)", value.version.id, id, value.version.filename, value.version.mediaType, value.version.size, value.version.sha256, Date.now()),
  ],
  remove: id => [sql('DELETE FROM wl_document_versions WHERE document_id = ? AND number = 1', id), sql("DELETE FROM wl_documents WHERE id = ? AND origin = 'import'", id)],
  table: 'wl_documents',
}

export const KINDS: Record<string, Kind> = { department, location, person, period, account, document }
const kindOf = (name: string) => { const kind = KINDS[name]; if (!kind) throw new Error(`TARGET_KIND_UNKNOWN: ${name}`); return kind }

export const willowTargets: D1TargetAdapter = {
  async read(db, destination, kind, id) {
    const row = await kindOf(kind).read(db, id)
    return row ? { destination, targetKind: kind, targetId: id, value: row.value as Json, revision: row.revision } : undefined
  },
  matches(row, _destination, kind, id) {
    const value = row?.value as Record<string, any> | undefined
    // A row carrying dependents never matches: the fence requires the untouched entity.
    if (row && value && 'dependents' in value) return sql('0')
    return row ? kindOf(kind).matches(value!, id, row.revision) : kindOf(kind).absent(id)
  },
  write(row: TargetRow) {
    const kind = kindOf(row.targetKind)
    return [
      // Base also fences revision and the complete before-image. Refuse a
      // native id here before touching any of the target's owned child rows.
      sql(`INSERT INTO wl_guard (code, ok) SELECT 'stale', NOT EXISTS(SELECT 1 FROM ${kind.table} WHERE id = ? AND origin <> 'import')`, row.targetId),
      ...kind.write(row.value as Record<string, any>, row.targetId, row.revision),
    ]
  },
  remove(_destination, kind, id) {
    return kindOf(kind).remove(id)
  },
  list: listTargets,
  matchesMany: matchesTargetSet,
  matchesCount(count) {
    return sql(`(${Object.values(KINDS).map(kind => `(SELECT COUNT(*) FROM ${kind.table} WHERE origin = 'import')`).join(' + ')}) = ?`, count)
  },
}
