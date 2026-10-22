// SELF-001: subject/HR proposal projection; payroll gets a separate metadata-only queue.
import { readsDocumentChange, reviewsDocumentChange } from '../document-write'
import { readsPersonalField } from '../levels/other-personal'
import { SELF_FIELDS, type SelfField } from '../levels/personal'
import type { Bindings } from '../../auth.server'
import { can, canAbout, hasScopedGrant, type Actor } from '../actor'
import { all, auditRead, insist, one, type Row } from '../core'
// Review and reconciliation are HR work about one person: employer-wide, or inside a scoped level's reach (ROLE-002).
export const reviewsSelfChanges = (a: Actor, personId: string) => canAbout(a, 'people.manage', personId) && canAbout(a, 'people.private', personId)
export const handlesSelfExceptions = (a: Actor, personId: string) => reviewsSelfChanges(a, personId) || (can(a, 'payroll.handoff') && can(a, 'pay.read'))
export const reviewsChange=(actor:Actor,row:Row)=>row.kind==='document'?reviewsDocumentChange(actor,row):reviewsSelfChanges(actor,row.person_id)
export const readsSelfChange=(actor: Actor,row: Row)=>row.kind==='document'?readsDocumentChange(actor,row):actor.personId===row.person_id || canAbout(actor,'people.private',row.person_id) || (row.kind==='personal' && row.requested_by===actor.id && (SELF_FIELDS as readonly string[]).includes(row.row_id) && readsPersonalField(actor,row.person_id,row.row_id as SelfField))
export const SELF_CHANGE_SELECT = `SELECT c.*,cat.id AS doc_category_id,cat.name AS doc_category_name,cat.subject_reads AS doc_subject_reads,cat.manager_reads AS doc_manager_reads,d.outcome,d.decided_by,d.decided_at,d.comment,r.reference,r.recorded_by,r.recorded_at AS reconciled_at
 FROM wl_self_changes c LEFT JOIN wl_self_decisions d ON d.change_id=c.id LEFT JOIN wl_self_reconciliation r ON r.change_id=c.id LEFT JOIN wl_doc_categories cat ON c.kind='document' AND cat.id=json_extract(c.after_json,'$.category')`
const project = (r: Row) => ({ id: r.id, personId: r.person_id, kind: r.kind, before: JSON.parse(r.before_json), after: JSON.parse(r.after_json),
 requestedBy: r.requested_by, requestedAt: r.requested_at, dueDate: r.due_date, owner: 'HR', status: r.outcome ?? 'pending',
 decision: r.outcome ? { by: r.decided_by, at: r.decided_at, comment: r.comment } : null,
 reconciliation: r.outcome === 'approved' ? { status: r.reference ? 'resolved' : 'open', reference: r.reference, by: r.recorded_by, at: r.reconciled_at } : null })
export async function selfChanges(env: Bindings, actor: Actor) {
 const rows = (await all(env, `${SELF_CHANGE_SELECT} ORDER BY c.requested_at DESC,c.id`)).filter(r => readsSelfChange(actor,r))
 if (rows.some(r => r.person_id !== actor.personId)) await auditRead(env,actor.id,'selfChange.private.read','list')
 return rows.map(project)
}
export async function selfChange(env: Bindings, actor: Actor, id: string) {
 const row = await one(env,`${SELF_CHANGE_SELECT} WHERE c.id=?`,id)
 insist(row && (readsSelfChange(actor,row)), 'not_found',404)
 if (actor.personId !== row.person_id) await auditRead(env,actor.id,'selfChange.private.read',id)
 return {...project(row),documentCategory:row.doc_category_name??null,mayDecide:reviewsChange(actor,row)&&actor.id!==row.requested_by&&actor.personId!==row.person_id}
}
export async function selfExceptions(env: Bindings, actor: Actor) {
 insist(can(actor, 'payroll.handoff') && can(actor, 'pay.read') || hasScopedGrant(actor, 'people.manage') || can(actor,'people.manage') || reviewsSelfChanges(actor, ''), 'forbidden', 403)
 return (await all(env,`${SELF_CHANGE_SELECT} WHERE d.outcome='approved' ORDER BY c.requested_at,c.id`)).filter(r => r.kind==='document'?reviewsDocumentChange(actor,r):handlesSelfExceptions(actor, r.person_id)).map(r=>({id:r.id,personId:r.person_id,kind:r.kind,dueDate:r.due_date,
  status:r.reference?'resolved':'open',reference:r.reference,owner:'Payroll / HR',next:'Review the approved revision in the authorized system; record a handoff reference. No provider confirmation is implied.'}))
}
