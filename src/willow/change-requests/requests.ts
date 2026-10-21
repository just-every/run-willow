// FLOW-004 change requests. A manager (for a current direct report) or an HR
// member requests new dated terms for a person other than themselves. The
// request is checked by the same code that executes it, typed by whether pay
// changes, and routed through HR's current chain for that type. Approvers
// approve, decline or send back with a comment; the requester's edit appends a
// revision and restarts the chain. Final approval writes exactly one terms
// version bound to the approved values, opens the chain's mover case, and the
// pay/terms change enters the payroll handoff queue (WIL-11) like any other.
import type { Bindings } from '../../auth.server'
import { can, canAbout, type Actor } from '../actor'
import { scopeFence } from '../levels/scope'
import { commit, guard, insist, json, newId, now, one, stmt, type Row } from '../core'
import { CURRENT_TERMS } from '../employment'
import { bandPosition, guardBandSnapshot } from '../compensation/bands'
import { store, type Stored } from '../files'
import { Input } from '../input'
import { prepareMover } from '../lifecycle'
import { EMPLOYMENT_TYPES, readPay, termsOn } from '../people'
import { prepareTypeChange } from './employment-type'
import { currentChain, mayApprove, resolveSteps, type BandPosition, type RequestType, type ResolvedStep } from './chain'

const FIELDS = ['jobTitle', 'departmentId', 'locationId', 'managerPersonId', 'scheduleId'] as const
const COLUMNS: Record<typeof FIELDS[number], string> = { jobTitle: 'job_title', departmentId: 'department_id', locationId: 'location_id', managerPersonId: 'manager_person_id', scheduleId: 'schedule_id' }
const ATTACHMENT_BYTES = 10_000_000

export type PayPlan = { mode: 'percent'; percent: string } | { mode: 'amount'; basis: string; amount: string }
export interface Plan { effectiveFrom: string; reason: string; fields: Partial<Record<typeof FIELDS[number], string | null>>; pay: PayPlan | null; employmentType?: string | null }
export interface Base { periodType: string; periodRevision: string; termId: string; payBasis: string; payCents: number | null; newPayBasis: string | null; newPayCents: number | null; currency: string; band?: { id: string | null; position: BandPosition; levelRevision: string | null } }
export interface Attachment extends Stored { revision: number; by: string; at: number }

/** Percent raises round half up to the cent on the pay in force on the effective date. */
const raised = (cents: number, percent: string) => Math.round(cents * (10_000 + Math.round(Number(percent) * 100)) / 10_000)

async function readRequest(env: Bindings, actor: Actor, personId: string, input: Input) {
  insist(personId !== actor.personId, 'own_terms', 403)
  insist(canAbout(actor, 'people.manage', personId) || actor.reports.has(personId), 'forbidden', 403)
  const current = await one(env, `${CURRENT_TERMS} AND p.person_id = ?`, actor.today, personId)
  insist(current, 'period_not_found', 404)
  const period = (await one(env, 'SELECT * FROM wl_periods WHERE id = ?', current.period_id))!
  const effectiveFrom = input.text('effectiveFrom', { max: 10 })
  const fields: Plan['fields'] = {}
  // A request sets the fields it names; a blank value means unchanged, never cleared.
  for (const key of FIELDS) { const value = input.has(key) ? input.text(key, { max: 120, optional: true }) : ''; if (value) fields[key] = value }
  let pay: PayPlan | null = null
  const percent = input.text('payIncreasePercent', { optional: true, max: 8 })
  if (percent) {
    insist(/^-?\d{1,3}(\.\d{1,2})?$/.test(percent) && Number(percent) > -100, 'invalid_payIncreasePercent')
    pay = { mode: 'percent', percent }
  } else if (input.text('payAmount', { optional: true, max: 20 })) {
    const read = readPay(actor, input)!
    pay = { mode: 'amount', basis: read.basis, amount: input.text('payAmount', { max: 20 }) }
  }
  const requestedType = input.text('employmentType', { optional: true, max: 20 })
  insist(!requestedType || (EMPLOYMENT_TYPES as readonly string[]).includes(requestedType), 'invalid_employmentType')
  const employmentType = requestedType && requestedType !== period.employment_type ? requestedType : null
  const plan: Plan = { effectiveFrom, reason: input.text('reason', { max: 300 }), fields, pay, employmentType }
  const base = await termsOn(env, period.id, effectiveFrom)
  insist(base, 'effective_before_start')
  const basePay = (await one(env, 'SELECT pay_basis, amount_cents, currency FROM wl_term_pay WHERE term_id = ?', base.id))!
  let newPayBasis: string | null = null, newPayCents: number | null = null
  if (pay?.mode === 'percent') {
    insist(basePay.amount_cents !== null && basePay.pay_basis !== 'unknown', 'pay_unknown', 409)
    newPayBasis = basePay.pay_basis; newPayCents = raised(basePay.amount_cents, pay.percent)
  } else if (pay) { newPayBasis = pay.basis; newPayCents = Math.round(Number(pay.amount) * 100) }
  const payChanged = pay !== null && (newPayBasis !== basePay.pay_basis || newPayCents !== basePay.amount_cents)
  const changed = FIELDS.filter(key => key in fields && (fields[key] ?? null) !== (base[COLUMNS[key]] ?? null))
  insist(changed.length || payChanged || employmentType, 'nothing_to_change')
  // Validate with the code that executes it; nothing is written.
  await execute(env, actor, period.id, { ...plan, pay: payChanged ? pay : null }, { newPayBasis, newPayCents }, '')
  const locationAfter = (fields.locationId !== undefined ? fields.locationId : base.location_id) ?? null
  const increasePercent = payChanged && newPayBasis === basePay.pay_basis && basePay.amount_cents ? (newPayCents! - basePay.amount_cents) * 100 / basePay.amount_cents : null
  const type: RequestType = payChanged ? 'compensation' : 'job'
  const chain = await currentChain(env, type)
  insist(chain, 'change_chain_missing', 409)
  const band = chain.steps.some(step => step.bandPositions?.length) ? await bandPosition(env, {
    personId, date: effectiveFrom, jobTitle: fields.jobTitle ?? base.job_title, locationId: locationAfter,
    basis: payChanged ? newPayBasis! : basePay.pay_basis, amountCents: payChanged ? newPayCents : basePay.amount_cents,
  }) : null
  const steps = await resolveSteps(env, chain.steps, { personId, locationAfter, increasePercent, payChanged, bandPosition: band?.position }, actor.today)
  const baseRecord: Base = { periodType: period.employment_type, periodRevision: period.revision, termId: base.id, payBasis: basePay.pay_basis, payCents: basePay.amount_cents, newPayBasis: payChanged ? newPayBasis : null, newPayCents: payChanged ? newPayCents : null, currency: basePay.currency, ...(band ? { band: { id: band.band?.id ?? null, position: band.position, levelRevision: band.levelRevision } } : {}) }
  return { period, plan: { ...plan, pay: payChanged ? pay : null }, base: baseRecord, type, chain, steps, band }
}

function executionPlan(periodId: string, plan: Plan, pay: { newPayBasis: string | null; newPayCents: number | null }, template: string): Record<string, string> {
  const fields = Object.fromEntries(Object.entries(plan.fields).map(([key, value]) => [key, value ?? '']))
  return { period: periodId, effectiveFrom: plan.effectiveFrom, reason: plan.reason, template, ...fields, ...(pay.newPayBasis ? { payBasis: pay.newPayBasis, payAmount: pay.newPayCents === null ? '' : (pay.newPayCents / 100).toFixed(2) } : {}) }
}

function execute(env: Bindings, actor: Actor, periodId: string, plan: Plan, pay: { newPayBasis: string | null; newPayCents: number | null }, template: string) {
  const execution = executionPlan(periodId, plan, pay, template)
  return plan.employmentType ? prepareTypeChange(env, actor, periodId, execution, plan.employmentType, template) : prepareMover(env, actor, Input.of(execution), { approved: true })
}

async function attachment(env: Bindings, actor: Actor, input: Input, revision: number): Promise<Attachment[]> {
  const file = await input.file('attachment', { optional: true, maxBytes: ATTACHMENT_BYTES })
  return file ? [{ ...await store(env, file), revision, by: actor.id, at: now() }] : []
}

const event = (env: Bindings, request: string, revision: number, step: number | null, kind: string, actor: string, comment: string | null, at = now()) =>
  stmt(env, 'INSERT INTO wl_change_events (id, request_id, revision, step, kind, actor, comment, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId(), request, revision, step, kind, actor, comment, at)

export async function requestChange(env: Bindings, actor: Actor, input: Input) {
  const personId = input.text('person', { max: 100 })
  const read = await readRequest(env, actor, personId, input)
  const id = newId(), at = now()
  await commit(env, [
    ...await scopeAuthority(env, actor, personId, actor.reports.has(personId)),
    ...(read.band ? [guardBandSnapshot(env, read.band.source)] : []),
    stmt(env, "INSERT INTO wl_change_requests (id, person_id, period_id, request_type, requested_by, requested_at, status, revision, chain_id, steps_json, step, plan_json, base_json, attachments_json, state, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, 0, ?, ?, ?, ?, ?)",
      id, personId, read.period.id, read.type, actor.id, at, read.chain.id, JSON.stringify(read.steps), JSON.stringify(read.plan), JSON.stringify(read.base), JSON.stringify(await attachment(env, actor, input, 1)), newId(), at),
    event(env, id, 1, null, 'submitted', actor.id, input.text('comment', { optional: true, max: 1000 }) || null, at),
  ], { actor: actor.id, action: 'change.request', subject: id, detail: { person: personId, type: read.type, steps: read.steps.map(s => s.role) } })
  return { id, status: 'pending', type: read.type, steps: read.steps }
}

async function loadOpen(env: Bindings, input: Input) {
  const row = await one(env, 'SELECT * FROM wl_change_requests WHERE id = ?', input.text('request', { max: 100 }))
  insist(row, 'not_found', 404)
  insist(row.status === 'pending' || row.status === 'returned', 'change_request_decided', 409)
  insist(row.state === input.text('state', { max: 100 }), 'stale', 409)
  return row
}

/** A scoped HR requester or approver is rechecked against fresh terms inside the write (ROLE-002). */
const scopeAuthority = async (env: Bindings, actor: Actor, personId: string, viaOther: boolean) => viaOther || can(actor, 'people.manage') ? [] : await scopeFence(env, actor, personId, 'people.manage')

const fence = (env: Bindings, row: Row) => guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_change_requests WHERE id = ? AND state = ?)', row.id, row.state)

/** The requester edits a pending or returned request: a new revision whose chain restarts at its first step. */
export async function editChange(env: Bindings, actor: Actor, input: Input) {
  const row = await loadOpen(env, input)
  insist(actor.id === row.requested_by, 'forbidden', 403)
  const read = await readRequest(env, actor, row.person_id, input)
  const revision = row.revision + 1, at = now()
  const attachments = [...json<Attachment[]>(row.attachments_json, []), ...await attachment(env, actor, input, revision)]
  await commit(env, [
    fence(env, row),
    ...await scopeAuthority(env, actor, row.person_id, actor.reports.has(row.person_id)),
    ...(read.band ? [guardBandSnapshot(env, read.band.source)] : []),
    stmt(env, "UPDATE wl_change_requests SET status = 'pending', revision = ?, request_type = ?, chain_id = ?, steps_json = ?, step = 0, plan_json = ?, base_json = ?, attachments_json = ?, state = ?, updated_at = ? WHERE id = ?",
      revision, read.type, read.chain.id, JSON.stringify(read.steps), JSON.stringify(read.plan), JSON.stringify(read.base), JSON.stringify(attachments), newId(), at, row.id),
    event(env, row.id, revision, null, 'edited', actor.id, input.text('comment', { optional: true, max: 1000 }) || null, at),
  ], { actor: actor.id, action: 'change.edit', subject: row.id, detail: { revision, restarted: true, steps: read.steps.map(s => s.role) } })
  return { id: row.id, status: 'pending', revision, steps: read.steps }
}

export async function decideChange(env: Bindings, actor: Actor, input: Input) {
  const row = await loadOpen(env, input)
  insist(row.status === 'pending', 'change_request_returned', 409)
  insist(actor.id !== row.requested_by, 'own_request', 403)
  const steps = json<ResolvedStep[]>(row.steps_json, [])
  insist(await mayApprove(env, actor, row as { requested_by: string; person_id: string }, steps[row.step]), 'forbidden', 403)
  const decision = input.text('decision', { max: 10 }), comment = input.text('comment', { optional: true, max: 1000 }) || null, at = now()
  insist(['approve', 'decline', 'return'].includes(decision), 'invalid_decision')
  const audit = { actor: actor.id, subject: row.id, detail: { revision: row.revision, step: row.step, role: steps[row.step].role } }
  const authority = await scopeAuthority(env, actor, row.person_id, steps[row.step].role === 'payroll' || actor.id === steps[row.step].member)
  if (decision !== 'approve') {
    insist(decision === 'decline' || comment, 'missing_comment')
    const status = decision === 'decline' ? 'declined' : 'returned'
    await commit(env, [fence(env, row), ...authority, stmt(env, 'UPDATE wl_change_requests SET status = ?, state = ?, updated_at = ? WHERE id = ?', status, newId(), at, row.id), event(env, row.id, row.revision, row.step, status, actor.id, comment, at)],
      { ...audit, action: `change.${decision}` })
    return { id: row.id, status }
  }
  if (row.step + 1 < steps.length) {
    await commit(env, [fence(env, row), ...authority, stmt(env, 'UPDATE wl_change_requests SET step = ?, state = ?, updated_at = ? WHERE id = ?', row.step + 1, newId(), at, row.id), event(env, row.id, row.revision, row.step, 'approved', actor.id, comment, at)],
      { ...audit, action: 'change.approve' })
    return { id: row.id, status: 'pending', step: row.step + 1 }
  }
  // Final approval: the approved values execute only while the period is exactly as the chain saw it.
  const base = json<Base>(row.base_json, {} as Base), plan = json<Plan>(row.plan_json, {} as Plan)
  insist(await one(env, 'SELECT 1 FROM wl_periods WHERE id = ? AND revision = ?', row.period_id, base.periodRevision), 'change_request_stale', 409)
  let bandSource: number | null = null
  if (base.band) {
    const terms = (await one(env, 'SELECT job_title, location_id FROM wl_terms WHERE id = ?', base.termId))!
    const band = await bandPosition(env, { personId: row.person_id, date: plan.effectiveFrom,
      jobTitle: plan.fields.jobTitle ?? terms.job_title, locationId: plan.fields.locationId ?? terms.location_id,
      basis: base.newPayBasis ?? base.payBasis, amountCents: plan.pay ? base.newPayCents : base.payCents })
    insist((band.band?.id ?? null) === base.band.id && band.position === base.band.position && band.levelRevision === base.band.levelRevision, 'change_request_band_stale', 409)
    bandSource = band.source
  }
  const chain = (await one(env, 'SELECT template_id FROM wl_change_chains WHERE id = ?', row.chain_id))!
  const prepared = await execute(env, actor, row.period_id, plan, base, chain.template_id)
  await commit(env, [
    fence(env, row),
    ...authority,
    ...(bandSource === null ? [] : [guardBandSnapshot(env, bandSource)]),
    guard(env, 'change_request_stale', 'EXISTS(SELECT 1 FROM wl_periods WHERE id = ? AND revision = ?)', row.period_id, base.periodRevision),
    stmt(env, "UPDATE wl_change_requests SET status = 'approved', result_json = ?, state = ?, updated_at = ? WHERE id = ?", JSON.stringify(prepared.result), newId(), at, row.id),
    event(env, row.id, row.revision, row.step, 'approved', actor.id, comment, at),
    event(env, row.id, row.revision, null, 'executed', actor.id, null, at + 1),
    ...prepared.statements,
  ], [{ ...audit, action: 'change.approve' }, ...[prepared.audit].flat(), { actor: actor.id, action: 'change.execute', subject: row.id, detail: { terms: prepared.result.terms, case: prepared.result.case } }])
  return { id: row.id, status: 'approved', result: prepared.result }
}
