import type { Bindings } from '../../auth.server'
import { actorFor, employerZone } from '../actor'
import { all, now, one, WillowError } from '../core'
import { addDays, today } from '../dates'
import { accruePolicy } from './engine'

/** Only completed employer-local days accrue; missed days catch up from each fixed-version account cursor. */
export async function runLeaveScheduler(env: Bindings, instant = now()) {
  const through = addDays(today(await employerZone(env), instant), -1)
  const owner = await one(env, `SELECT m.id, m.email, m.name, m.person_id FROM wl_members m JOIN oa_operators o ON lower(o.email) = m.email WHERE m.status = 'active' AND o.status = 'active' AND o.role = 'owner' ORDER BY m.id LIMIT 1`)
  if (!owner) return { accounts: 0, minutes: 0, days: 0, through, reason: 'owner_unavailable' }
  const actor = await actorFor(env, { id: owner.id, email: owner.email, name: owner.name, personId: owner.person_id, owner: true, sessionId: '' })
  const accounts = await all(env, `SELECT a.* FROM wl_leave_accounts a JOIN wl_leave_policy_rules r ON r.version_id = a.policy_version_id JOIN wl_policy_versions v ON v.id = a.policy_version_id JOIN wl_periods p ON p.id = a.period_id WHERE a.opening_status = 'approved' AND v.status = 'approved' AND a.accrued_through < ? AND (p.end_date IS NULL OR a.accrued_through < p.end_date) ORDER BY a.accrued_through, a.id LIMIT 5`, through)
  let count = 0, minutes = 0, days = 0, contended = 0
  for (const account of accounts) {
    try {
      const windowEnd = addDays(account.accrued_through, 30)
      const result = await accruePolicy(env, actor, account, windowEnd < through ? windowEnd : through)
      if (result?.days) { count++; minutes += result.minutes; days += result.days }
    } catch (error) {
      // Another real writer won the snapshot fence. Its durable cursor will be
      // observed on the next scheduled tick; no synthetic result or blind retry.
      if (error instanceof WillowError && error.code === 'stale') contended++
      else throw error
    }
  }
  return { accounts: count, minutes, days, through, contended }
}
