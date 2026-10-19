// All anniversaries and earned amounts follow employment calendar dates, not milliseconds.
import type { Bindings } from '../../auth.server'
import { all, insist, one, type Row } from '../core'
import { daysBetween } from '../dates'
import { WEEKDAYS } from '../employer'
import { readRules, type LeaveRules, type Tier, type Variant } from './rules'

/** Month anniversaries clamp to the last day when the hire day does not exist. */
export function monthAnniversary(start: string, months: number): string {
  const [year, month, day] = start.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 + months, 1))
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, end)).padStart(2, '0')}`
}

export function serviceMonths(start: string, date: string): number {
  const [sy, sm] = start.split('-').map(Number), [y, m] = date.split('-').map(Number)
  const nominal = (y - sy) * 12 + m - sm
  return Math.max(0, nominal - (monthAnniversary(start, nominal) > date ? 1 : 0))
}

export interface PolicyContext { period: Row; terms: Row[]; schedules: Map<string, Row>; termsSignature: string }

export async function policyContext(env: Bindings, account: Row): Promise<PolicyContext> {
  const [period, terms, schedules] = await Promise.all([
    one(env, 'SELECT id, start_date, end_date, employment_type, revision FROM wl_periods WHERE id = ?', account.period_id),
    all(env, "SELECT id, effective_from, location_id, schedule_id FROM wl_terms WHERE period_id = ? AND status = 'active' ORDER BY effective_from, id", account.period_id),
    all(env, "SELECT s.* FROM wl_schedules s WHERE EXISTS (SELECT 1 FROM wl_terms t WHERE t.schedule_id = s.id AND t.period_id = ? AND t.status = 'active')", account.period_id),
  ])
  insist(period, 'period_not_found', 404)
  return { period, terms, schedules: new Map(schedules.map(s => [s.id, s])), termsSignature: terms.map(t => t.id).sort().join('|') }
}

export function datedRule(rules: LeaveRules, context: PolicyContext, date: string) {
  const { period } = context
  const terms = context.terms.findLast(t => t.effective_from <= date) ?? null
  const location = rules.locations.find(l => l.locationId === terms?.location_id)
  const variant: Variant = location ?? rules
  const months = serviceMonths(period.start_date, date)
  const tier = variant.tiers.findLast(t => t.afterMonths <= months) as Tier
  const schedule = terms?.schedule_id ? context.schedules.get(terms.schedule_id) : null
  const weeklyMinutes = schedule ? WEEKDAYS.reduce((n, d) => n + Number(schedule[d]), 0) : 0
  const reason = date < period.start_date ? 'before_employment'
    : period.end_date && date > period.end_date ? 'employment_ended'
    : !rules.eligibility.employmentTypes.includes(period.employment_type) ? 'employment_type'
    : daysBetween(period.start_date, date) < rules.eligibility.waitingDays ? 'waiting_period'
    : !terms ? 'missing_terms'
    : tier.allowance.unit === 'weeks' && !schedule ? 'missing_schedule'
    : null
  const allowance = tier.allowance
  const annualMinutes = allowance.unit === 'hours' ? allowance.amount * 60
    : allowance.unit === 'days' ? allowance.amount * allowance.dayMinutes!
    : allowance.amount * weeklyMinutes
  const year = Number(date.slice(0, 4))
  const yearDays = daysBetween(`${year}-01-01`, `${year + 1}-01-01`)
  return { eligible: !reason, reason, terms, location, variant, tier, serviceMonths: months, weeklyMinutes, annualMinutes, yearDays }
}

/** Reused by account opening and request calculations; absence means the original policy model. */
export async function policyEligibility(env: Bindings, account: Row, date: string) {
  const rules = await readRules(env, account.policy_version_id)
  if (!rules) return null
  const context = await policyContext(env, account), selected = datedRule(rules, context, date)
  return { eligible: selected.eligible, reason: selected.reason, termsId: selected.terms?.id ?? null,
    locationId: selected.terms?.location_id ?? null, tierMonths: selected.tier.afterMonths }
}
