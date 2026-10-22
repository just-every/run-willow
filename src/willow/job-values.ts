// Native job changes share immutable terms, mover workflows and period-date guards.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { guard, insist, newId, one, stmt, type Row } from './core'
import { requireDate } from './dates'
import { Input } from './input'
import { activeTemplate, caseStatements, prepareMover } from './lifecycle'
import { managerChangeGuard, type OrganizationTerm } from './organization'
import { readTerms, statusOf, termsOn, termsStatements } from './people'
import { prepareTypeChange } from './change-requests/employment-type'

export const JOB_STATUSES = ['active', 'upcoming', 'former'] as const
export type JobStatus = typeof JOB_STATUSES[number]

export interface JobDates { startDate?: string; endDate?: string | null }

/** Correct period boundaries, retaining every immutable terms version and its pay. */
export async function prepareJobDates(env: Bindings, actor: Actor, period: Row, dates: JobDates, term?: Omit<OrganizationTerm, 'periodId'>) {
 const start = dates.startDate === undefined ? period.start_date : requireDate(dates.startDate, 'invalid_startDate')
 const end = dates.endDate === undefined ? period.end_date : dates.endDate === null ? null : requireDate(dates.endDate, 'invalid_endDate')
 insist(!end || end >= start, 'end_before_start')
 const changed = start !== period.start_date || end !== period.end_date
 const statements: D1PreparedStatement[] = []
 const guards: D1PreparedStatement[] = []
 if (!changed) return { guards, statements, changed, start, end }
 const first = await one(env, "SELECT * FROM wl_terms WHERE period_id=? AND status='active' ORDER BY effective_from LIMIT 1", period.id)
 insist(first, 'terms_not_found', 404)
 // An earlier start needs a complete initial version, rather than a date with no job in force.
 let initial: Omit<OrganizationTerm, 'periodId'> | undefined
 if (start < first.effective_from) {
  const id = newId(), pay = (await one(env, 'SELECT * FROM wl_term_pay WHERE term_id=?', first.id))!
  const carried = await readTerms(env, Input.of({ reason: 'Employment start date correction' }), first, start)
  initial = { id, effectiveFrom: start, managerPersonId: carried.managerPersonId }
  statements.push(...termsStatements(env, id, period.id, carried, { basis: pay.pay_basis, amountCents: pay.amount_cents }, pay.currency, actor.id))
 }
 const change = { period: { id: period.id, personId: period.person_id, startDate: start, endDate: end }, expectedStartDate: period.start_date }
 guards.push(await managerChangeGuard(env, { ...change, ...(initial ? { term: initial } : term ? { term } : {}) }),
  guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_periods WHERE id=? AND revision=?)', period.id, period.revision),
  guard(env, 'period_overlap', 'NOT EXISTS(SELECT 1 FROM wl_periods WHERE person_id=? AND id<>? AND (end_date IS NULL OR end_date>=?) AND (? IS NULL OR start_date<=?))', period.person_id, period.id, start, end, end),
  guard(env, 'future_terms_exist', "NOT EXISTS(SELECT 1 FROM wl_terms WHERE period_id=? AND status='active' AND ? IS NOT NULL AND effective_from>?)", period.id, end, end))
 // A changed manager and an extended boundary must also be checked together.
 if (initial && term) guards.push(await managerChangeGuard(env, { ...change, term }))
 statements.push(stmt(env, 'UPDATE wl_periods SET start_date=?,end_date=?,revision=? WHERE id=?', start, end, newId(), period.id))
 return { guards, statements, changed, start, end }
}

/** Values are already bounded to the requested job fields by the caller. */
export async function prepareJobChange(env: Bindings, actor: Actor, periodId: string, execution: Record<string, string>, employmentType?: string | null) {
 requireDate(execution.effectiveFrom, 'invalid_effectiveFrom')
 const period = await one(env, 'SELECT * FROM wl_periods WHERE id=?', periodId)
 insist(period, 'period_not_found', 404)
 if ('employmentStatus' in execution) {
  const status = execution.employmentStatus
  insist((JOB_STATUSES as readonly string[]).includes(status), 'invalid_employmentStatus')
  const current = statusOf(period, actor.today)
  const derived: Record<string, string> = {}
  if (status === 'former') derived.endDate = execution.effectiveFrom
  if (status === 'upcoming') {
   insist(execution.effectiveFrom > actor.today, 'start_not_future')
   derived.startDate = execution.effectiveFrom
  }
  if (status === 'active') {
   insist(current !== 'former', 'rehire_required', 409)
   if (current === 'upcoming') derived.startDate = execution.effectiveFrom
   else derived.endDate = ''
  }
  for (const [field, value] of Object.entries(derived)) insist(!(field in execution) || execution[field] === value, 'conflicting_job_dates')
  execution = { ...execution, ...derived }
 }
 if (employmentType) return prepareTypeChange(env, actor, periodId, execution, employmentType, execution.template)
 const dates: JobDates = {
  ...('startDate' in execution ? { startDate: execution.startDate } : {}),
  ...('endDate' in execution ? { endDate: execution.endDate || null } : {}),
 }
 const hasTerms = ['jobTitle', 'departmentId', 'locationId', 'managerPersonId', 'scheduleId', 'fte', 'payBasis'].some(key => key in execution)
 const prepared = hasTerms ? await prepareMover(env, actor, Input.of(execution), { approved: true, exactFields: true }) : null
 const base = await termsOn(env, periodId, execution.effectiveFrom < period.start_date ? period.start_date : execution.effectiveFrom)
 insist(base, 'effective_before_start')
 const terms = prepared ? await readTerms(env, Input.of(execution), base, execution.effectiveFrom, '', { exactFields: true }) : null
 const corrected = await prepareJobDates(env, actor, period, dates, prepared ? { id: prepared.result.terms, effectiveFrom: execution.effectiveFrom, managerPersonId: terms!.managerPersonId } : undefined)
 if (prepared && corrected.changed) {
  insist(execution.effectiveFrom >= corrected.start, 'effective_before_start')
  insist(!corrected.end || execution.effectiveFrom <= corrected.end, 'effective_after_end')
 }
 const opened = !prepared && execution.template ? await caseStatements(env, actor, await activeTemplate(env, execution.template, 'mover'), period.person_id, period.id, execution.effectiveFrom, base.manager_person_id) : null
 insist(prepared || corrected.changed, 'nothing_to_change')
 return {
  statements: [...corrected.guards, ...(prepared?.statements ?? []), ...corrected.statements, ...(opened?.statements ?? [])],
  audit: [...(prepared?.audit ?? []), ...(corrected.changed ? [{ actor: actor.id, action: 'employment.dates', subject: period.person_id, detail: { period: periodId, startDate: corrected.start, endDate: corrected.end } }] : [])],
  result: prepared?.result ?? { id: opened?.caseId ?? periodId, terms: base.id as string, case: opened?.caseId ?? null, period: periodId, effectiveFrom: execution.effectiveFrom },
 }
}
