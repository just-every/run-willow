import { settleExpiredCarryover } from './settlement'
// A chunk claims its account cursor and source snapshot inside the same D1 batch
// as its ledger entries and explanations. Restarts cannot duplicate earned days.
import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { addDays, daysBetween, requireDate } from '../dates'
import { datedRule, policyContext } from './calendar'
import { readRules, type LeaveRules } from './rules'
import { spentFromCarryover, vested, type LedgerRow } from './balances'
import { applyCarryover, type CarryoverPool } from './carryover'

interface AccrualState {
  pending_minutes: number
}
export interface AccrualResult { id: string; from: string; through: string; minutes: number; days: number }

async function accrueChunk(env: Bindings, actor: Actor, account: Row, rules: LeaveRules, last: string) {
  const context = await policyContext(env, account)
  const [persisted, ledger, pools] = await Promise.all([
    one<AccrualState>(env, 'SELECT pending_minutes FROM wl_leave_accrual_state WHERE account_id = ?', account.id),
    all<LedgerRow>(env, 'SELECT l.id, l.kind, l.minutes, l.effective_date, e.event FROM wl_ledger l LEFT JOIN wl_leave_policy_events e ON e.ledger_id = l.id WHERE l.account_id = ?', account.id),
    all<CarryoverPool>(env, 'SELECT year, initial_minutes, expires_on, expired_minutes, settled FROM wl_leave_carryover_pools WHERE account_id = ? ORDER BY year', account.id),
  ])
  const state: AccrualState = persisted ? { ...persisted } : { pending_minutes: 0 }
  const statements: D1PreparedStatement[] = [
    guard(env, 'stale', "EXISTS (SELECT 1 FROM wl_leave_accounts WHERE id = ? AND revision = ? AND accrued_through = ? AND policy_version_id = ? AND opening_status = 'approved')", account.id, account.revision, account.accrued_through, account.policy_version_id),
    guard(env, 'stale', 'EXISTS (SELECT 1 FROM wl_periods WHERE id = ? AND revision = ?)', context.period.id, context.period.revision),
    guard(env, 'stale', "COALESCE((SELECT group_concat(id, '|') FROM (SELECT id FROM wl_terms WHERE period_id = ? AND status = 'active' ORDER BY id)), '') = ?", account.period_id, context.termsSignature),
    guard(env, 'stale', '(SELECT COUNT(*) FROM wl_ledger WHERE account_id = ?) = ?', account.id, ledger.length),
  ]
  const at = now(), from = addDays(account.accrued_through, 1)
  let total = 0, days = 0
  const post = (date: string, event: string, minutes: number, note: string): string | null => {
    if (!minutes) return null
    const id = newId(), kind = event === 'accrual' ? 'accrual' : 'adjustment'
    statements.push(stmt(env, 'INSERT INTO wl_ledger (id, account_id, kind, minutes, effective_date, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, account.id, kind, minutes, date, note, actor.id, at))
    statements.push(stmt(env, 'INSERT INTO wl_leave_policy_events (ledger_id, event) VALUES (?, ?)', id, event))
    ledger.push({ id, kind, minutes, effective_date: date, event })
    total += minutes
    return id
  }

  for (let date = from; date <= last; date = addDays(date, 1)) {
    const selected = datedRule(rules, context, date), variant = selected.variant
    const carryover = applyCarryover(date, account.policy_version_id, variant, selected.terms?.location_id ?? null, ledger, pools, post)
    const ledgerIds = carryover.ledgerIds

    const pendingBefore = state.pending_minutes
    const earned = selected.eligible && rules.kind !== 'unpaid' ? selected.annualMinutes / selected.yearDays : 0
    state.pending_minutes += earned
    const monthEnd = addDays(date, 1).slice(0, 7) !== date.slice(0, 7)
    const due = rules.cadence === 'daily' || rules.cadence === 'monthly' && monthEnd || rules.cadence === 'annual' && date.endsWith('-12-31') || date === context.period.end_date
    const before = vested(ledger, date)
    const requested = due ? Math.max(0, Math.round(state.pending_minutes + 1e-9)) : 0
    const credit = variant.capMinutes === null ? requested : Math.min(requested, Math.max(0, variant.capMinutes - before))
    if (due) state.pending_minutes -= requested
    const id = post(date, 'accrual', credit, `${rules.cadence} earned credit ${credit} minutes (${requested} before cap); terms ${selected.terms?.id ?? 'none'}; tier ${selected.tier.afterMonths} months; location ${selected.terms?.location_id ?? 'none'}; cap ${variant.capMinutes ?? 'none'}; policy version ${account.policy_version_id}. Daily calculation ${date}.`)
    if (id) ledgerIds.push(id)
    const pool = carryover.pool
    const poolThrough = pool?.expires_on && pool.expires_on < date ? pool.expires_on : date
    const poolUsed = pool ? Math.min(pool.initial_minutes, spentFromCarryover(ledger, pool.year, poolThrough)) : 0
    const calculation = {
      employmentPeriod: context.period.id, employmentStart: context.period.start_date, employmentEnd: context.period.end_date,
      employmentType: context.period.employment_type, termsId: selected.terms?.id ?? null, scheduleId: selected.terms?.schedule_id ?? null,
      locationId: selected.terms?.location_id ?? null, locationReview: selected.location?.reviewNote ?? null,
      serviceMonths: selected.serviceMonths, tierMonths: selected.tier.afterMonths, allowance: selected.tier.allowance,
      kind: rules.kind, eligible: selected.eligible, reason: selected.reason, yearDays: selected.yearDays,
      weeklyMinutes: selected.weeklyMinutes, annualMinutes: selected.annualMinutes, earnedMinutes: earned,
      proration: rules.proration, cadence: rules.cadence, pendingBeforeMinutes: pendingBefore, pendingAfterMinutes: state.pending_minutes,
      creditBeforeCapMinutes: requested, creditMinutes: credit, capMinutes: variant.capMinutes, vestedBalanceBeforeMinutes: before,
      carryoverEvents: carryover.events, carryoverPoolMinutes: pool?.initial_minutes ?? 0,
      carryoverUsedMinutes: poolUsed, carryoverRemainingMinutes: pool ? Math.max(0, pool.initial_minutes - poolUsed - pool.expired_minutes) : 0,
      ledgerIds,
    }
    statements.push(stmt(env, 'INSERT INTO wl_leave_calculations (account_id, date, policy_version_id, calculation, recorded_at) VALUES (?, ?, ?, ?, ?)', account.id, date, account.policy_version_id, JSON.stringify(calculation), at))
    days++
  }
  for (const pool of pools.filter(p => p.dirty)) statements.push(stmt(env,
    'INSERT INTO wl_leave_carryover_pools (account_id, year, initial_minutes, expires_on, expired_minutes, settled) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(account_id, year) DO UPDATE SET expired_minutes = excluded.expired_minutes, settled = excluded.settled',
    account.id, pool.year, pool.initial_minutes, pool.expires_on, pool.expired_minutes, pool.settled))
  statements.push(
    stmt(env, 'INSERT INTO wl_leave_accrual_state (account_id, pending_minutes) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET pending_minutes = excluded.pending_minutes', account.id, state.pending_minutes),
    stmt(env, 'UPDATE wl_leave_accounts SET accrued_through = ?, revision = ? WHERE id = ?', last, newId(), account.id),
  )
  await commit(env, statements, { actor: actor.id, action: 'leave.accrue', subject: account.id, detail: { from, through: last, minutes: total, days, policyVersion: account.policy_version_id, structured: true } })
  return { minutes: total, days }
}

/** Null dispatches to the original weeks-only policy; an existing structured account never switches versions. */
export async function accruePolicy(env: Bindings, actor: Actor, account: Row, through: string): Promise<AccrualResult | null> {
  requirePermission(actor, 'leave.manage')
  requireDate(through, 'invalid_through')
  const rules = await readRules(env, account.policy_version_id)
  if (!rules) return null
  insist(account.opening_status === 'approved', 'opening_not_signed_off', 409)
  const period = await one(env, 'SELECT end_date FROM wl_periods WHERE id = ?', account.period_id)
  insist(period, 'period_not_found', 404)
  const last = period.end_date && period.end_date < through ? period.end_date : through
  insist(daysBetween(account.accrued_through, last) <= 366, 'accrual_range_too_large', 400, { maximumDays: 366 })
  const result: AccrualResult = { id: account.id, from: addDays(account.accrued_through, 1), through: account.accrued_through, minutes: 0, days: 0 }
  let current = account
  while (current.accrued_through < last) {
    const chunkEnd = addDays(current.accrued_through, 21) < last ? addDays(current.accrued_through, 21) : last
    const chunk = await accrueChunk(env, actor, current, rules, chunkEnd)
    result.minutes += chunk.minutes
    result.days += chunk.days
    result.through = chunkEnd
    current = (await one(env, 'SELECT * FROM wl_leave_accounts WHERE id = ?', account.id))!
  }
  result.minutes += await settleExpiredCarryover(env,actor,account.id,through)
  return result
}
