// Flow 13 (summaries): headcount, starters and leavers, leave taken and open
// lifecycle work, scoped to what the member may see. reports.read covers the
// whole organisation; a manager without it sees their own team. Compensation
// totals appear only for members holding pay.read as well. Filters and
// calculations are returned with the figures.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { all, auditRead, insist } from './core'
import { hours, isDate } from './dates'
import { currentTerms } from './people'

export async function summary(env: Bindings, actor: Actor, url: URL) {
  const organisation = can(actor, 'reports.read')
  insist(organisation || actor.reports.size > 0, 'forbidden', 403)
  const asOf = url.searchParams.get('asOf') || actor.today
  const from = url.searchParams.get('from') || `${asOf.slice(0, 8)}01`, to = url.searchParams.get('to') || asOf
  insist(isDate(asOf) && isDate(from) && isDate(to) && from <= to, 'invalid_dates')
  const inScope = (personId: string) => organisation || actor.reports.has(personId)
  const terms = [...(await currentTerms(env, asOf)).values()].filter(row => inScope(row.person_id))
  const periods = (await all(env, 'SELECT * FROM wl_periods')).filter(row => inScope(row.person_id))
  const active = new Set(periods.filter(row => row.start_date <= asOf && (!row.end_date || row.end_date >= asOf)).map(row => row.id))
  const names = async (table: string) => new Map((await all(env, `SELECT id, name FROM ${table}`)).map(row => [row.id, row.name as string]))
  const [departments, locations] = await Promise.all([names('wl_departments'), names('wl_locations')])
  const count = (key: (row: Record<string, any>) => string) => {
    const counts = new Map<string, number>()
    for (const row of terms.filter(row => active.has(row.period_id))) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1)
    return [...counts].sort().map(([group, people]) => ({ group, people }))
  }
  const leave = (await all(env, `SELECT p.name AS policy, r.person_id, l.minutes FROM wl_ledger l JOIN wl_leave_requests r ON r.id = l.request_id JOIN wl_leave_accounts a ON a.id = l.account_id JOIN wl_leave_policies p ON p.id = a.policy_id
    WHERE l.kind IN ('use', 'reversal') AND r.start_date >= ? AND r.start_date <= ?`, from, to)).filter(row => inScope(row.person_id))
  const byPolicy = new Map<string, number>()
  for (const row of leave) byPolicy.set(row.policy, (byPolicy.get(row.policy) ?? 0) - row.minutes)
  const tasks = (await all(env, "SELECT t.due_date, c.person_id FROM wl_case_tasks t JOIN wl_cases c ON c.id = t.case_id WHERE t.status = 'open'")).filter(row => inScope(row.person_id))
  const result: Record<string, unknown> = {
    scope: organisation ? 'organisation' : 'your team', filters: { asOf, from, to },
    calculation: 'Headcount counts employment periods in force on the as-of date by the terms in force that day. Leave taken is approved use minus reversals for requests starting in the range, in hours.',
    headcount: { total: active.size, byDepartment: count(row => departments.get(row.department_id) ?? 'No department'), byLocation: count(row => locations.get(row.location_id) ?? 'No location'), byType: periods.filter(row => active.has(row.id)).reduce((acc: Record<string, number>, row) => ({ ...acc, [row.employment_type]: (acc[row.employment_type] ?? 0) + 1 }), {}) },
    movements: { starters: periods.filter(row => row.start_date >= from && row.start_date <= to).length, leavers: periods.filter(row => row.end_date && row.end_date >= from && row.end_date <= to).length },
    leaveTaken: [...byPolicy].sort().map(([policy, minutes]) => ({ policy, hours: hours(minutes) })),
    lifecycleWork: { openTasks: tasks.length, overdue: tasks.filter(row => row.due_date < actor.today).length },
  }
  if (organisation && can(actor, 'pay.read')) {
    const pay = await all(env, `SELECT t.department_id, p.pay_basis, p.amount_cents, p.currency, (s.mon + s.tue + s.wed + s.thu + s.fri + s.sat + s.sun) AS weekly FROM wl_term_pay p JOIN wl_terms t ON t.id = p.term_id LEFT JOIN wl_schedules s ON s.id = t.schedule_id WHERE t.id IN (${terms.filter(row => active.has(row.period_id)).map(() => '?').join(', ') || "''"})`, ...terms.filter(row => active.has(row.period_id)).map(row => row.id))
    const totals = new Map<string, { people: number; annualCents: number; unknown: number; currency: string }>()
    for (const row of pay) {
      const key = `${departments.get(row.department_id) ?? 'No department'} (${row.currency})`
      const entry = totals.get(key) ?? { people: 0, annualCents: 0, unknown: 0, currency: row.currency }
      entry.people++
      if (row.pay_basis === 'salary' && row.amount_cents !== null) entry.annualCents += row.amount_cents
      else if (row.pay_basis === 'hourly' && row.amount_cents !== null && row.weekly) entry.annualCents += Math.round(row.amount_cents * row.weekly / 60 * 52)
      else entry.unknown++
      totals.set(key, entry)
    }
    result.compensation = { note: 'Annualised: salary as recorded; hourly rate x scheduled weekly hours x 52. People with unknown pay are counted separately.', byDepartment: [...totals].sort().map(([group, value]) => ({ group, people: value.people, annual: (value.annualCents / 100).toFixed(2), unknownPay: value.unknown, currency: value.currency })) }
    await auditRead(env, actor.id, 'report.compensation.read', 'organisation', { asOf })
  }
  return result
}

export function summaryCsv(report: Record<string, any>) {
  const rows: (string | number)[][] = [['section', 'group', 'value']]
  rows.push(['scope', '', report.scope], ['as_of', '', report.filters.asOf], ['range', '', `${report.filters.from} to ${report.filters.to}`], ['headcount', 'total', report.headcount.total])
  for (const row of report.headcount.byDepartment) rows.push(['headcount by department', row.group, row.people])
  for (const row of report.headcount.byLocation) rows.push(['headcount by location', row.group, row.people])
  rows.push(['starters', '', report.movements.starters], ['leavers', '', report.movements.leavers])
  for (const row of report.leaveTaken) rows.push(['leave taken (hours)', row.policy, row.hours])
  rows.push(['open lifecycle tasks', '', report.lifecycleWork.openTasks], ['overdue lifecycle tasks', '', report.lifecycleWork.overdue])
  for (const row of report.compensation?.byDepartment ?? []) rows.push(['annualised compensation', row.group, row.annual])
  return rows.map(row => row.map(value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value)).join(',')).join('\r\n') + '\r\n'
}
