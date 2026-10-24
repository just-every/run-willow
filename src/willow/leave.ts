import { validateRules, writeRuleStatement, readRules, accruePolicy, policyEligibility, calculationsFor } from './leave-policy'
import { policyRulesInput } from './leave-policy-input'
// Flows 7, 8 and 9: owner-approved leave policies, accounts with signed-off
// opening balances, schedule-based request calculation, routed approval and
// reversal. The ledger is append-only: a balance is the sum of its entries,
// a request reserves its minutes inside the same batch that checks the
// balance, approval converts the reservation into use, and cancelling
// approved leave writes a reversal of the use entry. Confidential reasons
// live in their own table and are read only with the leave_reason facet.
import type { Bindings } from '../auth.server'
import { can, canAbout, requireOwner, requirePermission, type Actor } from './actor'
import { scopeFence } from './levels/scope'
import { canRequestLeave, readsLeaveField, hasLeaveBaseline, type LeaveField } from './levels/leave'
import { liveLeaveActor, currentLeaveMember, leaveReadFields, absenceView } from './leave-projection'
import { sees } from './access'
import { all, auditRead, commit, guard, insist, json, newId, now, one, stmt, type Row } from './core'
import { addDays, daysBetween, hours, parseHours, requireDate, weekday } from './dates'
import { WEEKDAYS } from './employer'
import type { Input } from './input'
import { displayName, termsOn } from './people'
import { hasApproval } from './levels/approvals'

const BALANCE = '(SELECT COALESCE(SUM(minutes), 0) FROM wl_ledger WHERE account_id = ?)'

export async function createPolicy(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'leave.manage')
  const existing = input.text('policy', { optional: true, max: 100 })
  const policyId = existing || newId()
  if (existing) insist(await one(env, 'SELECT 1 FROM wl_leave_policies WHERE id = ?', existing), 'policy_not_found', 404)
  else insist(!await one(env, 'SELECT 1 FROM wl_leave_policies WHERE name = ?', input.text('name', { max: 80 })), 'name_taken', 409)
  const weeks = input.text('accrualWeeks', { max: 6 })
  insist(/^\d{1,2}(\.\d{1,2})?$/.test(weeks), 'invalid_accrualWeeks')
  const negative = parseHours(input.text('negativeLimitHours', { optional: true, max: 8 }) || '0', 'invalid_negativeLimitHours')
  insist(negative >= 0, 'invalid_negativeLimitHours')
  const version = ((await one<{ v: number }>(env, 'SELECT MAX(version) AS v FROM wl_policy_versions WHERE policy_id = ?', policyId))?.v ?? 0) + 1
  const id = newId(), rules = validateRules(policyRulesInput(input))
  if(rules) for(const variant of rules.locations) insist(await one(env,'SELECT 1 FROM wl_locations WHERE id=?',variant.locationId),'location_not_found',404)
  await commit(env, [
    ...(existing ? [] : [stmt(env, 'INSERT INTO wl_leave_policies (id, name, created_at) VALUES (?, ?, ?)', policyId, input.text('name', { max: 80 }), now())]),
    stmt(env, "INSERT INTO wl_policy_versions (id, policy_id, version, summary, accrual_weeks_hundredths, negative_limit_minutes, status, written_by, written_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)", id, policyId, version, input.text('summary', { max: 4000 }), Math.round(Number(weeks) * 100), negative, actor.id, now()),
    ...(rules ? [writeRuleStatement(env,id,rules)] : []),
  ], { actor: actor.id, action: 'policy.write', subject: id, detail: { policy: policyId, version } })
  return { id, policy: policyId, version, status: 'draft' }
}

export async function approvePolicy(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  const id = input.text('version', { max: 100 })
  const row = await one(env, 'SELECT * FROM wl_policy_versions WHERE id = ?', id)
  insist(row, 'policy_not_found', 404)
  insist(row.status === 'draft', 'already_approved', 409)
  await commit(env, [stmt(env, "UPDATE wl_policy_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ? AND status = 'draft'", actor.id, now(), id)], { actor: actor.id, action: 'policy.approve', subject: id })
  return { id, status: 'approved' }
}

export async function policies(env: Bindings) {
  const versions = await all(env, 'SELECT * FROM wl_policy_versions ORDER BY version DESC')
  return await Promise.all((await all(env, 'SELECT * FROM wl_leave_policies ORDER BY name')).map(async policy => ({
    id: policy.id, name: policy.name,
    versions: await Promise.all(versions.filter(version => version.policy_id === policy.id).map(async version => ({ id: version.id, version: version.version, status: version.status, summary: version.summary, accrualWeeks: version.accrual_weeks_hundredths / 100, negativeLimitMinutes: version.negative_limit_minutes, approvedAt: version.approved_at, rules: await readRules(env,version.id) }))),
  })))
}

async function latestApproved(env: Bindings, policyId: string) {
  const version = await one(env, "SELECT * FROM wl_policy_versions WHERE policy_id = ? AND status = 'approved' ORDER BY version DESC LIMIT 1", policyId)
  insist(version, 'policy_not_approved', 409)
  return version
}

/** Opens a leave account for an employment period with a proposed opening balance at a cutover date. */
export async function openAccount(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'leave.manage')
  const periodId = input.text('period', { max: 100 }), policyId = input.text('policy', { max: 100 })
  const period = await one(env, 'SELECT * FROM wl_periods WHERE id = ?', periodId)
  insist(period, 'period_not_found', 404)
  const version = await latestApproved(env, policyId)
  insist(!await one(env, 'SELECT 1 FROM wl_leave_accounts WHERE period_id = ? AND policy_id = ?', periodId, policyId), 'account_exists', 409)
  const cutover = requireDate(input.text('cutoverDate', { max: 10 }), 'invalid_cutoverDate')
  insist(cutover >= period.start_date, 'cutover_before_start')
  const eligibility = await policyEligibility(env,{...period,period_id:periodId,policy_version_id:version.id},cutover)
  insist(!eligibility || eligibility.eligible,'policy_not_eligible',409)
  const opening = parseHours(input.text('openingHours', { max: 10 }), 'invalid_openingHours')
  const id = newId()
  await commit(env, [stmt(env, "INSERT INTO wl_leave_accounts (id, period_id, policy_id, policy_version_id, cutover_date, opening_minutes, opening_note, opening_status, accrued_through, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)", id, periodId, policyId, version.id, cutover, opening, input.text('note', { max: 500 }), cutover, newId(), now())], { actor: actor.id, action: 'account.open', subject: id, detail: { period: periodId, policy: policyId, cutover, openingMinutes: opening } })
  return { id, status: 'proposed', openingMinutes: opening }
}

/** A leave manager signs off the opening balance: it becomes the account's first ledger entry. */
export async function approveOpening(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'leave.manage')
  const account = await one(env, 'SELECT * FROM wl_leave_accounts WHERE id = ?', input.text('account', { max: 100 }))
  insist(account, 'account_not_found', 404)
  insist(account.opening_status === 'proposed', 'opening_already_approved', 409)
  await latestApproved(env, account.policy_id)
  await commit(env, [
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_leave_accounts WHERE id = ? AND revision = ? AND opening_status = 'proposed')", account.id, account.revision),
    stmt(env, "UPDATE wl_leave_accounts SET opening_status = 'approved', approved_by = ?, approved_at = ?, revision = ? WHERE id = ?", actor.id, now(), newId(), account.id),
    stmt(env, "INSERT INTO wl_ledger (id, account_id, kind, minutes, effective_date, note, recorded_by, recorded_at) VALUES (?, ?, 'opening', ?, ?, ?, ?, ?)", newId(), account.id, account.opening_minutes, account.cutover_date, `Opening balance at ${account.cutover_date}: ${account.opening_note}`, actor.id, now()),
  ], { actor: actor.id, action: 'account.opening.approve', subject: account.id, detail: { minutes: account.opening_minutes } })
  return { id: account.id, status: 'approved' }
}

async function signedOff(env: Bindings, accountId: string) {
  const account = await one(env, 'SELECT a.*, p.person_id, p.start_date, p.end_date FROM wl_leave_accounts a JOIN wl_periods p ON p.id = a.period_id WHERE a.id = ?', accountId)
  insist(account, 'account_not_found', 404)
  insist(account.opening_status === 'approved', 'opening_not_signed_off', 409)
  return account
}

/** Weekly minutes of the schedule in force on each day, from the period's terms. */
async function scheduleDay(env: Bindings, periodId: string, date: string) {
  const terms = await termsOn(env, periodId, date)
  const schedule = terms?.schedule_id ? await one(env, 'SELECT * FROM wl_schedules WHERE id = ?', terms.schedule_id) : null
  return schedule ? { id: schedule.id as string, minutes: schedule[WEEKDAYS[weekday(date)]] as number, weekly: WEEKDAYS.reduce((sum, day) => sum + (schedule[day] as number), 0) } : null
}

/** Posts accrual from the day after accrued_through to a date: accrual weeks x weekly scheduled minutes, pro rata per day. */
export async function accrue(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'leave.manage')
  const account = await signedOff(env, input.text('account', { max: 100 }))
  const through = requireDate(input.text('through', { max: 10 }), 'invalid_through')
  const scheduled = await accruePolicy(env,actor,account,through)
  if(scheduled) return scheduled
  const from = addDays(account.accrued_through, 1)
  insist(through >= from, 'nothing_to_accrue', 409)
  const last = account.end_date && account.end_date < through ? account.end_date : through
  const version = (await one(env, 'SELECT * FROM wl_policy_versions WHERE id = ?', account.policy_version_id))!
  let fraction = 0
  for (let date = from; date <= last; date = addDays(date, 1)) {
    const day = await scheduleDay(env, account.period_id, date)
    if (day) fraction += version.accrual_weeks_hundredths / 100 * day.weekly / 365
  }
  const minutes = Math.round(fraction)
  await commit(env, [
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_leave_accounts WHERE id = ? AND accrued_through = ?)', account.id, account.accrued_through),
    stmt(env, 'UPDATE wl_leave_accounts SET accrued_through = ?, revision = ? WHERE id = ?', through, newId(), account.id),
    stmt(env, "INSERT INTO wl_ledger (id, account_id, kind, minutes, effective_date, note, recorded_by, recorded_at) VALUES (?, ?, 'accrual', ?, ?, ?, ?, ?)", newId(), account.id, minutes, through, `Accrual ${from} to ${through} under policy version ${version.version}`, actor.id, now()),
  ], { actor: actor.id, action: 'leave.accrue', subject: account.id, detail: { from, through, minutes } })
  return { id: account.id, from, through, minutes }
}

export { proposeOverride as adjust } from './protected-leave/overrides'

/** The deterministic calculation for a request: scheduled minutes on each day of the range. */
export async function calculate(env: Bindings, account: Row, start: string, end: string) {
  insist(end >= start, 'end_before_start')
  insist(daysBetween(start, end) <= 366, 'range_too_long')
  insist(start >= account.start_date && (!account.end_date || end <= account.end_date), 'outside_employment')
  const days: { date: string; minutes: number; schedule: string | null }[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const eligible=await policyEligibility(env,account,date)
    insist(!eligible || eligible.eligible,'policy_not_eligible',409)
    const day = await scheduleDay(env, account.period_id, date)
    days.push({ date, minutes: day?.minutes ?? 0, schedule: day?.id ?? null })
  }
  insist(days.every(day => day.schedule), 'no_working_schedule', 409)
  const minutes = days.reduce((sum, day) => sum + day.minutes, 0)
  insist(minutes > 0, 'no_scheduled_hours', 409)
  return { days, minutes, policyVersion: account.policy_version_id as string }
}

async function balance(env: Bindings, accountId: string) {
  return (await one<{ b: number }>(env, `SELECT ${BALANCE} AS b`, accountId))!.b
}

/** Names of people away on overlapping dates in the same department or under the same manager: dates and status only. */
async function coverage(env: Bindings, personId: string, periodId: string, start: string, end: string) {
  const terms = await termsOn(env, periodId, start)
  if (!terms) return []
  const rows = await all(env, `SELECT r.person_id, r.start_date, r.end_date, r.status, p.legal_name, p.preferred_name FROM wl_leave_requests r JOIN wl_people p ON p.id = r.person_id
    JOIN wl_leave_accounts a ON a.id = r.account_id
    JOIN wl_terms t ON t.period_id = a.period_id AND t.status = 'active' AND t.effective_from = (SELECT MAX(effective_from) FROM wl_terms t2 WHERE t2.period_id = a.period_id AND t2.status = 'active' AND t2.effective_from <= r.start_date)
    WHERE r.person_id <> ? AND r.status IN ('pending', 'approved') AND r.start_date <= ? AND r.end_date >= ?
      AND ((t.department_id IS NOT NULL AND t.department_id = ?) OR (t.manager_person_id IS NOT NULL AND t.manager_person_id = ?))
    ORDER BY r.start_date`, personId, end, start, terms.department_id, terms.manager_person_id)
  return rows.map(row => ({ name: displayName(row), startDate: row.start_date, endDate: row.end_date, status: row.status }))
}

export async function quote(env: Bindings, actor: Actor, input: Input) {
  const account = await signedOff(env, input.text('account', { max: 100 }))
  const read = leaveReadFields(actor, account.person_id)
  insist(Object.values(read).some(Boolean), 'not_found', 404)
  const start = requireDate(input.text('startDate', { max: 10 }), 'invalid_startDate'), end = requireDate(input.text('endDate', { max: 10 }), 'invalid_endDate')
  const calculated = await calculate(env, account, start, end)
  const calculation = hasLeaveBaseline(actor, account.person_id) ? calculated : { ...calculated, days: calculated.days.map(day => ({ date: day.date, minutes: day.minutes })) }
  const current = await balance(env, account.id)
  const limit = (await one<{ negative_limit_minutes: number }>(env, 'SELECT negative_limit_minutes FROM wl_policy_versions WHERE id = ?', account.policy_version_id))!.negative_limit_minutes
  return { ...(read.requests ? { ...calculation, ...(!read.policies ? { policyVersion: undefined } : {}) } : {}), ...(read.balances ? { balanceMinutes: current, afterMinutes: current - calculation.minutes, allowed: current - calculation.minutes >= -limit } : {}), coverage: read.calendar ? await coverage(env, account.person_id, account.period_id, start, end) : [], withheld: Object.keys(read).filter(field => !read[field as LeaveField]) }
}

/** The approver: the member who is the person's manager on the first day, else the leave managers' queue. */
async function approverFor(env: Bindings, account: Row, start: string, requester: string) {
  const terms = await termsOn(env, account.period_id, start)
  if (!terms?.manager_person_id) return null
  const member = await one<{ id: string }>(env, "SELECT id FROM wl_members WHERE person_id = ? AND status = 'active'", terms.manager_person_id)
  return member && member.id !== requester ? member.id : null
}

export async function requestLeave(env: Bindings, actor: Actor, input: Input) {
  const live = await liveLeaveActor(env, actor)
  actor = live.actor
  const account = await signedOff(env, input.text('account', { max: 100 }))
  insist(canRequestLeave(actor, account.person_id), Object.values(leaveReadFields(actor, account.person_id)).some(Boolean) ? 'forbidden' : 'not_found', Object.values(leaveReadFields(actor, account.person_id)).some(Boolean) ? 403 : 404)
  const start = requireDate(input.text('startDate', { max: 10 }), 'invalid_startDate'), end = requireDate(input.text('endDate', { max: 10 }), 'invalid_endDate')
  const calculation = await calculate(env, account, start, end)
  insist(!await one(env, "SELECT 1 FROM wl_leave_requests WHERE person_id = ? AND status IN ('pending', 'approved') AND start_date <= ? AND end_date >= ?", account.person_id, end, start), 'overlaps_existing_leave', 409)
  const reason = input.text('reason', { optional: true, max: 2000 })
  const limit = (await one<{ negative_limit_minutes: number }>(env, 'SELECT negative_limit_minutes FROM wl_policy_versions WHERE id = ?', account.policy_version_id))!.negative_limit_minutes
  const id = newId(), approver = await approverFor(env, account, start, actor.id)
  await commit(env, [
    // Competing reservations report the balance failure before the audit fence; all guards precede writes.
    guard(env, 'insufficient_balance', `${BALANCE} - ? >= ?`, account.id, calculation.minutes, -limit),
    ...live.guards,
    guard(env, 'stale', "NOT EXISTS(SELECT 1 FROM wl_leave_requests WHERE person_id = ? AND status IN ('pending', 'approved') AND start_date <= ? AND end_date >= ?)", account.person_id, end, start),
    stmt(env, "INSERT INTO wl_leave_requests (id, account_id, person_id, start_date, end_date, minutes, calculation, approver_member_id, status, requested_by, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)", id, account.id, account.person_id, start, end, calculation.minutes, JSON.stringify(calculation), approver, actor.id, now()),
    ...(reason ? [stmt(env, 'INSERT INTO wl_leave_reasons (request_id, reason) VALUES (?, ?)', id, reason)] : []),
    stmt(env, "INSERT INTO wl_ledger (id, account_id, kind, minutes, effective_date, request_id, note, recorded_by, recorded_at) VALUES (?, ?, 'reservation', ?, ?, ?, 'Reserved for a pending request', ?, ?)", newId(), account.id, -calculation.minutes, start, id, actor.id, now()),
  ], { actor: actor.id, action: 'leave.request', subject: id, detail: { account: account.id, minutes: calculation.minutes, approver } })
  return { id, minutes: calculation.minutes, status: 'pending', approver }
}

async function requestRow(env: Bindings, id: string) {
  const row = await one(env, 'SELECT r.*, a.period_id, a.policy_id FROM wl_leave_requests r JOIN wl_leave_accounts a ON a.id = r.account_id WHERE r.id = ?', id)
  insist(row, 'request_not_found', 404)
  return row
}

/** The routed approver decides; a leave manager may decide any request except their own. */
export function mayDecideLeave(actor: Actor, request: Row) {
  if (request.requested_by === actor.id || request.person_id === actor.personId) return false
  return request.approver_member_id === actor.id || canAbout(actor, 'leave.manage', request.person_id) || hasApproval(actor, 'leave', request.person_id)
}

/** A leave manager whose authority comes only from a scoped level is rechecked inside the write (ROLE-002). */
const scopeGuard = async (env: Bindings, actor: Actor, personId: string, otherAuthority: boolean) => otherAuthority || can(actor, 'leave.manage') ? [] : await scopeFence(env, actor, personId, 'leave.manage')

// A route grants access to this request only, never the person's account/facets.
export const mayReadLeaveRequest = (actor: Actor, request: Row) => readsLeaveField(actor, request.person_id, 'requests') || request.approver_member_id === actor.id || mayDecideLeave(actor, request)

const ledgerEntry = (env: Bindings, actor: Actor, request: Row, kind: string, minutes: number, note: string, reverses: string | null = null) =>
  stmt(env, 'INSERT INTO wl_ledger (id, account_id, kind, minutes, effective_date, request_id, reverses, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), request.account_id, kind, minutes, request.start_date, request.id, reverses, note, actor.id, now())

export async function decideLeave(env: Bindings, actor: Actor, input: Input) {
  const live = await liveLeaveActor(env, actor)
  actor = live.actor
  const request = await requestRow(env, input.text('request', { max: 100 }))
  insist(mayReadLeaveRequest(actor, request), 'not_found', 404)
  insist(mayDecideLeave(actor, request), 'not_your_decision', 403)
  const decision = input.text('decision', { max: 10 })
  insist(decision === 'approve' || decision === 'decline', 'invalid_decision')
  const note = input.text('note', { optional: true, max: 500 }) || null
  const approved = decision === 'approve'
  if (approved) insist(canRequestLeave(await currentLeaveMember(env, request.requested_by), request.person_id), 'leave_access_changed', 403)
  await commit(env, [
    ...live.guards,
    ...await scopeGuard(env, actor, request.person_id, request.approver_member_id === actor.id || hasApproval(actor, 'leave', request.person_id)),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_leave_requests WHERE id = ? AND status = 'pending')", request.id),
    stmt(env, "UPDATE wl_leave_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND status = 'pending'", approved ? 'approved' : 'declined', actor.id, now(), note, request.id),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_leave_requests WHERE id = ? AND status = ? AND decided_by = ?)', request.id, approved ? 'approved' : 'declined', actor.id),
    ledgerEntry(env, actor, request, 'release', request.minutes, approved ? 'Reservation converted on approval' : 'Reservation released on decline'),
    ...(approved ? [ledgerEntry(env, actor, request, 'use', -request.minutes, 'Approved leave')] : []),
  ], { actor: actor.id, action: `leave.${decision}`, subject: request.id })
  return { id: request.id, status: approved ? 'approved' : 'declined' }
}

export async function withdrawLeave(env: Bindings, actor: Actor, input: Input) {
  const live = await liveLeaveActor(env, actor)
  actor = live.actor
  const request = await requestRow(env, input.text('request', { max: 100 }))
  insist(request.person_id === actor.personId || canAbout(actor, 'leave.manage', request.person_id) || (request.requested_by === actor.id && canRequestLeave(actor, request.person_id)), 'not_found', 404)
  await commit(env, [
    ...live.guards,
    stmt(env, "UPDATE wl_leave_requests SET status = 'withdrawn', cancelled_by = ?, cancelled_at = ? WHERE id = ? AND status = 'pending'", actor.id, now(), request.id),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_leave_requests WHERE id = ? AND status = 'withdrawn' AND cancelled_by = ?)", request.id, actor.id),
    ledgerEntry(env, actor, request, 'release', request.minutes, 'Reservation released on withdrawal'),
  ], { actor: actor.id, action: 'leave.withdraw', subject: request.id })
  return { id: request.id, status: 'withdrawn' }
}

/** Statements that cancel approved leave by reversing its use entry exactly once. */
async function reversalStatements(env: Bindings, actor: Actor, request: Row, note: string) {
  const use = await one(env, "SELECT * FROM wl_ledger WHERE request_id = ? AND kind = 'use'", request.id)
  insist(use, 'request_not_approved', 409)
  return [
    stmt(env, "UPDATE wl_leave_requests SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_note = ? WHERE id = ? AND status = 'approved'", actor.id, now(), note, request.id),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_leave_requests WHERE id = ? AND status = 'cancelled' AND cancelled_by = ?)", request.id, actor.id),
    ledgerEntry(env, actor, request, 'reversal', -use.minutes, note, use.id),
  ]
}

export async function cancelLeave(env: Bindings, actor: Actor, input: Input) {
  const live = await liveLeaveActor(env, actor)
  actor = live.actor
  const request = await requestRow(env, input.text('request', { max: 100 }))
  insist(mayReadLeaveRequest(actor, request), 'not_found', 404)
  const own = request.person_id === actor.personId
  insist(request.status === 'approved', 'request_not_approved', 409)
  insist(canAbout(actor, 'leave.manage', request.person_id) || request.approver_member_id === actor.id || (own && request.start_date > actor.today), 'not_your_decision', 403)
  const note = input.text('note', { max: 500 })
  await commit(env, [...live.guards, ...await scopeGuard(env, actor, request.person_id, request.approver_member_id === actor.id || (own && request.start_date > actor.today)), ...await reversalStatements(env, actor, request, note)], { actor: actor.id, action: 'leave.cancel', subject: request.id })
  return { id: request.id, status: 'cancelled' }
}

/** Corrects approved leave: the old use is reversed and the corrected dates are used, in one batch, against the balance. */
export async function correctLeave(env: Bindings, actor: Actor, input: Input) {
  const live = await liveLeaveActor(env, actor)
  actor = live.actor
  const request = await requestRow(env, input.text('request', { max: 100 }))
  insist(mayReadLeaveRequest(actor, request), 'not_found', 404)
  insist(canAbout(actor, 'leave.manage', request.person_id) || (request.approver_member_id === actor.id && mayDecideLeave(actor, request)), 'not_your_decision', 403)
  insist(request.status === 'approved', 'request_not_approved', 409)
  const account = await signedOff(env, request.account_id)
  const start = requireDate(input.text('startDate', { max: 10 }), 'invalid_startDate'), end = requireDate(input.text('endDate', { max: 10 }), 'invalid_endDate')
  const calculation = await calculate(env, account, start, end)
  insist(!await one(env, "SELECT 1 FROM wl_leave_requests WHERE person_id = ? AND id <> ? AND status IN ('pending', 'approved') AND start_date <= ? AND end_date >= ?", account.person_id, request.id, end, start), 'overlaps_existing_leave', 409)
  const limit = (await one<{ negative_limit_minutes: number }>(env, 'SELECT negative_limit_minutes FROM wl_policy_versions WHERE id = ?', account.policy_version_id))!.negative_limit_minutes
  const note = input.text('note', { max: 500 }), id = newId()
  const corrected = { ...request, id, start_date: start, minutes: calculation.minutes }
  await commit(env, [
    ...live.guards,
    ...await scopeGuard(env, actor, request.person_id, request.approver_member_id === actor.id),
    ...await reversalStatements(env, actor, request, `Corrected: ${note}`),
    stmt(env, "INSERT INTO wl_leave_requests (id, account_id, person_id, start_date, end_date, minutes, calculation, approver_member_id, status, corrects, requested_by, requested_at, decided_by, decided_at, decision_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)", id, request.account_id, request.person_id, start, end, calculation.minutes, JSON.stringify(calculation), request.approver_member_id, request.id, request.requested_by, request.requested_at, actor.id, now(), note),
    stmt(env, 'INSERT INTO wl_leave_reasons (request_id, reason) SELECT ?, reason FROM wl_leave_reasons WHERE request_id = ?', id, request.id),
    ledgerEntry(env, actor, corrected, 'use', -calculation.minutes, 'Corrected approved leave'),
    guard(env, 'insufficient_balance', `${BALANCE} >= ?`, request.account_id, -limit),
  ], { actor: actor.id, action: 'leave.correct', subject: request.id, detail: { replacement: id, minutes: calculation.minutes } })
  return { id, corrects: request.id, minutes: calculation.minutes, status: 'approved' }
}

function requestView(row: Row, reason: string | null | undefined, withReason: boolean) {
  return {
    id: row.id, person: row.person_id, account: row.account_id, policy: row.policy_name, startDate: row.start_date, endDate: row.end_date, minutes: row.minutes, hours: hours(row.minutes), status: row.status,
    corrects: row.corrects, requestedAt: row.requested_at, decidedAt: row.decided_at, decisionNote: row.decision_note, cancelNote: row.cancel_note,
    ...(withReason ? { reason: reason ?? null } : {}),
  }
}

// Rowids change on archive restore. Keep same-instant ledger entries in their
// causal order using durable fields, with a stable tie-breaker.
const LEDGER_ORDER = `recorded_at, CASE kind WHEN 'opening' THEN 0 WHEN 'accrual' THEN 1 WHEN 'adjustment' THEN 2 WHEN 'reservation' THEN 3 WHEN 'release' THEN 4 WHEN 'use' THEN 5 ELSE 6 END, id`

const REQUESTS = 'SELECT r.*, l.name AS policy_name, p.legal_name, p.preferred_name FROM wl_leave_requests r JOIN wl_leave_accounts a ON a.id = r.account_id JOIN wl_leave_policies l ON l.id = a.policy_id JOIN wl_people p ON p.id = r.person_id'

async function reasonsFor(env: Bindings, actor: Actor, rows: Row[]) {
  const permitted = rows.filter(row => sees(actor, row.person_id, 'leave_reason'))
  if (!permitted.length) return new Map<string, string>()
  const reasons = await all<{ request_id: string; reason: string }>(env, `SELECT request_id, reason FROM wl_leave_reasons WHERE request_id IN (${permitted.map(() => '?').join(', ')})`, ...permitted.map(row => row.id))
  const others = reasons.filter(reason => permitted.find(row => row.id === reason.request_id)?.person_id !== actor.personId)
  if (others.length) await auditRead(env, actor.id, 'leave.reason.read', others.map(reason => reason.request_id).join(','))
  return new Map(reasons.map(reason => [reason.request_id, reason.reason]))
}

export async function leaveDetail(env: Bindings, actor: Actor, id: string) {
  const row = await one(env, `${REQUESTS} WHERE r.id = ?`, id)
  insist(row && mayReadLeaveRequest(actor, row), 'not_found', 404)
  const routed = row.approver_member_id === actor.id
  const read = leaveReadFields(actor, row.person_id)
  const reasons = await reasonsFor(env, actor, [row])
  const ledger = read.ledger || routed ? await all(env, `SELECT kind, minutes, effective_date, reverses, recorded_at FROM wl_ledger WHERE request_id = ? ORDER BY ${LEDGER_ORDER}`, id) : []
  const request = requestView(row, reasons.get(id), sees(actor, row.person_id, 'leave_reason'))
  if (!read.policies && !routed) delete (request as Record<string, unknown>).policy
  if (!hasLeaveBaseline(actor, row.person_id) && !routed) { request.decisionNote = null; request.cancelNote = null }
  const calculation = json<Record<string, unknown>>(row.calculation, {})
  if (!hasLeaveBaseline(actor, row.person_id) && !routed && Array.isArray(calculation.days)) calculation.days = calculation.days.map((day: Record<string, unknown>) => ({ date: day.date, minutes: day.minutes }))
  if (!read.policies && !routed) delete calculation.policyVersion
  return {
    ...request, name: displayName(row), calculation, ledger,
    ...(read.balances ? { balanceMinutes: await balance(env, row.account_id) } : {}),
    coverage: read.calendar || routed ? await coverage(env, row.person_id, (await one<{ period_id: string }>(env, 'SELECT period_id FROM wl_leave_accounts WHERE id = ?', row.account_id))!.period_id, row.start_date, row.end_date) : [],
    withheld: Object.keys(read).filter(field => !read[field as LeaveField]),
    canDecide: row.status === 'pending' && mayDecideLeave(actor, row),
    canCancel: row.status === 'approved' && (canAbout(actor, 'leave.manage', row.person_id) || routed || (row.person_id === actor.personId && row.start_date > actor.today)),
    canCorrect: row.status === 'approved' && (canAbout(actor, 'leave.manage', row.person_id) || (routed && mayDecideLeave(actor, row))),
  }
}

/** Independent ordinary leave fields; reading one never supplies another. */
export async function leaveFor(env: Bindings, actor: Actor, personId: string, withReason = sees(actor, personId, 'leave_reason'), asOf?: string, allow?: (field: LeaveField) => boolean) {
  const read = leaveReadFields(actor, personId, allow)
  const accounts = Object.values(read).some(Boolean) ? await all(env, 'SELECT a.*, l.name AS policy_name, v.version AS policy_version FROM wl_leave_accounts a JOIN wl_periods p ON p.id = a.period_id JOIN wl_leave_policies l ON l.id = a.policy_id JOIN wl_policy_versions v ON v.id = a.policy_version_id WHERE p.person_id = ? ORDER BY a.created_at', personId) : []
  const ledger = (read.balances || read.ledger) && accounts.length ? (await all(env, `SELECT * FROM wl_ledger WHERE account_id IN (${accounts.map(() => '?').join(', ')}) ORDER BY ${LEDGER_ORDER}`, ...accounts.map(account => account.id))).filter(entry => !asOf || entry.effective_date <= asOf) : []
  const requests = read.requests || read.calendar ? (await all(env, `${REQUESTS} WHERE r.person_id = ? ORDER BY r.start_date DESC`, personId)).filter(row => !asOf || row.start_date <= asOf) : []
  const reasons = read.requests && withReason ? await reasonsFor(env, actor, requests) : new Map<string, string>()
  return {
    accounts: read.balances || read.ledger || read.requests || read.policies ? await Promise.all(accounts.filter(account => !asOf || account.cutover_date <= asOf).map(async account => ({
      id: account.id,
      ...(read.requests || read.ledger ? { period: account.period_id } : {}),
      ...(read.policies ? { policy: { id: account.policy_id, name: account.policy_name, version: account.policy_version, versionId: account.policy_version_id } } : {}),
      ...(read.requests || read.balances ? { openingStatus: account.opening_status } : {}),
      ...(read.balances ? { cutoverDate: account.cutover_date, openingMinutes: account.opening_minutes, accruedThrough: account.accrued_through, balanceMinutes: ledger.filter(entry => entry.account_id === account.id).reduce((sum, entry) => sum + entry.minutes, 0) } : {}),
      ...(read.ledger ? { calculations: read.balances && read.policies ? await calculationsFor(env, account.id, asOf) : [], ledger: ledger.filter(entry => entry.account_id === account.id).map(entry => ({ id: entry.id, kind: entry.kind, minutes: entry.minutes, effectiveDate: entry.effective_date, ...(read.requests ? { request: entry.request_id } : {}), reverses: entry.reverses, note: entry.note })) } : {}),
    }))) : [],
    requests: read.requests ? requests.map(row => {
      const request = requestView(row, reasons.get(row.id), withReason && sees(actor, personId, 'leave_reason'))
      if (!read.policies) delete (request as Record<string, unknown>).policy
      if (!hasLeaveBaseline(actor, personId)) { request.decisionNote = null; request.cancelNote = null }
      return request
    }) : [],
    calendar: read.calendar ? requests.filter(row => ['pending', 'approved'].includes(row.status)).map(row => absenceView(row, displayName(row))) : [],
    withheld: Object.keys(read).filter(field => !read[field as LeaveField]),
  }
}

/** Fine policy reads expose only currently approved versions assigned in today's scope. */
export async function readablePolicies(env: Bindings, actor: Actor, personId?: string) {
  if (can(actor, 'leave.manage')) return policies(env)
  const rows = await all(env, 'SELECT DISTINCT p.person_id,a.policy_version_id FROM wl_leave_accounts a JOIN wl_periods p ON p.id=a.period_id')
  const ids = new Set(rows.filter(row => (!personId || row.person_id === personId) && readsLeaveField(actor, row.person_id, 'policies')).map(row => row.policy_version_id))
  return (await policies(env)).map(policy => ({ ...policy, versions: policy.versions.filter(version => version.status === 'approved' && ids.has(version.id)) })).filter(policy => policy.versions.length)
}

/** Requests waiting for this member's decision. */
export async function approvals(env: Bindings, actor: Actor) {
  const rows = await all(env, `${REQUESTS} WHERE r.status = 'pending' ORDER BY r.start_date`)
  return rows.filter(row => mayReadLeaveRequest(actor, row) && mayDecideLeave(actor, row))
    .map(row => ({ ...requestView(row, null, false), name: displayName(row), routedToYou: row.approver_member_id === actor.id }))
}

