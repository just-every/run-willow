// FLOW-004 employment-type changes use WIL-04's mechanics (ct, 19 October):
// in one commit the current period ends the day before the effective date and
// a new period with the new type starts on it, carrying the approved terms and
// the payroll identifier; the chain's mover case opens on the new period.
// Leave accounts stay with the ended period, as for any WIL-04 period.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { guard, insist, newId, one, stmt } from '../core'
import { addDays } from '../dates'
import { Input } from '../input'
import { activeTemplate, caseStatements } from '../lifecycle'
import { managerChangeGuard } from '../organization'
import { startPeriodStatements, termsOn } from '../people'
import { workflowContext } from '../workflow-plan'

export async function prepareTypeChange(env: Bindings, actor: Actor, periodId: string, execution: Record<string, string>, employmentType: string, templateId: string) {
  const period = await one(env, 'SELECT * FROM wl_periods WHERE id = ?', periodId)
  insist(period, 'period_not_found', 404)
  insist(!period.end_date, 'period_already_ended', 409)
  const effective = execution.effectiveFrom
  insist(effective > period.start_date, 'effective_before_start')
  const end = addDays(effective, -1)
  const base = (await termsOn(env, period.id, effective))!
  const basePay = (await one(env, 'SELECT pay_basis, amount_cents, currency FROM wl_term_pay WHERE term_id = ?', base.id))!
  const carried = (key: string, column: string) => key in execution ? execution[key] : base[column] ?? ''
  const input = Input.of({
    startDate: effective, employmentType, payrollId: period.payroll_id ?? '', reason: execution.reason,
    jobTitle: carried('jobTitle', 'job_title'), departmentId: carried('departmentId', 'department_id'), locationId: carried('locationId', 'location_id'),
    managerPersonId: carried('managerPersonId', 'manager_person_id'), scheduleId: carried('scheduleId', 'schedule_id'),
    payBasis: execution.payBasis ?? basePay.pay_basis, payAmount: execution.payAmount ?? (basePay.amount_cents === null ? '' : (basePay.amount_cents / 100).toFixed(2)),
  })
  const started = await startPeriodStatements(env, actor, input, period.person_id, basePay.currency, { approved: true })
  const opened = templateId ? await caseStatements(env, actor, await activeTemplate(env, templateId, 'mover'), period.person_id, started.periodId, effective, started.terms.managerPersonId, await workflowContext(env, started.terms, employmentType)) : null
  // Both organization snapshot guards must precede every write; startPeriodStatements returns its guard first.
  const [startGuard, ...startWrites] = started.statements
  return {
    statements: [
      await managerChangeGuard(env, { period: { id: period.id, personId: period.person_id, startDate: period.start_date, endDate: end } }),
      startGuard,
      guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_periods WHERE id = ? AND revision = ? AND end_date IS NULL)', period.id, period.revision),
      guard(env, 'future_terms_exist', "NOT EXISTS(SELECT 1 FROM wl_terms WHERE period_id = ? AND status = 'active' AND effective_from > ?)", period.id, end),
      stmt(env, 'UPDATE wl_periods SET end_date = ?, end_reason = ?, revision = ? WHERE id = ?', end, 'Employment type change', newId(), period.id),
      ...startWrites,
      ...(opened?.statements ?? []),
    ],
    audit: { actor: actor.id, action: 'employment.type.change', subject: period.person_id, detail: { ended: period.id, started: started.periodId, from: period.employment_type, to: employmentType, case: opened?.caseId ?? null } },
    result: { terms: started.termId, case: opened?.caseId ?? null, period: started.periodId, previousPeriod: period.id, effectiveFrom: effective },
  }
}
