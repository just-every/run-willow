// Pure payroll handoff calculation from one captured source state. No database
// reads may occur here: import apply/undo can restore the fence while a live
// multi-query reader has retained transient rows.
import { hours } from './dates'
import { plainMoney } from './money'
import { displayName } from './people'
import type { PayrollSourceRows } from './payroll-sources'

export interface Line { key: string; kind: 'bonus' | 'start' | 'end' | 'change' | 'leave' | 'leave_reversal'; person: string; name: string; employeeNumber: string | null; payrollId: string | null; effectiveDate: string; endDate?: string; policyId?: string; periodId?: string; units?: string; unit?: string; changes?: { field: string; from: string | null; to: string | null }[]; note: string }

type Terms = PayrollSourceRows['wl_terms'][number] & PayrollSourceRows['wl_term_pay'][number]
const money = (cents: number | null, currency: string) => cents === null ? null : plainMoney(cents, currency)
const order = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

export function calculatePayroll(sources: PayrollSourceRows, end: string) {
  const claimed = new Set(sources.wl_payroll_items.map(row => `${row.source_kind}:${row.source_id}`))
  const people = new Map(sources.wl_people.map(row => [row.id, row]))
  const periods = new Map(sources.wl_periods.map(row => [row.id, row]))
  const departments = new Map(sources.wl_departments.map(row => [row.id, row.name as string]))
  const locations = new Map(sources.wl_locations.map(row => [row.id, row.name as string]))
  const schedules = new Map(sources.wl_schedules.map(row => [row.id, `${row.name} (${hours(row.mon + row.tue + row.wed + row.thu + row.fri + row.sat + row.sun)} h/week)`]))
  const pay = new Map(sources.wl_term_pay.map(row => [row.term_id, row]))
  const activeTerms = sources.wl_terms.flatMap(row => {
    const compensation = pay.get(row.id)
    return row.status === 'active' && compensation ? [{ ...row, ...compensation }] : []
  }).sort((left, right) => order(left.effective_from, right.effective_from) || order(left.id, right.id))
  const base = (period: PayrollSourceRows['wl_periods'][number]) => { const person = people.get(period.person_id)!; return { periodId: period.id, person: person.id, name: displayName(person), employeeNumber: person.employee_number, payrollId: period.payroll_id } }
  const lines: Line[] = [], silent: string[] = []

  // Snapshot rows are ordered by their columns (id first). Date-ordered joins
  // below use id as a stable tie-breaker, including ledger uses and reversals.
  for (const period of periods.values()) {
    if (period.start_date <= end && !claimed.has(`start:${period.id}`)) {
      const first = activeTerms.find(row => row.period_id === period.id && row.effective_from === period.start_date)
      lines.push({ key: `start:${period.id}`, kind: 'start', ...base(period), effectiveDate: period.start_date, note: `Starts as ${first?.job_title ?? 'unknown'} (${period.employment_type.replace('_', ' ')}); pay ${first?.pay_basis ?? 'unknown'} ${money(first?.amount_cents ?? null, first?.currency ?? '') ?? 'unknown'}; schedule ${first?.schedule_id ? schedules.get(first.schedule_id) : 'none'}` })
    }
    if (period.end_date && period.end_date <= end && !claimed.has(`end:${period.id}`)) lines.push({ key: `end:${period.id}`, kind: 'end', ...base(period), effectiveDate: period.end_date, note: 'Employment ends; final pay is calculated by the payroll provider' })
  }

  for (const row of activeTerms) {
    const period = periods.get(row.period_id)
    if (!period || row.effective_from > end || row.effective_from <= period.start_date || claimed.has(`terms:${row.id}`)) continue
    const previous = activeTerms.filter(terms => terms.period_id === row.period_id && terms.effective_from < row.effective_from).at(-1)
    const describe: [string, (terms: Terms) => string | null][] = [
      ['Job title', terms => terms.job_title], ['Department', terms => departments.get(terms.department_id) ?? null], ['Location', terms => locations.get(terms.location_id) ?? null],
      ['Schedule', terms => schedules.get(terms.schedule_id) ?? null], ['Pay', terms => `${terms.pay_basis} ${money(terms.amount_cents, terms.currency) ?? 'unknown'}`],
    ]
    const changes = describe.map(([field, read]) => ({ field, from: previous ? read(previous) : null, to: read(row) })).filter(change => change.from !== change.to)
    lines.push({ key: `terms:${row.id}`, kind: 'change', ...base(period), effectiveDate: row.effective_from, changes, note: row.reason })
  }

  const requests = new Map(sources.wl_leave_requests.map(row => [row.id, row]))
  const accounts = new Map(sources.wl_leave_accounts.map(row => [row.id, row]))
  const policies = new Map(sources.wl_leave_policies.map(row => [row.id, row]))
  const ledger = sources.wl_ledger.flatMap(row => {
    const request = requests.get(row.request_id), account = accounts.get(row.account_id)
    const policy = account && policies.get(account.policy_id)
    return (row.kind === 'use' || row.kind === 'reversal') && request && request.start_date <= end && account && policy
      ? [{ ...row, start_date: request.start_date, end_date: request.end_date, period_id: account.period_id, policy: policy.name, policyId: policy.id }] : []
  }).sort((left, right) => order(left.start_date, right.start_date) || left.recorded_at - right.recorded_at || order(left.id, right.id))
  const reversalOf = new Map(ledger.filter(row => row.kind === 'reversal').map(row => [row.reverses, row]))
  for (const row of ledger) {
    if (claimed.has(`ledger:${row.id}`)) continue
    if (row.kind === 'use') {
      const reversal = reversalOf.get(row.id)
      // Leave cancelled before any handoff nets to nothing: both entries are claimed without a line.
      if (reversal && !claimed.has(`ledger:${reversal.id}`)) { silent.push(`ledger:${row.id}`, `ledger:${reversal.id}`); continue }
      lines.push({ key: `ledger:${row.id}`, kind: 'leave', policyId: row.policyId, ...base(periods.get(row.period_id)!), effectiveDate: row.start_date, endDate: row.end_date, units: hours(-row.minutes), unit: 'hours', note: `${row.policy} taken` })
    } else if (claimed.has(`ledger:${row.reverses}`)) {
      lines.push({ key: `ledger:${row.id}`, kind: 'leave_reversal', policyId: row.policyId, ...base(periods.get(row.period_id)!), effectiveDate: row.start_date, endDate: row.end_date, units: hours(-row.minutes), unit: 'hours', note: `${row.policy} cancelled after handoff: reverse ${hours(row.minutes)} hours` })
    }
  }
  for (const bonus of sources.wl_comp_bonuses) {
    const period = periods.get(bonus.period_id)
    if (period && bonus.effective_from <= end && !claimed.has(`bonus:${bonus.id}`)) lines.push({ key: `bonus:${bonus.id}`, kind: 'bonus', ...base(period), effectiveDate: bonus.effective_from, units: (bonus.amount_cents / 100).toFixed(2), unit: 'USD', note: 'Owner-approved one-time bonus; payroll provider calculates tax and payment' })
  }
  const exceptions = lines.filter(line => !line.payrollId).map(line => ({ key: line.key, person: line.person, name: line.name, reason: 'No payroll identifier on the employment period' }))
  const resolvedSelf = new Set(sources.wl_self_reconciliation.map(r => r.change_id))
  const approvedSelf = new Set(sources.wl_self_decisions.filter(r => r.outcome === 'approved').map(r => r.change_id))
  for (const revision of sources.wl_self_changes) if (!['goal','training','performanceEntry'].includes(revision.kind) && approvedSelf.has(revision.id) && !resolvedSelf.has(revision.id)) {
    const person = people.get(revision.person_id)!
    exceptions.push({ key: `self-change:${revision.id}`, person: revision.person_id, name: displayName(person), reason: `Approved ${revision.kind === 'legalName' ? 'legal name' : 'dependent'} revision: HR/downstream handoff required; private values remain with HR` })
  }
  return { lines: lines.filter(line => line.payrollId), exceptions, silent: [...new Set(silent)] }
}
