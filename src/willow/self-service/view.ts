import { readsTable, writesTable, type RecordTable } from '../record-tables/schema'
import { readsReviewProposal } from '../performance/corrections'
import { readsGoal } from '../performance/goals'
// SELF-001 proposals remain exact projections; selection adds decisions, never field access.
import { readsDocumentChange, reviewsDocumentChange, nativeReviewsDocumentChange } from '../document-write'
import { readsPersonalField } from '../levels/other-personal'
import { SELF_FIELDS, type SelfField } from '../levels/personal'
import { hasApproval, selectedApprovalMembers, type ApprovalKey } from '../levels/approvals'
import { readsCustomField } from '../custom-fields/read'
import { writesCustomField } from '../custom-fields/store'
import type { Bindings } from '../../auth.server'
import { actorFor, can, canAbout, hasScopedGrant, type Actor } from '../actor'
import { all, auditRead, insist, one, type Row } from '../core'

export const reviewsSelfChanges = (a: Actor, personId: string) => canAbout(a, 'people.manage', personId) && canAbout(a, 'people.private', personId)
export const handlesSelfExceptions = (a: Actor, personId: string) => reviewsSelfChanges(a, personId) || (can(a, 'payroll.handoff') && can(a, 'pay.read'))
export const selfApprovalKey = (row: Row): ApprovalKey => row.kind==='document' ? `document:${row.doc_category_id??JSON.parse(row.after_json).category}` : row.kind==='customField' ? `custom:${row.row_id}` : row.kind==='legalName'||row.kind==='personal'&&row.row_id==='legalName' ? 'self:legalName' : `self:${row.kind}` as ApprovalKey

function recordPolicy(row:Row):RecordTable|null {
 return row.record_table_id ? {id:row.record_table_id,key:row.record_key,classification:row.record_classification,builtIn:!!row.record_built_in,versions:[],current:{id:row.record_version,version:row.record_version_number,label:row.record_label,employeeRead:!!row.record_employee_read,managerRead:!!row.record_manager_read,retired:!!row.record_retired,columns:[],recordedAt:0,recordedBy:''}} : null
}
function customPolicy(actor: Actor, row: Row) {
 if(!row.custom_classification || !row.custom_versions_json) return null
 const versions=JSON.parse(row.custom_versions_json) as Row[]
 const current=versions.filter(v=>v.effectiveFrom<=actor.today).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.version-a.version)[0]
 return current ? {classification:row.custom_classification,employeeRead:!!current.employeeRead,managerRead:!!current.managerRead,retired:!!current.retired} : null
}
export function readsProposalField(actor: Actor,row: Row) {
 if(row.kind==='recordRow') {const table=recordPolicy(row);return !!table&&readsTable(actor,row.person_id,table)}
 if(row.kind==='document') return readsDocumentChange(actor,row)
 if(row.kind==='review') return readsReviewProposal(actor,row)
 if(row.kind==='goal') return readsGoal(actor,row.person_id)
 if(row.kind==='customField') {const policy=customPolicy(actor,row);return !!policy && readsCustomField(actor,row.person_id,policy)}
 if(row.kind==='dependent') return actor.personId===row.person_id || canAbout(actor,'people.private',row.person_id)
 const field=row.kind==='legalName'?'legalName':row.row_id
 return (SELF_FIELDS as readonly string[]).includes(field) && readsPersonalField(actor,row.person_id,field as SelfField)
}
export function reviewsChange(actor:Actor,row:Row):boolean {
 if(actor.id===row.requested_by || actor.personId===row.person_id) return false
 if(row.kind==='recordRow') {const table=recordPolicy(row);return !!table&&readsTable(actor,row.person_id,table)&&writesTable(actor,row.person_id,table)}
 if(row.kind==='document') return reviewsDocumentChange(actor,row)
 if(row.kind==='review') return can(actor,'people.manage')
 if(!readsProposalField(actor,row)) return false
 const policy=row.kind==='customField'?customPolicy(actor,row):null
 const native=row.kind==='goal' ? canAbout(actor,'people.manage',row.person_id) : row.kind==='customField' ? !!policy&&writesCustomField(actor,policy) : reviewsSelfChanges(actor,row.person_id)
 return native || hasApproval(actor,selfApprovalKey(row),row.person_id)
}
export function readsSelfChange(actor:Actor,row:Row):boolean {
 if(row.kind==='document') return readsDocumentChange(actor,row)
 if(row.kind==='review') return readsReviewProposal(actor,row)
 if(!readsProposalField(actor,row)) return false
 if(row.kind==='goal') return actor.personId===row.person_id||actor.id===row.requested_by||reviewsChange(actor,row)
 if(row.kind==='customField'||row.kind==='recordRow') return actor.personId===row.person_id || actor.id===row.requested_by || reviewsChange(actor,row)
 return actor.personId===row.person_id || canAbout(actor,'people.private',row.person_id) || (row.kind==='personal'&&row.requested_by===actor.id) || hasApproval(actor,selfApprovalKey(row),row.person_id)
}
export const SELF_CHANGE_SELECT = `SELECT c.*,cat.id AS doc_category_id,cat.name AS doc_category_name,cat.subject_reads AS doc_subject_reads,cat.manager_reads AS doc_manager_reads,
 cf.classification AS custom_classification,cf.key AS custom_key,
 rt.id AS record_table_id,rt.key AS record_key,rt.classification AS record_classification,rt.built_in AS record_built_in,rtv.id AS record_version,rtv.version AS record_version_number,rtv.label AS record_label,rtv.employee_read AS record_employee_read,rtv.manager_read AS record_manager_read,rtv.retired AS record_retired,
 (SELECT json_group_array(json_object('id',v.id,'effectiveFrom',v.effective_from,'version',v.version,'employeeRead',v.employee_read,'managerRead',v.manager_read,'retired',v.retired)) FROM wl_custom_field_versions v WHERE v.field_id=cf.id) AS custom_versions_json,
 (SELECT json_group_array(member_id) FROM wl_review_recipients WHERE summary_id=c.row_id AND c.kind='review') AS review_recipients,
 (SELECT json_group_array(manager) FROM wl_review_withholdings WHERE summary_id=c.row_id AND c.kind='review') AS review_withholdings,
 d.outcome,d.decided_by,d.decided_at,d.comment,r.reference,r.recorded_by,r.recorded_at AS reconciled_at
 FROM wl_self_changes c LEFT JOIN wl_self_decisions d ON d.change_id=c.id LEFT JOIN wl_self_reconciliation r ON r.change_id=c.id LEFT JOIN wl_doc_categories cat ON c.kind='document' AND cat.id=json_extract(c.after_json,'$.category') LEFT JOIN wl_custom_fields cf ON c.kind='customField' AND cf.id=c.row_id LEFT JOIN wl_record_tables rt ON c.kind='recordRow' AND rt.id=json_extract(c.after_json,'$.table') LEFT JOIN wl_record_table_versions rtv ON rtv.table_id=rt.id AND rtv.version=(SELECT MAX(latest.version) FROM wl_record_table_versions latest WHERE latest.table_id=rt.id)`

/** Raw pending rows from impact previews use the same current schema as ordinary reads/decisions. */
export async function canDecideSelfChange(env:Bindings,actor:Actor,row:Row) {
 const current=(row.kind==='recordRow'&&!row.record_table_id || row.kind==='customField'&&!row.custom_versions_json || row.kind==='document'&&!row.doc_category_id) ? await one(env,`${SELF_CHANGE_SELECT} WHERE c.id=?`,row.id) : row
 return !!current&&reviewsChange(actor,current)
}
export async function currentSelfApprovalDeciders(env:Bindings,row:Row):Promise<Actor[]> {
 const current=await one(env,`${SELF_CHANGE_SELECT} WHERE c.id=?`,row.id)
 if(!current)return []
 const selected=await selectedApprovalMembers(env,selfApprovalKey(current),current.person_id)
 const members=await all(env,"SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.status='active' AND o.status='active'")
 const native=await Promise.all(members.map(m=>actorFor(env,{id:m.id,email:m.email,name:m.name,personId:m.person_id,owner:m.role==='owner',sessionId:''})))
 return [...new Map([...native,...selected].filter(actor=>reviewsChange(actor,current)).map(actor=>[actor.id,actor])).values()]
}
const project=(actor:Actor,r:Row)=>({id:r.id,personId:r.person_id,kind:r.kind,before:JSON.parse(r.before_json),after:JSON.parse(r.after_json),requestedBy:r.requested_by,requestedAt:r.requested_at,dueDate:r.due_date,owner:'Approver',status:r.outcome??'pending',
 decision:r.outcome?{by:r.decided_by,at:r.decided_at,comment:r.comment}:null,
 reconciliation:!['goal','review'].includes(r.kind)&&r.outcome==='approved'&&(actor.personId===r.person_id||actor.id===r.requested_by||(r.kind==='document'?nativeReviewsDocumentChange(actor,r):handlesSelfExceptions(actor,r.person_id)))?{status:r.reference?'resolved':'open',reference:r.reference,by:r.recorded_by,at:r.reconciled_at}:null})
export async function selfChanges(env:Bindings,actor:Actor) {
 const rows=(await all(env,`${SELF_CHANGE_SELECT} ORDER BY c.requested_at DESC,c.id`)).filter(row=>readsSelfChange(actor,row))
 if(rows.some(row=>row.person_id!==actor.personId))await auditRead(env,actor.id,'selfChange.private.read','list')
 return rows.map(row=>project(actor,row))
}
export async function selfChange(env:Bindings,actor:Actor,id:string) {
 const row=await one(env,`${SELF_CHANGE_SELECT} WHERE c.id=?`,id)
 insist(row&&readsSelfChange(actor,row),'not_found',404)
 if(actor.personId!==row.person_id)await auditRead(env,actor.id,'selfChange.private.read',id)
 return {...project(actor,row),documentCategory:row.doc_category_name??null,mayDecide:reviewsChange(actor,row)}
}
export async function selfExceptions(env:Bindings,actor:Actor) {
 insist(can(actor,'payroll.handoff')&&can(actor,'pay.read')||hasScopedGrant(actor,'people.manage')||can(actor,'people.manage')||reviewsSelfChanges(actor,''),'forbidden',403)
 return (await all(env,`${SELF_CHANGE_SELECT} WHERE d.outcome='approved' ORDER BY c.requested_at,c.id`)).filter(r=>!['goal','review'].includes(r.kind)&&(r.kind==='document'?nativeReviewsDocumentChange(actor,r):handlesSelfExceptions(actor,r.person_id))).map(r=>({id:r.id,personId:r.person_id,kind:r.kind,dueDate:r.due_date,status:r.reference?'resolved':'open',reference:r.reference,owner:'Payroll / HR',next:'Review the approved revision in the authorized system; record a handoff reference. No provider confirmation is implied.'}))
}
