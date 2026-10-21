// FLOW-004 reads. Only the requester, HR, the owner and members holding a role
// in the request's resolved steps read it; the person whose terms change does
// not follow it until an access level (ROLE-001) lets them. Pay is shown only
// with pay.read: without it, a requester sees the percentage they entered and
// any other approver sees that pay changes, with the values withheld.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, insist, json, one, type Row } from '../core'
import { serve } from '../files'
import { addDays } from '../dates'
import { formatPay } from '../money'
import { displayName } from '../people'
import { chainTemplates, chains, mayApprove, mayRead, ROLE_LABELS, type ResolvedStep } from './chain'
import { ownChangeStatus, LABELS, COLUMNS } from './status'
import { followsOwnChanges } from '../levels/follow'
import type { Attachment, Base, Plan } from './requests'

export const WITHHELD = 'Withheld (you cannot read compensation)'

async function name(env: Bindings, table: string, id: string | null) {
  if (!id) return null
  if (!table) return id
  if (table === 'people') { const person = await one(env, 'SELECT legal_name, preferred_name FROM wl_people WHERE id = ?', id); return person ? displayName(person) : id }
  return (await one(env, `SELECT name FROM ${table} WHERE id = ?`, id))?.name ?? id
}

async function readable(env: Bindings, actor: Actor, row: Row) {
  return mayRead(actor, row as { requested_by: string; person_id: string }, json<ResolvedStep[]>(row.steps_json, []))
}

export async function changeRequests(env: Bindings, actor: Actor) {
  const rows = await all(env, 'SELECT r.*, p.legal_name, p.preferred_name, m.name AS requester FROM wl_change_requests r JOIN wl_people p ON p.id = r.person_id JOIN wl_members m ON m.id = r.requested_by ORDER BY r.updated_at DESC')
  const items = []
  for (const row of rows) {
    if (!await readable(env, actor, row)) {
      if(actor.personId===row.person_id && await followsOwnChanges(env,actor)) items.push(await ownChangeStatus(env,actor,row))
      continue
    }
    const steps = json<ResolvedStep[]>(row.steps_json, [])
    items.push({ statusOnly:false as const, id: row.id, person: { id: row.person_id, name: displayName(row) }, type: row.request_type, status: row.status, revision: row.revision, requestedBy: row.requester, effectiveFrom: json<Plan>(row.plan_json, {} as Plan).effectiveFrom,
      waitingOn: row.status === 'pending' ? ROLE_LABELS[steps[row.step].role] : row.status === 'returned' ? 'Requester' : null,
      yourTurn: row.status === 'pending' && await mayApprove(env, actor, row as { requested_by: string; person_id: string }, steps[row.step]) })
  }
  const manage = can(actor, 'people.manage')
  const scope = manage ? await all(env, "SELECT id, legal_name, preferred_name FROM wl_people ORDER BY legal_name") : actor.reports.size ? await all(env, `SELECT id, legal_name, preferred_name FROM wl_people WHERE id IN (${[...actor.reports].map(() => '?').join(', ')}) ORDER BY legal_name`, ...actor.reports) : []
  return {
    requests: items,
    mayRequestFor: scope.filter(p => p.id !== actor.personId).map(p => ({ id: p.id, name: displayName(p) })),
    chains: manage ? await chains(env) : null,
    moverTemplates: manage ? await chainTemplates(env) : null,
  }
}

export async function changeRequest(env: Bindings, actor: Actor, id: string) {
  const row = await one(env, 'SELECT r.*, p.legal_name, p.preferred_name FROM wl_change_requests r JOIN wl_people p ON p.id = r.person_id WHERE r.id = ?', id)
  insist(row, 'not_found', 404)
  if(!await readable(env,actor,row)) {
    insist(actor.personId===row.person_id && await followsOwnChanges(env,actor),'not_found',404)
    return await ownChangeStatus(env,actor,row)
  }
  const plan = json<Plan>(row.plan_json, {} as Plan), base = json<Base>(row.base_json, {} as Base), steps = json<ResolvedStep[]>(row.steps_json, [])
  const terms = (await one(env, 'SELECT * FROM wl_terms WHERE id = ?', base.termId))!
  const changes = []
  for (const [key, value] of Object.entries(plan.fields)) {
    const [label, table] = LABELS[key]
    if ((terms[COLUMNS[key]] ?? null) !== (value ?? null)) changes.push({ field: label, from: await name(env, table, terms[COLUMNS[key]] ?? null), to: await name(env, table, value ?? null) })
  }
  if (plan.employmentType) changes.push({ field: 'Employment type', from: base.periodType.replace('_', ' '), to: plan.employmentType.replace('_', ' '), note: `On approval the current employment period ends on ${addDays(plan.effectiveFrom, -1)} and a new ${plan.employmentType.replace('_', ' ')} period starts on ${plan.effectiveFrom} with these terms; leave accounts stay with the ended period.` })
  const pays = can(actor, 'pay.read')
  if (plan.pay) changes.push(pays
    ? { field: 'Pay', from: formatPay(base.payBasis as never, base.payCents, base.currency), to: formatPay(base.newPayBasis as never, base.newPayCents, base.currency), ...(plan.pay.mode === 'percent' ? { percent: plan.pay.percent } : {}) }
    : actor.id === row.requested_by && plan.pay.mode === 'percent' ? { field: 'Pay', from: WITHHELD, to: `${plan.pay.percent}% change`, percent: plan.pay.percent } : { field: 'Pay', from: WITHHELD, to: WITHHELD, withheld: true })
  const members = new Map((await all(env, 'SELECT id, name FROM wl_members')).map(m => [m.id, m.name]))
  const events = await all(env, 'SELECT revision, step, kind, actor, comment, at FROM wl_change_events WHERE request_id = ? ORDER BY at, id', id)
  const current = row.status === 'pending' ? steps[row.step] : undefined
  return {
    statusOnly:false as const, id: row.id, person: { id: row.person_id, name: displayName(row) }, type: row.request_type, status: row.status, revision: row.revision, state: row.state,
    requestedBy: { id: row.requested_by, name: members.get(row.requested_by) }, effectiveFrom: plan.effectiveFrom, reason: plan.reason, changes,
    fields: actor.id === row.requested_by ? plan.fields : undefined, employmentType: actor.id === row.requested_by ? plan.employmentType ?? null : undefined,
    steps: steps.map((step, index) => ({ position: index + 1, role: step.role, label: ROLE_LABELS[step.role], member: step.member ? members.get(step.member) ?? null : null, note: step.note,
      state: row.status === 'approved' || index < row.step ? 'approved' : row.status === 'pending' && index === row.step ? 'waiting' : row.status === 'declined' && index === row.step ? 'declined' : row.status === 'returned' && index === row.step ? 'returned' : 'not reached' })),
    history: events.map(e => ({ revision: e.revision, step: e.step === null ? null : e.step + 1, kind: e.kind, by: members.get(e.actor) ?? e.actor, comment: e.comment, at: e.at })),
    attachments: json<Attachment[]>(row.attachments_json, []).map(a => ({ filename: a.filename, size: a.size, sha256: a.sha256, revision: a.revision })),
    result: json<{ terms: string; case: string | null } | null>(row.result_json, null),
    mayDecide: !!current && await mayApprove(env, actor, row as { requested_by: string; person_id: string }, current),
    mayEdit: actor.id === row.requested_by && (row.status === 'pending' || row.status === 'returned'),
  }
}

export async function changeAttachment(env: Bindings, actor: Actor, id: string, sha256: string) {
  const row = await one(env, 'SELECT * FROM wl_change_requests WHERE id = ?', id)
  insist(row && await readable(env, actor, row), 'not_found', 404)
  const file = json<Attachment[]>(row.attachments_json, []).find(a => a.sha256 === sha256)
  insist(file, 'not_found', 404)
  return await serve(env, file, { download: true })
}
