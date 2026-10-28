// Explicit review modes correct an existing release; they never open raw input.
import type { Bindings } from '../../auth.server'
import { actorFor, can, type Actor } from '../actor'
import { commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { addDays } from '../dates'
import { Input } from '../input'
import { performanceMode, readsPerformanceField } from '../levels/performance'
import { performanceAuthority } from './authority'
import { currentManager, openGuard } from './store'

export const reviewCorrectionMode=(actor:Actor,person:string)=>can(actor,'people.manage')?'edit':performanceMode(actor,person,'reviews')
export function readsReviewProposal(actor:Actor,row:Row) {
 if(can(actor,'people.manage'))return true
 if(actor.id!==row.requested_by || !readsPerformanceField(actor,row.person_id,'reviews'))return false
 // Native delivered releases retain custody, including a later withholding.
 return JSON.parse(row.review_recipients??'[]').includes(actor.id) || !JSON.parse(row.review_withholdings??'[]').includes(actor.id)
}
async function prepareCorrection(env:Bindings,actor:Actor,input:Input,approved=false) {
 input.only(['returnTo','review','summary','rating'])
 const live=await performanceAuthority(env,actor,!approved);actor=live.actor
 const source=await one(env,'SELECT s.*,c.status FROM wl_review_summaries s JOIN wl_review_cycles c ON c.id=s.cycle_id WHERE s.id=?',input.text('review'))
 insist(source,'not_found',404)
 const mode=reviewCorrectionMode(actor,source.person_id)
 insist(mode==='edit'||mode==='approval','forbidden',403)
 if(!can(actor,'people.manage')) {
  const received=await one(env,'SELECT 1 FROM wl_review_recipients WHERE summary_id=? AND member_id=?',source.id,actor.id)
  const withheld=await one(env,'SELECT 1 FROM wl_review_withholdings WHERE summary_id=? AND manager=?',source.id,actor.id)
  insist(received||!withheld,'not_found',404)
 }
 insist(source.status==='open','cycle_locked',409)
 insist(!await one(env,'SELECT 1 FROM wl_erasure_requests WHERE person_id=? AND receipt_id IS NOT NULL',source.person_id),'not_found',404)
 const latest=await one(env,'SELECT MAX(version) AS version FROM wl_review_summaries WHERE cycle_id=? AND person_id=?',source.cycle_id,source.person_id)
 insist(latest?.version===source.version,'review_source_changed',409)
 const summary=input.text('summary',{max:10000}),rating=input.text('rating',{max:100})
 insist(summary!==source.summary||rating!==source.rating,'nothing_to_change')
 const id=newId(),version=source.version+1,at=now(),recipients=new Map<string,string>()
 const subject=await one(env,"SELECT id FROM wl_members WHERE person_id=? AND status='active'",source.person_id)
 if(subject)recipients.set(subject.id,'subject')
 const manager=await currentManager(env,source.person_id,actor.today)
 if(manager)recipients.set(manager.id,'manager')
 const guards=[...live.guards,openGuard(env,source.cycle_id),guard(env,'review_source_changed','(SELECT MAX(version) FROM wl_review_summaries WHERE cycle_id=? AND person_id=?)=?',source.cycle_id,source.person_id,source.version),guard(env,'review_person_erased','NOT EXISTS(SELECT 1 FROM wl_erasure_requests WHERE person_id=? AND receipt_id IS NOT NULL)',source.person_id)]
 const statements=[...guards,stmt(env,'INSERT INTO wl_review_summaries(id,cycle_id,person_id,version,summary,rating,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',id,source.cycle_id,source.person_id,version,summary,rating,actor.id,at),...Array.from(recipients,([member,kind])=>stmt(env,'INSERT INTO wl_review_recipients(summary_id,member_id,kind,created_at) VALUES(?,?,?,?)',id,member,kind,at))]
 return {id,version,source,mode,guards,statements,payload:{review:source.id,summary,rating},before:{summary:source.summary,rating:source.rating,version:source.version},requester:actor.id}
}
export async function correctReview(env:Bindings,actor:Actor,input:Input) {
 const prepared=await prepareCorrection(env,actor,input)
 if(prepared.mode==='approval') {
  const id=newId()
  await commit(env,[...prepared.guards,stmt(env,'INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,requested_by,requested_at,due_date) VALUES(?,?,?,?,?,?,?,?,?,?)',id,prepared.source.person_id,'review',prepared.source.id,JSON.stringify(prepared.before),JSON.stringify(prepared.payload),String(prepared.source.version),actor.id,now(),addDays(actor.today,7))],{actor:actor.id,action:'selfChange.request',subject:id,detail:{person:prepared.source.person_id,kind:'review'}})
  return {id,status:'pending',notice:'Review correction requested. Track it in Personal changes.'}
 }
 await commit(env,prepared.statements,{actor:actor.id,action:'performance.summary.correct',subject:prepared.id,detail:{person:prepared.source.person_id,source:prepared.source.id,version:prepared.version}})
 return {id:prepared.id,version:prepared.version}
}
export async function approveReviewStatements(env:Bindings,reviewer:Actor,row:Row) {
 const member=await one(env,'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=?',row.requested_by)
 insist(member,'review_requester_unavailable',403)
 const requester=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:''})
 const prepared=await prepareCorrection(env,requester,Input.of(JSON.parse(row.after_json)),true)
 insist(prepared.source.id===row.row_id&&prepared.source.person_id===row.person_id&&String(prepared.source.version)===row.source_revision,'review_source_changed',409)
 return [...prepared.statements,stmt(env,'INSERT INTO wl_audit(at,actor,action,subject,detail) VALUES(?,?,?,?,?)',now(),requester.id,'performance.summary.correct',prepared.id,JSON.stringify({person:row.person_id,source:row.row_id,approval:row.id,approvedBy:reviewer.id}))]
}
