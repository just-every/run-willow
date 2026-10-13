// The import kit's native targets: imported departments, locations, people,
// employment periods (with their first terms and pay), proposed opening
// balances and documents, written into Willow's own tables with origin
// 'import'. Each effect is one complete native entity. Its snapshot includes
// every later native record that depends on it, so undo (strict) refuses to
// remove anything a person has since edited or built on: those need a
// compensating change in Willow first.
import type { D1Database, D1Sql, D1TargetAdapter, Json, TargetRow } from '../../modules/import-kit/src/d1/index'

const sql = (text: string, ...params: unknown[]): D1Sql => ({ sql: text, params })
const PRIVATE = ['personal_email', 'phone', 'address', 'date_of_birth', 'emergency_contact'] as const

interface Kind {
  /** The entity's value as stored, plus a dependents count when later native records rely on it. */
  read(db: D1Database, id: string): Promise<{ value: Record<string, Json>; revision: string } | undefined>
  /** Exact equality of every stored column with the value, and no dependents. */
  matches(value: Record<string, any>, id: string, revision: string): D1Sql
  absent(id: string): D1Sql
  write(value: Record<string, any>, id: string, revision: string): D1Sql[]
  remove(id: string): D1Sql[]
  ids(db: D1Database): Promise<string[]>
  count: string
}

const eq = (pairs: [string, unknown][]) => ({ text: pairs.map(([column]) => `${column} IS ?`).join(' AND '), params: pairs.map(([, value]) => value ?? null) })
const withDependents = (value: Record<string, Json>, dependents: number) => dependents ? { ...value, dependents } : value
const idsOf = async (db: D1Database, table: string) => (await db.prepare(`SELECT id FROM ${table} WHERE origin = 'import' ORDER BY id`).all<{ id: string }>()).results.map(row => row.id)

const DEPARTMENT_DEPENDENTS = "(SELECT COUNT(*) FROM wl_terms WHERE department_id = ? AND origin = 'native')"
const LOCATION_DEPENDENTS = "(SELECT COUNT(*) FROM wl_terms WHERE location_id = ? AND origin = 'native')"
const PERSON_DEPENDENTS = `((SELECT COUNT(*) FROM wl_periods WHERE person_id = ?1 AND origin = 'native') + (SELECT COUNT(*) FROM wl_documents WHERE person_id = ?1 AND origin = 'native')
  + (SELECT COUNT(*) FROM wl_members WHERE person_id = ?1) + (SELECT COUNT(*) FROM wl_terms WHERE manager_person_id = ?1 AND origin = 'native')
  + (SELECT COUNT(*) FROM wl_cases WHERE person_id = ?1) + (SELECT COUNT(*) FROM wl_leave_requests WHERE person_id = ?1) + (SELECT COUNT(*) FROM wl_acknowledgements WHERE person_id = ?1))`
const PERIOD_DEPENDENTS = `((SELECT COUNT(*) FROM wl_terms WHERE period_id = ?1 AND origin = 'native') + (SELECT COUNT(*) FROM wl_leave_accounts WHERE period_id = ?1 AND origin = 'native')
  + (SELECT COUNT(*) FROM wl_cases WHERE period_id = ?1) + (SELECT COUNT(*) FROM wl_payroll_items WHERE source_id = ?1 AND source_kind IN ('start', 'end')))`
const ACCOUNT_DEPENDENTS = '((SELECT COUNT(*) FROM wl_ledger WHERE account_id = ?1) + (SELECT COUNT(*) FROM wl_leave_requests WHERE account_id = ?1))'
const DOCUMENT_DEPENDENTS = '((SELECT COUNT(*) FROM wl_document_versions WHERE document_id = ?1 AND number > 1) + (SELECT COUNT(*) FROM wl_acknowledgements a JOIN wl_document_versions v ON v.id = a.version_id WHERE v.document_id = ?1))'

async function dependents(db: D1Database, expression: string, id: string) {
  return (await db.prepare(`SELECT ${expression.replace(/\?1/g, '?')} AS n`).bind(...Array((expression.match(/\?1?/g) ?? []).length).fill(id)).first<{ n: number }>())!.n
}
const noDependents = (expression: string, id: string) => ({ text: `${expression.replace(/\?1/g, '?')} = 0`, params: Array((expression.match(/\?1?/g) ?? []).length).fill(id) })

const department: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT name, revision FROM wl_departments WHERE id = ? AND origin = 'import'").bind(id).first<any>()
    return row ? { value: withDependents({ name: row.name }, await dependents(db, DEPARTMENT_DEPENDENTS, id)), revision: row.revision } : undefined
  },
  matches(value, id, revision) { const free = noDependents(DEPARTMENT_DEPENDENTS, id); return sql(`EXISTS(SELECT 1 FROM wl_departments WHERE id = ? AND origin = 'import' AND name IS ? AND revision IS ?) AND ${free.text}`, id, value.name, revision, ...free.params) },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_departments WHERE id = ?)', id),
  write: (value, id, revision) => [sql("INSERT INTO wl_departments (id, name, origin, revision, created_at) VALUES (?, ?, 'import', ?, ?)", id, value.name, revision, Date.now())],
  remove: id => [sql("DELETE FROM wl_departments WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'wl_departments'),
  count: "(SELECT COUNT(*) FROM wl_departments WHERE origin = 'import')",
}

const location: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT name, timezone, revision FROM wl_locations WHERE id = ? AND origin = 'import'").bind(id).first<any>()
    return row ? { value: withDependents({ name: row.name, timezone: row.timezone }, await dependents(db, LOCATION_DEPENDENTS, id)), revision: row.revision } : undefined
  },
  matches(value, id, revision) { const free = noDependents(LOCATION_DEPENDENTS, id); return sql(`EXISTS(SELECT 1 FROM wl_locations WHERE id = ? AND origin = 'import' AND name IS ? AND timezone IS ? AND revision IS ?) AND ${free.text}`, id, value.name, value.timezone, revision, ...free.params) },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_locations WHERE id = ?)', id),
  write: (value, id, revision) => [sql("INSERT INTO wl_locations (id, name, timezone, origin, revision, created_at) VALUES (?, ?, ?, 'import', ?, ?)", id, value.name, value.timezone, revision, Date.now())],
  remove: id => [sql("DELETE FROM wl_locations WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'wl_locations'),
  count: "(SELECT COUNT(*) FROM wl_locations WHERE origin = 'import')",
}

const person: Kind = {
  async read(db, id) {
    const row = await db.prepare(`SELECT p.*, ${PRIVATE.map(field => `v.${field}`).join(', ')} FROM wl_people p JOIN wl_person_private v ON v.person_id = p.id WHERE p.id = ? AND p.origin = 'import'`).bind(id).first<any>()
    if (!row) return undefined
    return { value: withDependents({ legalName: row.legal_name, preferredName: row.preferred_name, workEmail: row.work_email, employeeNumber: row.employee_number, private: Object.fromEntries(PRIVATE.map(field => [field, row[field]])) }, await dependents(db, PERSON_DEPENDENTS, id)), revision: row.revision }
  },
  matches(value, id, revision) {
    const main = eq([['legal_name', value.legalName], ['preferred_name', value.preferredName], ['work_email', value.workEmail], ['employee_number', value.employeeNumber], ['revision', revision]])
    const contact = eq(PRIVATE.map(field => [field, value.private?.[field]]))
    const free = noDependents(PERSON_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM wl_people WHERE id = ? AND origin = 'import' AND ${main.text}) AND EXISTS(SELECT 1 FROM wl_person_private WHERE person_id = ? AND ${contact.text}) AND ${free.text}`, id, ...main.params, id, ...contact.params, ...free.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_people WHERE id = ?) AND NOT EXISTS(SELECT 1 FROM wl_person_private WHERE person_id = ?)', id, id),
  write: (value, id, revision) => [
    sql("INSERT INTO wl_people (id, legal_name, preferred_name, work_email, employee_number, origin, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'import', ?, ?, ?)", id, value.legalName, value.preferredName, value.workEmail, value.employeeNumber, revision, Date.now(), Date.now()),
    sql(`INSERT INTO wl_person_private (person_id, ${PRIVATE.join(', ')}) VALUES (?, ?, ?, ?, ?, ?)`, id, ...PRIVATE.map(field => value.private?.[field] ?? null)),
  ],
  remove: id => [sql('DELETE FROM wl_person_private WHERE person_id = ?', id), sql("DELETE FROM wl_people WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'wl_people'),
  count: "(SELECT COUNT(*) FROM wl_people WHERE origin = 'import')",
}

const period: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT * FROM wl_periods WHERE id = ? AND origin = 'import'").bind(id).first<any>()
    if (!row) return undefined
    const terms = await db.prepare("SELECT t.*, p.pay_basis, p.amount_cents, p.currency FROM wl_terms t LEFT JOIN wl_term_pay p ON p.term_id = t.id WHERE t.period_id = ? AND t.origin = 'import'").bind(id).first<any>()
    return {
      revision: row.revision,
      value: withDependents({
        person: row.person_id, startDate: row.start_date, endDate: row.end_date, endReason: row.end_reason, employmentType: row.employment_type, payrollId: row.payroll_id,
        terms: terms ? { id: terms.id, jobTitle: terms.job_title, departmentId: terms.department_id, locationId: terms.location_id, managerPersonId: terms.manager_person_id, scheduleId: terms.schedule_id, reason: terms.reason, status: terms.status } : null,
        pay: terms ? { basis: terms.pay_basis, amountCents: terms.amount_cents, currency: terms.currency } : null,
      }, await dependents(db, PERIOD_DEPENDENTS, id)),
    }
  },
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
    sql("INSERT INTO wl_periods (id, person_id, start_date, end_date, end_reason, employment_type, payroll_id, origin, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?, ?)", id, value.person, value.startDate, value.endDate, value.endReason, value.employmentType, value.payrollId, revision, Date.now()),
    sql("INSERT INTO wl_terms (id, period_id, effective_from, job_title, department_id, location_id, manager_person_id, schedule_id, reason, status, origin, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', 'import', ?)", value.terms.id, id, value.startDate, value.terms.jobTitle, value.terms.departmentId, value.terms.locationId, value.terms.managerPersonId, value.terms.scheduleId, value.terms.reason, value.terms.status, Date.now()),
    sql('INSERT INTO wl_term_pay (term_id, pay_basis, amount_cents, currency) VALUES (?, ?, ?, ?)', value.terms.id, value.pay.basis, value.pay.amountCents, value.pay.currency),
  ],
  remove: id => [
    sql("DELETE FROM wl_term_pay WHERE term_id IN (SELECT id FROM wl_terms WHERE period_id = ? AND origin = 'import')", id),
    sql("DELETE FROM wl_terms WHERE period_id = ? AND origin = 'import'", id),
    sql("DELETE FROM wl_periods WHERE id = ? AND origin = 'import'", id),
  ],
  ids: db => idsOf(db, 'wl_periods'),
  count: "(SELECT COUNT(*) FROM wl_periods WHERE origin = 'import')",
}

const account: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT * FROM wl_leave_accounts WHERE id = ? AND origin = 'import'").bind(id).first<any>()
    return row ? { revision: row.revision, value: withDependents({ period: row.period_id, policy: row.policy_id, policyVersion: row.policy_version_id, cutoverDate: row.cutover_date, openingMinutes: row.opening_minutes, openingNote: row.opening_note, openingStatus: row.opening_status, accruedThrough: row.accrued_through }, await dependents(db, ACCOUNT_DEPENDENTS, id)) } : undefined
  },
  matches(value, id, revision) {
    const main = eq([['period_id', value.period], ['policy_id', value.policy], ['policy_version_id', value.policyVersion], ['cutover_date', value.cutoverDate], ['opening_minutes', value.openingMinutes], ['opening_note', value.openingNote], ['opening_status', value.openingStatus], ['accrued_through', value.accruedThrough], ['revision', revision]])
    const free = noDependents(ACCOUNT_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM wl_leave_accounts WHERE id = ? AND origin = 'import' AND ${main.text}) AND ${free.text}`, id, ...main.params, ...free.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_leave_accounts WHERE id = ?)', id),
  write: (value, id, revision) => [sql("INSERT INTO wl_leave_accounts (id, period_id, policy_id, policy_version_id, cutover_date, opening_minutes, opening_note, opening_status, accrued_through, origin, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, ?)", id, value.period, value.policy, value.policyVersion, value.cutoverDate, value.openingMinutes, value.openingNote, value.openingStatus, value.accruedThrough, revision, Date.now())],
  remove: id => [sql("DELETE FROM wl_leave_accounts WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'wl_leave_accounts'),
  count: "(SELECT COUNT(*) FROM wl_leave_accounts WHERE origin = 'import')",
}

const document: Kind = {
  async read(db, id) {
    const row = await db.prepare("SELECT d.*, v.id AS version_id, v.filename, v.media_type, v.size, v.sha256 FROM wl_documents d LEFT JOIN wl_document_versions v ON v.document_id = d.id AND v.number = 1 WHERE d.id = ? AND d.origin = 'import'").bind(id).first<any>()
    return row ? { revision: row.revision, value: withDependents({ person: row.person_id, category: row.category_id, title: row.title, version: { id: row.version_id, filename: row.filename, mediaType: row.media_type, size: row.size, sha256: row.sha256 } }, await dependents(db, DOCUMENT_DEPENDENTS, id)) } : undefined
  },
  matches(value, id, revision) {
    const main = eq([['person_id', value.person], ['category_id', value.category], ['title', value.title], ['revision', revision]])
    const version = eq([['id', value.version.id], ['document_id', id], ['number', 1], ['filename', value.version.filename], ['media_type', value.version.mediaType], ['size', value.version.size], ['sha256', value.version.sha256]])
    const free = noDependents(DOCUMENT_DEPENDENTS, id)
    return sql(`EXISTS(SELECT 1 FROM wl_documents WHERE id = ? AND origin = 'import' AND ${main.text}) AND EXISTS(SELECT 1 FROM wl_document_versions WHERE ${version.text}) AND ${free.text}`, id, ...main.params, ...version.params, ...free.params)
  },
  absent: id => sql('NOT EXISTS(SELECT 1 FROM wl_documents WHERE id = ?) AND NOT EXISTS(SELECT 1 FROM wl_document_versions WHERE document_id = ?)', id, id),
  write: (value, id, revision) => [
    sql("INSERT INTO wl_documents (id, person_id, category_id, title, origin, revision, created_by, created_at) VALUES (?, ?, ?, ?, 'import', ?, 'import', ?)", id, value.person, value.category, value.title, revision, Date.now()),
    sql("INSERT INTO wl_document_versions (id, document_id, number, filename, media_type, size, sha256, uploaded_by, uploaded_at) VALUES (?, ?, 1, ?, ?, ?, ?, 'import', ?)", value.version.id, id, value.version.filename, value.version.mediaType, value.version.size, value.version.sha256, Date.now()),
  ],
  remove: id => [sql('DELETE FROM wl_document_versions WHERE document_id = ? AND number = 1', id), sql("DELETE FROM wl_documents WHERE id = ? AND origin = 'import'", id)],
  ids: db => idsOf(db, 'wl_documents'),
  count: "(SELECT COUNT(*) FROM wl_documents WHERE origin = 'import')",
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
    return kindOf(row.targetKind).write(row.value as Record<string, any>, row.targetId, row.revision)
  },
  remove(_destination, kind, id) {
    return kindOf(kind).remove(id)
  },
  async list(db, destination) {
    const rows: TargetRow[] = []
    for (const [name, kind] of Object.entries(KINDS)) for (const id of await kind.ids(db)) rows.push((await this.read(db, destination, name, id))!)
    return rows
  },
  matchesCount(count) {
    return sql(`(${Object.values(KINDS).map(kind => kind.count).join(' + ')}) = ?`, count)
  },
}
