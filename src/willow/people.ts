import { selfWriteModes, type SelfField } from './levels/personal'
// Flows 3 and 6: people, employment periods and effective-dated terms.
// A person is separate from each employment period; terms are complete
// versions effective from a date, never edited in place.
import { customValueStatements, customValuesInput } from './custom-fields/store'
import type { Bindings } from '../auth.server'
import { normalizeEmail } from '../modules/operator-auth/index.mjs'
import { can, requirePermission, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { isDate, requireDate } from './dates'
import { CURRENT_TERMS } from './employment'
import { managerChangeGuard } from './organization'
import type { Input } from './input'

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'casual', 'fixed_term'] as const
export const PRIVATE_FIELDS = ['personal_email', 'phone', 'address', 'date_of_birth', 'emergency_contact'] as const
export type PrivateField = typeof PRIVATE_FIELDS[number]
export const PRIVATE_LABELS: Record<PrivateField, string> = { personal_email: 'Personal email', phone: 'Phone', address: 'Home address', date_of_birth: 'Date of birth', emergency_contact: 'Emergency contact' }

export interface PersonInput { legalName: string; preferredName: string | null; workEmail: string | null; employeeNumber: string | null; private: Record<PrivateField, string | null> }
export interface TermsInput { effectiveFrom: string; jobTitle: string; departmentId: string | null; locationId: string | null; managerPersonId: string | null; scheduleId: string | null; reason: string }
export interface PayInput { basis: 'salary' | 'hourly' | 'unknown'; amountCents: number | null }

export function readPerson(input: Input): PersonInput {
  const workEmail = input.text('workEmail', { optional: true, max: 254 })
  const normalized = workEmail ? normalizeEmail(workEmail) : null
  insist(!workEmail || normalized, 'invalid_workEmail')
  return {
    legalName: input.text('legalName', { max: 160 }),
    preferredName: input.text('preferredName', { optional: true, max: 120 }) || null,
    workEmail: normalized || null,
    employeeNumber: input.text('employeeNumber', { optional: true, max: 40 }) || null,
    private: readPrivate(input),
  }
}

/** All five private fields; an absent or empty field clears it. */
export function readPrivate(input: Input): Record<PrivateField, string | null> {
  const values = Object.fromEntries(PRIVATE_FIELDS.map(field => [field, input.text(field, { optional: true, max: 400 }) || null])) as Record<PrivateField, string | null>
  insist(!values.date_of_birth || isDate(values.date_of_birth), 'invalid_date_of_birth')
  return values
}

export async function readTerms(env: Bindings, input: Input, base: Row | null, effectiveFrom: string, defaultReason = ''): Promise<TermsInput> {
  const pick = (name: string, column: string) => input.has(name) ? input.text(name, { max: 100 }) || null : (base?.[column] ?? null)
  const terms: TermsInput = {
    effectiveFrom,
    jobTitle: input.has('jobTitle') ? input.text('jobTitle', { max: 120 }) : base?.job_title,
    departmentId: pick('departmentId', 'department_id'),
    locationId: pick('locationId', 'location_id'),
    managerPersonId: pick('managerPersonId', 'manager_person_id'),
    scheduleId: pick('scheduleId', 'schedule_id'),
    reason: input.text('reason', { max: 300, optional: !!defaultReason }) || defaultReason,
  }
  insist(terms.jobTitle, 'missing_jobTitle')
  if (terms.departmentId) insist(await one(env, 'SELECT 1 FROM wl_departments WHERE id = ?', terms.departmentId), 'department_not_found', 404)
  if (terms.locationId) insist(await one(env, 'SELECT 1 FROM wl_locations WHERE id = ?', terms.locationId), 'location_not_found', 404)
  if (terms.scheduleId) insist(await one(env, 'SELECT 1 FROM wl_schedules WHERE id = ?', terms.scheduleId), 'schedule_not_found', 404)
  if (terms.managerPersonId) insist(await one(env, 'SELECT 1 FROM wl_people WHERE id = ?', terms.managerPersonId), 'manager_not_found', 404)
  return terms
}

/** Pay is read only when the request supplies it; setting pay needs pay.read. */
export function readPay(actor: Actor, input: Input, { approved = false } = {}): PayInput | null {
  if (!input.has('payBasis') && !input.has('payAmount')) return null
  if (!approved) requirePermission(actor, 'pay.read')
  const basis = input.text('payBasis', { max: 10 }) as PayInput['basis']
  insist(['salary', 'hourly', 'unknown'].includes(basis), 'invalid_payBasis')
  const amount = input.text('payAmount', { optional: true, max: 20 })
  insist(!amount || /^\d{1,9}(\.\d{1,2})?$/.test(amount), 'invalid_payAmount')
  insist(basis === 'unknown' || amount, 'missing_payAmount')
  return { basis, amountCents: amount ? Math.round(Number(amount) * 100) : null }
}

export function personStatements(env: Bindings, id: string, person: PersonInput, origin: 'native' | 'import' = 'native', revision = newId()) {
  return [
    stmt(env, 'INSERT INTO wl_people (id, legal_name, preferred_name, work_email, employee_number, origin, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, person.legalName, person.preferredName, person.workEmail, person.employeeNumber, origin, revision, now(), now()),
    stmt(env, `INSERT INTO wl_person_private (person_id, ${PRIVATE_FIELDS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?)`, id, ...PRIVATE_FIELDS.map(field => person.private[field])),
  ]
}

export function termsStatements(env: Bindings, termId: string, periodId: string, terms: TermsInput, pay: PayInput, currency: string, recordedBy: string, origin: 'native' | 'import' = 'native') {
  return [
    stmt(env, 'INSERT INTO wl_terms (id, period_id, effective_from, job_title, department_id, location_id, manager_person_id, schedule_id, reason, origin, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', termId, periodId, terms.effectiveFrom, terms.jobTitle, terms.departmentId, terms.locationId, terms.managerPersonId, terms.scheduleId, terms.reason, origin, recordedBy, now()),
    stmt(env, 'INSERT INTO wl_term_pay (term_id, pay_basis, amount_cents, currency) VALUES (?, ?, ?, ?)', termId, pay.basis, pay.amountCents, currency),
  ]
}

async function uniqueIdentity(env: Bindings, person: PersonInput, exceptId = '') {
  if (person.workEmail) insist(!await one(env, 'SELECT 1 FROM wl_people WHERE work_email = ? AND id <> ?', person.workEmail, exceptId), 'work_email_taken', 409)
  if (person.employeeNumber) insist(!await one(env, 'SELECT 1 FROM wl_people WHERE employee_number = ? AND id <> ?', person.employeeNumber, exceptId), 'employee_number_taken', 409)
}

export async function createPersonStatements(env: Bindings, person: PersonInput) {
  await uniqueIdentity(env, person)
  const id = newId()
  return { id, statements: personStatements(env, id, person) }
}

export async function updatePerson(env: Bindings, actor: Actor, input: Input) {
  const id = input.text('person', { max: 100 }), revision = input.text('revision', { max: 100 })
  const existing = await one(env, 'SELECT * FROM wl_people WHERE id = ?', id)
  insist(existing, 'person_not_found', 404)
  const self = actor.personId === id
  const accessSnapshot=self ? (await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq : null
  const modes=self ? await selfWriteModes(env,actor) : null
  const writable=(field:SelfField)=>insist(!modes||modes[field]==='edit',modes?.[field]==='approval'?'hr_approval_required':'field_read_only',403)
  if(self&&input.provided('preferredName')&&input.text('preferredName',{optional:true})!==(existing.preferred_name??'')) writable('preferredName')
  insist(can(actor, 'people.manage') || self, 'forbidden', 403)
  const statements: D1PreparedStatement[] = [guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_people WHERE id = ? AND revision = ?)', id, revision)]
  if(self) statements.push(guard(env,'access_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',accessSnapshot))
  const next = newId(), changed: string[] = []
  if (self && input.has('legalName')) insist(input.text('legalName') === existing.legal_name, 'hr_approval_required', 403)
  if (can(actor, 'people.manage') && input.has('legalName')) {
    const person = readPerson(input)
    await uniqueIdentity(env, person, id)
    statements.push(stmt(env, 'UPDATE wl_people SET legal_name = ?, preferred_name = ?, work_email = ?, employee_number = ? WHERE id = ?', person.legalName, person.preferredName, person.workEmail, person.employeeNumber, id))
    changed.push('directory')
  }
  if (self && input.provided('preferredName') && !input.has('legalName')) {
    statements.push(stmt(env, 'UPDATE wl_people SET preferred_name = ? WHERE id = ?', input.text('preferredName', { optional: true, max: 120 }) || null, id))
    changed.push('preferredName')
  }
  // Private contact details: the person themselves, or HR holding both people.manage and people.private.
  if (PRIVATE_FIELDS.some(field => input.has(field)) || input.flag('private')) {
    insist(self || (can(actor, 'people.manage') && can(actor, 'people.private')), 'forbidden', 403)
    const values = readPrivate(input)
    if(self) {
      const previous=(await one(env,'SELECT * FROM wl_person_private WHERE person_id=?',id))!
      for(const field of PRIVATE_FIELDS) if(values[field]!==previous[field]) writable(field)
    }
    statements.push(stmt(env, `UPDATE wl_person_private SET ${PRIVATE_FIELDS.map(field => `${field} = ?`).join(', ')} WHERE person_id = ?`, ...PRIVATE_FIELDS.map(field => values[field]), id))
    changed.push('private')
  }
  const customInput = customValuesInput(input)
  const hasCustom = input.has('customValues') || input.has('values') || input.list('customField').length > 0
  if (can(actor, 'people.manage') || hasCustom) {
    const custom = await customValueStatements(env, actor, id, customInput, input.has('effectiveFrom') ? input.text('effectiveFrom') : actor.today, { requireAll: true })
    statements.push(...custom.guards, ...custom.statements)
    if (hasCustom) changed.push('customFields')
  }
  insist(changed.length, 'nothing_to_change')
  statements.push(stmt(env, 'UPDATE wl_people SET revision = ?, updated_at = ? WHERE id = ?', next, now(), id))
  await commit(env, statements, { actor: actor.id, action: 'person.update', subject: id, detail: { changed } })
  return { id, revision: next }
}

export async function startPeriodStatements(env: Bindings, actor: Actor, input: Input, personId: string, currency: string, { approved = false } = {}) {
  const start = requireDate(input.text('startDate', { max: 10 }), 'invalid_startDate')
  const type = input.text('employmentType', { max: 20 })
  insist((EMPLOYMENT_TYPES as readonly string[]).includes(type), 'invalid_employmentType')
  const payrollId = input.text('payrollId', { optional: true, max: 60 }) || null
  const terms = await readTerms(env, input, null, start, 'Start of employment')
  const pay = readPay(actor, input, { approved }) ?? { basis: 'unknown' as const, amountCents: null }
  const periodId = newId(), termId = newId()
  const organizationGuard = await managerChangeGuard(env, { period: { id: periodId, personId, startDate: start, endDate: null }, term: { id: termId, effectiveFrom: start, managerPersonId: terms.managerPersonId } })
  return {
    periodId, termId, start, type, terms, pay,
    statements: [
      organizationGuard,
      // Periods never overlap: a rehire starts only after the previous period has ended.
      guard(env, 'period_overlap', 'NOT EXISTS(SELECT 1 FROM wl_periods WHERE person_id = ? AND (end_date IS NULL OR end_date >= ?))', personId, start),
      stmt(env, 'INSERT INTO wl_periods (id, person_id, start_date, employment_type, payroll_id, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', periodId, personId, start, type, payrollId, newId(), now()),
      ...termsStatements(env, termId, periodId, terms, pay, currency, actor.id),
    ],
  }
}

/** Terms in force on a date for a period (null before the period's first version). */
export async function termsOn(env: Bindings, periodId: string, date: string) {
  return await one(env, "SELECT * FROM wl_terms WHERE period_id = ? AND status = 'active' AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1", periodId, date)
}

/** Prepares a new terms version effective from a date; fields not supplied carry over from the version in force then. */
export async function prepareTerms(env: Bindings, actor: Actor, input: Input, { approved = false } = {}) {
  if (!approved) requirePermission(actor, 'people.manage')
  const periodId = input.text('period', { max: 100 })
  const period = await one(env, 'SELECT * FROM wl_periods WHERE id = ?', periodId)
  insist(period, 'period_not_found', 404)
  const effective = requireDate(input.text('effectiveFrom', { max: 10 }), 'invalid_effectiveFrom')
  insist(effective > period.start_date, 'effective_before_start')
  insist(!period.end_date || effective <= period.end_date, 'effective_after_end')
  const base = (await termsOn(env, periodId, effective))!
  const terms = await readTerms(env, input, base, effective)
  const pay = readPay(actor, input, { approved })
  const previousPay = (await one<{ pay_basis: PayInput['basis']; amount_cents: number | null; currency: string }>(env, 'SELECT pay_basis, amount_cents, currency FROM wl_term_pay WHERE term_id = ?', base.id))!
  const currency = pay ? (await one<{ currency: string }>(env, 'SELECT currency FROM wl_employer'))!.currency : previousPay.currency
  const termId = newId()
  const organizationGuard = await managerChangeGuard(env, { period: { id: periodId, personId: period.person_id, startDate: period.start_date, endDate: period.end_date }, term: { id: termId, effectiveFrom: effective, managerPersonId: terms.managerPersonId } })
  // Batch publishers run every source guard before the first write.
  const guards = [
    organizationGuard,
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_periods WHERE id = ? AND revision = ?)', periodId, period.revision),
    guard(env, 'stale', "NOT EXISTS(SELECT 1 FROM wl_terms WHERE period_id = ? AND effective_from = ? AND status = 'active')", periodId, effective),
  ]
  return {
    period, base, terms, termId, effective, guards,
    statements: [
      ...guards,
      ...termsStatements(env, termId, periodId, terms, pay ?? { basis: previousPay.pay_basis, amountCents: previousPay.amount_cents }, currency, actor.id),
      stmt(env, 'UPDATE wl_periods SET revision = ? WHERE id = ?', newId(), periodId),
    ],
    audit: { actor: actor.id, action: 'terms.schedule', subject: termId, detail: { period: periodId, effectiveFrom: effective, payChanged: !!pay } },
  }
}

export async function cancelTerms(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const id = input.text('terms', { max: 100 })
  const row = await one(env, 'SELECT t.*, p.start_date, p.end_date, p.person_id FROM wl_terms t JOIN wl_periods p ON p.id = t.period_id WHERE t.id = ?', id)
  insist(row, 'terms_not_found', 404)
  insist(row.status === 'active', 'already_cancelled', 409)
  insist(row.effective_from !== row.start_date, 'initial_terms_fixed', 409)
  const organizationGuard = await managerChangeGuard(env, { period: { id: row.period_id, personId: row.person_id, startDate: row.start_date, endDate: row.end_date }, cancelTermId: id })
  await commit(env, [
    organizationGuard,
    guard(env, 'already_handed_off', "NOT EXISTS(SELECT 1 FROM wl_payroll_items WHERE source_kind = 'terms' AND source_id = ?)", id),
    stmt(env, "UPDATE wl_terms SET status = 'cancelled', cancelled_by = ?, cancelled_at = ? WHERE id = ? AND status = 'active'", actor.id, now(), id),
    stmt(env, 'UPDATE wl_periods SET revision = ? WHERE id = ?', newId(), row.period_id),
  ], { actor: actor.id, action: 'terms.cancel', subject: id, detail: { reason: input.text('reason', { optional: true, max: 300 }) } })
  return { id, status: 'cancelled' }
}

export async function setPayrollId(env: Bindings, actor: Actor, input: Input) {
  insist(can(actor, 'people.manage') || can(actor, 'payroll.handoff'), 'forbidden', 403)
  const periodId = input.text('period', { max: 100 }), payrollId = input.text('payrollId', { max: 60 })
  insist(await one(env, 'SELECT 1 FROM wl_periods WHERE id = ?', periodId), 'period_not_found', 404)
  await commit(env, [stmt(env, 'UPDATE wl_periods SET payroll_id = ?, revision = ? WHERE id = ?', payrollId, newId(), periodId)], { actor: actor.id, action: 'period.payroll', subject: periodId, detail: { payrollId } })
  return { id: periodId, payrollId }
}

export const displayName = (row: Row) => row.preferred_name || row.legal_name

export async function personNames(env: Bindings): Promise<Map<string, string>> {
  return new Map((await all<{ id: string; legal_name: string; preferred_name: string | null }>(env, 'SELECT id, legal_name, preferred_name FROM wl_people')).map(row => [row.id, displayName(row)]))
}

/** The current (or first upcoming) terms of every live period, keyed by person. */
export async function currentTerms(env: Bindings, date: string): Promise<Map<string, Row>> {
  return new Map((await all(env, CURRENT_TERMS, date)).map(row => [row.person_id, row]))
}

export function statusOf(period: Row | null | undefined, date: string): 'active' | 'upcoming' | 'former' | 'none' {
  if (!period) return 'none'
  if (period.start_date > date) return 'upcoming'
  if (period.end_date && period.end_date < date) return 'former'
  return 'active'
}
