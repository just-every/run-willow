// Agent-native workflows without a model account. The owner's own agent (or a
// person) prepares a joiner or mover through the JSON door: Willow validates
// the plan with the same code that executes it, lists missing information,
// records the record versions it was prepared against and an explicit diff.
// HR approves the exact plan; execution and the receipt commit in one batch,
// and only while every expected version is unchanged. A changed input needs a
// new proposal. Agents read people through the same access projection as
// members (context), never more.
import type { Bindings } from '../auth.server'
import { can, requirePermission, type Actor } from './actor'
import { FACET_LABELS, facets, type Facet } from './access'
import { all, commit, guard, insist, json, newId, now, one, sha256Hex, stmt } from './core'
import { Input } from './input'
import { REQUIRED_FIELDS, prepareJoiner, prepareMover } from './lifecycle'
import { PRIVATE_FIELDS, displayName, termsOn } from './people'
import { employer } from './employer'
import { formatPay } from './money'
import { personView } from './profile'

type Change = { field: string; from: string | null; to: string | null; sensitivity?: 'private' | 'pay' }

const TERM_FIELDS: [string, string, string][] = [['jobTitle', 'job_title', 'Job title'], ['departmentId', 'department_id', 'Department'], ['locationId', 'location_id', 'Location'], ['managerPersonId', 'manager_person_id', 'Manager'], ['scheduleId', 'schedule_id', 'Schedule']]

async function payLabel(env: Bindings, basis: string | null, amount: string | null) {
  const currency = (await employer(env))?.currency
  return amount && currency ? formatPay(basis ?? '', Math.round(Number(amount) * 100), currency) : `${basis} ${amount ?? ''}`.trim()
}

async function label(env: Bindings, column: string, value: string | null) {
  if (!value) return null
  const table = { department_id: 'wl_departments', location_id: 'wl_locations', schedule_id: 'wl_schedules' }[column]
  if (table) return (await one<{ name: string }>(env, `SELECT name FROM ${table} WHERE id = ?`, value))?.name ?? value
  if (column === 'manager_person_id') { const person = await one(env, 'SELECT legal_name, preferred_name FROM wl_people WHERE id = ?', value); return person ? displayName(person) : value }
  return value
}

async function describe(env: Bindings, kind: string, plan: Record<string, unknown>) {
  const changes: Change[] = [], missing: string[] = [], expected: Record<string, unknown> = {}
  const text = (key: string) => typeof plan[key] === 'string' && (plan[key] as string).trim() ? (plan[key] as string).trim() : null
  if (kind === 'joiner') {
    const template = await one(env, "SELECT * FROM wl_templates WHERE id = ? AND status = 'active'", text('template'))
    insist(template, 'template_not_found', 404)
    expected.template = template.id
    if (text('person')) {
      const person = (await one(env, 'SELECT id, revision, legal_name, preferred_name FROM wl_people WHERE id = ?', text('person')))!
      expected.person = { id: person.id, revision: person.revision }
      changes.push({ field: 'Rehire of', from: null, to: displayName(person) })
    } else {
      for (const [key, name] of [['legalName', 'Legal name'], ['preferredName', 'Preferred name'], ['workEmail', 'Work email'], ['employeeNumber', 'Employee number']]) if (text(key)) changes.push({ field: name, from: null, to: text(key) })
      for (const field of PRIVATE_FIELDS) if (text(field)) changes.push({ field, from: null, to: text(field), sensitivity: 'private' })
    }
    changes.push({ field: 'Start date', from: null, to: text('startDate') }, { field: 'Employment type', from: null, to: text('employmentType') })
    if (text('payrollId')) changes.push({ field: 'Payroll identifier', from: null, to: text('payrollId') })
    for (const [key, column, name] of TERM_FIELDS) changes.push({ field: name, from: null, to: await label(env, column, text(key)) })
    if (text('payBasis')) changes.push({ field: 'Pay', from: null, to: await payLabel(env, text('payBasis'), text('payAmount')), sensitivity: 'pay' })
    const required = json<string[]>(template.required_fields, [])
    const supplied = (field: string) => field === 'work_email' ? text('workEmail') : field === 'payroll_id' ? text('payrollId') : text(field)
    missing.push(...required.filter(field => (REQUIRED_FIELDS as readonly string[]).includes(field) && !supplied(field)))
    if (!text('managerPersonId')) missing.push('manager')
    if (!text('scheduleId')) missing.push('working schedule')
  } else {
    const period = await one(env, 'SELECT * FROM wl_periods WHERE id = ?', text('period'))
    insist(period, 'period_not_found', 404)
    expected.period = { id: period.id, revision: period.revision }
    const base = await termsOn(env, period.id, text('effectiveFrom') ?? period.start_date)
    changes.push({ field: 'Effective from', from: base?.effective_from ?? null, to: text('effectiveFrom') })
    for (const [key, column, name] of TERM_FIELDS) if (key in plan) changes.push({ field: name, from: await label(env, column, base?.[column] ?? null), to: await label(env, column, text(key)) })
    if (text('payBasis')) changes.push({ field: 'Pay', from: null, to: await payLabel(env, text('payBasis'), text('payAmount')), sensitivity: 'pay' })
  }
  return { changes, missing, expected }
}

export async function propose(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const kind = input.text('kind', { max: 10 })
  insist(kind === 'joiner' || kind === 'mover', 'invalid_kind')
  const plan = input.json('plan') as Record<string, unknown>
  insist(plan && typeof plan === 'object' && !Array.isArray(plan) && JSON.stringify(plan).length <= 20_000, 'invalid_plan')
  // Validate with the code that will execute it; nothing is written.
  await (kind === 'joiner' ? prepareJoiner : prepareMover)(env, actor, Input.of(plan))
  const { changes, missing, expected } = await describe(env, kind, plan)
  const id = newId()
  await commit(env, [stmt(env, "INSERT INTO wl_proposals (id, kind, summary, agent, plan, expected, diff, missing, status, proposed_by, proposed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)", id, kind, input.text('summary', { max: 500 }), input.text('agent', { max: 120 }), JSON.stringify(plan), JSON.stringify(expected), JSON.stringify(changes), JSON.stringify(missing), actor.id, now())], { actor: actor.id, action: 'proposal.create', subject: id, detail: { kind, agent: input.text('agent', { max: 120 }) } })
  return { id, status: 'pending', missing, changes: redact(actor, changes) }
}

function redact(actor: Actor, changes: Change[]) {
  return changes.map(change => (change.sensitivity === 'private' && !can(actor, 'people.private')) || (change.sensitivity === 'pay' && !can(actor, 'pay.read')) ? { ...change, to: 'provided (you cannot read this field)' } : change)
}

export async function decideProposal(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const proposal = await one(env, 'SELECT * FROM wl_proposals WHERE id = ?', input.text('proposal', { max: 100 }))
  insist(proposal, 'proposal_not_found', 404)
  insist(proposal.status === 'pending', 'proposal_decided', 409)
  const decision = input.text('decision', { max: 10 })
  insist(decision === 'approve' || decision === 'decline', 'invalid_decision')
  if (decision === 'decline') {
    await commit(env, [stmt(env, "UPDATE wl_proposals SET status = 'declined', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'", actor.id, now(), proposal.id)], { actor: actor.id, action: 'proposal.decline', subject: proposal.id })
    return { id: proposal.id, status: 'declined' }
  }
  const expected = json<{ template?: string; person?: { id: string; revision: string }; period?: { id: string; revision: string } }>(proposal.expected, {})
  const fences = [
    ...(expected.template ? [guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_templates WHERE id = ? AND status = 'active')", expected.template)] : []),
    ...(expected.person ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_people WHERE id = ? AND revision = ?)', expected.person.id, expected.person.revision)] : []),
    ...(expected.period ? [guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_periods WHERE id = ? AND revision = ?)', expected.period.id, expected.period.revision)] : []),
  ]
  const stale = (expected.template && !await one(env, "SELECT 1 FROM wl_templates WHERE id = ? AND status = 'active'", expected.template))
    || (expected.person && !await one(env, 'SELECT 1 FROM wl_people WHERE id = ? AND revision = ?', expected.person.id, expected.person.revision))
    || (expected.period && !await one(env, 'SELECT 1 FROM wl_periods WHERE id = ? AND revision = ?', expected.period.id, expected.period.revision))
  insist(!stale, 'proposal_stale', 409)
  const plan = JSON.parse(proposal.plan)
  const prepared = await (proposal.kind === 'joiner' ? prepareJoiner : prepareMover)(env, actor, Input.of(plan))
  const receipt = { executedBy: actor.id, executedAt: now(), planSha256: await sha256Hex(proposal.plan), result: prepared.result }
  await commit(env, [
    ...fences,
    stmt(env, "UPDATE wl_proposals SET status = 'approved', decided_by = ?, decided_at = ?, receipt = ? WHERE id = ? AND status = 'pending'", actor.id, receipt.executedAt, JSON.stringify(receipt), proposal.id),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_proposals WHERE id = ? AND status = 'approved' AND decided_by = ?)", proposal.id, actor.id),
    ...prepared.statements,
  ], [...[prepared.audit].flat(), { actor: actor.id, action: 'proposal.approve', subject: proposal.id, detail: { planSha256: receipt.planSha256 } }])
  return { id: proposal.id, status: 'approved', receipt }
}

export async function proposals(env: Bindings, actor: Actor) {
  requirePermission(actor, 'people.manage')
  return (await all(env, 'SELECT id, kind, summary, agent, status, proposed_at, decided_at FROM wl_proposals ORDER BY proposed_at DESC')).map(row => ({ id: row.id, kind: row.kind, summary: row.summary, agent: row.agent, status: row.status, proposedAt: row.proposed_at, decidedAt: row.decided_at }))
}

export async function proposalDetail(env: Bindings, actor: Actor, id: string) {
  requirePermission(actor, 'people.manage')
  const row = await one(env, 'SELECT * FROM wl_proposals WHERE id = ?', id)
  insist(row, 'not_found', 404)
  return { id: row.id, kind: row.kind, summary: row.summary, agent: row.agent, status: row.status, proposedAt: row.proposed_at, decidedAt: row.decided_at, expected: json(row.expected, {}), changes: redact(actor, json<Change[]>(row.diff, [])), missing: json<string[]>(row.missing, []), receipt: json(row.receipt, null) }
}

/**
 * Context for an agent explaining records: only what the signed-in member may
 * read, the names of facets withheld from them, and the policy versions the
 * leave figures come from. Nothing outside the member's access is selected.
 */
export async function context(env: Bindings, actor: Actor, personId: string) {
  const id = personId === 'me' ? actor.personId : personId
  insist(id, 'not_found', 404)
  const view = await personView(env, actor, id)
  const visible = facets(actor, id)
  const leave = view.leave as { accounts: { policy: { versionId: string } }[] } | undefined
  const versions = leave?.accounts.length ? await all(env, `SELECT v.id, v.version, v.summary, v.accrual_weeks_hundredths, v.negative_limit_minutes, p.name FROM wl_policy_versions v JOIN wl_leave_policies p ON p.id = v.policy_id WHERE v.id IN (${leave.accounts.map(() => '?').join(', ')})`, ...leave.accounts.map(account => account.policy.versionId)) : []
  return {
    subject: id, record: view,
    withheld: (Object.keys(FACET_LABELS) as Facet[]).filter(facet => !visible.has(facet)).map(facet => FACET_LABELS[facet]),
    policies: versions.map(version => ({ id: version.id, policy: version.name, version: version.version, summary: version.summary, accrualWeeksPerYear: version.accrual_weeks_hundredths / 100, negativeLimitMinutes: version.negative_limit_minutes })),
    rules: ['Answer only from this record and these policy versions; cite the policy version for any leave figure.', 'Withheld facets are not available to this member: say so rather than infer them.', 'Managerial rank never implies access to pay or private details.'],
  }
}
