// SELF-001: subject/HR proposal projection; payroll gets a separate metadata-only queue.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, auditRead, insist, one, type Row } from '../core'
export const reviewsSelfChanges = (a: Actor) => can(a, 'people.manage') && can(a, 'people.private')
export const handlesSelfExceptions = (a: Actor) => reviewsSelfChanges(a) || (can(a, 'payroll.handoff') && can(a, 'pay.read'))
const SELECT = `SELECT c.*,d.outcome,d.decided_by,d.decided_at,d.comment,r.reference,r.recorded_by,r.recorded_at AS reconciled_at
 FROM wl_self_changes c LEFT JOIN wl_self_decisions d ON d.change_id=c.id LEFT JOIN wl_self_reconciliation r ON r.change_id=c.id`
const project = (r: Row) => ({ id: r.id, personId: r.person_id, kind: r.kind, before: JSON.parse(r.before_json), after: JSON.parse(r.after_json),
 requestedBy: r.requested_by, requestedAt: r.requested_at, dueDate: r.due_date, owner: 'HR', status: r.outcome ?? 'pending',
 decision: r.outcome ? { by: r.decided_by, at: r.decided_at, comment: r.comment } : null,
 reconciliation: r.outcome === 'approved' ? { status: r.reference ? 'resolved' : 'open', reference: r.reference, by: r.recorded_by, at: r.reconciled_at } : null })
export async function selfChanges(env: Bindings, actor: Actor) {
 const rows = await all(env, `${SELECT} ${can(actor,'people.private') ? '' : 'WHERE c.person_id=?'} ORDER BY c.requested_at DESC,c.id`, ...(can(actor,'people.private') ? [] : [actor.personId ?? '']))
 if (rows.some(r => r.person_id !== actor.personId)) await auditRead(env,actor.id,'selfChange.private.read','list')
 return rows.map(project)
}
export async function selfChange(env: Bindings, actor: Actor, id: string) {
 const row = await one(env,`${SELECT} WHERE c.id=?`,id)
 insist(row && (actor.personId === row.person_id || can(actor,'people.private')), 'not_found',404)
 if (actor.personId !== row.person_id) await auditRead(env,actor.id,'selfChange.private.read',id)
 return project(row)
}
export async function selfExceptions(env: Bindings, actor: Actor) {
 insist(handlesSelfExceptions(actor),'forbidden',403)
 return (await all(env,`${SELECT} WHERE d.outcome='approved' ORDER BY c.requested_at,c.id`)).map(r=>({id:r.id,personId:r.person_id,kind:r.kind,dueDate:r.due_date,
  status:r.reference?'resolved':'open',reference:r.reference,owner:'Payroll / HR',next:'Review the approved revision in the authorized system; record a handoff reference. No provider confirmation is implied.'}))
}
