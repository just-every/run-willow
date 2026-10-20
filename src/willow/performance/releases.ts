import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt } from '../core'
import type { Input } from '../input'
import { cycleRow, currentManager, mayReceive, openGuard, reconcileRecipients } from './store'
export async function calibrateReview(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 const id=newId(),cycle=input.text('cycle'),person=input.text('person'),note=input.text('note',{max:5000}),rating=input.text('rating',{max:100})
 insist((await cycleRow(env,cycle)).status==='open','cycle_locked',409)
 insist(await one(env,'SELECT 1 FROM wl_review_subjects WHERE cycle_id=? AND person_id=?',cycle,person),'not_found',404)
 await commit(env,[openGuard(env,cycle),stmt(env,'INSERT INTO wl_review_notes(id,cycle_id,person_id,author,note,rating,created_at) VALUES(?,?,?,?,?,?,?)',id,cycle,person,actor.id,note,rating,now())],{actor:actor.id,action:'performance.calibrate',subject:cycle,detail:{person}})
 return {id}
}
export async function releaseReview(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 await reconcileRecipients(env,actor.today)
 const id=newId(),cycle=input.text('cycle'),person=input.text('person'),summary=input.text('summary',{max:10000}),rating=input.text('rating',{max:100})
 insist((await cycleRow(env,cycle)).status==='open','cycle_locked',409)
 insist(await one(env,'SELECT 1 FROM wl_review_subjects WHERE cycle_id=? AND person_id=?',cycle,person),'not_found',404)
 const version=(await one(env,'SELECT COALESCE(MAX(version),0)+1 AS v FROM wl_review_summaries WHERE cycle_id=? AND person_id=?',cycle,person))!.v
 const at=now(),recipients=new Map<string,string>()
 const employee=await one(env,"SELECT id FROM wl_members WHERE person_id=? AND status='active'",person)
 if(employee)recipients.set(employee.id,'subject')
 const manager=await currentManager(env,person,actor.today)
 if(manager)recipients.set(manager.id,'manager')
 await commit(env,[openGuard(env,cycle),guard(env,'stale','(SELECT COALESCE(MAX(version),0)+1 FROM wl_review_summaries WHERE cycle_id=? AND person_id=?)=?',cycle,person,version),stmt(env,'INSERT INTO wl_review_summaries(id,cycle_id,person_id,version,summary,rating,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',id,cycle,person,version,summary,rating,actor.id,at),...Array.from(recipients,([member,kind])=>stmt(env,'INSERT INTO wl_review_recipients(summary_id,member_id,kind,created_at) VALUES(?,?,?,?)',id,member,kind,at))],{actor:actor.id,action:'performance.summary.release',subject:id,detail:{cycle,person,version,recipients:[...recipients.keys()]}})
 return {id,version}
}
export async function withholdReview(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 const summary=input.text('summary'),manager=input.text('manager'),reason=input.text('reason',{max:2000})
 insist(await one(env,'SELECT 1 FROM wl_review_summaries WHERE id=?',summary),'not_found',404)
 insist(await one(env,'SELECT 1 FROM wl_members WHERE id=?',manager),'member_not_found',404)
 insist(!await one(env,'SELECT 1 FROM wl_review_withholdings WHERE summary_id=? AND manager=?',summary,manager),'already_withheld',409)
 // Already delivered copies are retained. Withholding prevents a future succession transfer only.
 await commit(env,[stmt(env,'INSERT INTO wl_review_withholdings(summary_id,manager,reason,author,created_at) VALUES(?,?,?,?,?)',summary,manager,reason,actor.id,now())],{actor:actor.id,action:'performance.summary.withhold',subject:summary,detail:{manager,reason}})
 return {id:summary}
}
export async function acknowledgeReview(env:Bindings,actor:Actor,input:Input) {
 const summary=input.text('summary');await reconcileRecipients(env,actor.today)
 insist(await mayReceive(env,actor,summary),'not_found',404)
 await commit(env,[stmt(env,'INSERT OR IGNORE INTO wl_review_acknowledgments(summary_id,member_id,created_at) VALUES(?,?,?)',summary,actor.id,now())],{actor:actor.id,action:'performance.summary.acknowledge',subject:summary})
 return {id:summary}
}
export async function appealReview(env:Bindings,actor:Actor,input:Input) {
 const summary=input.text('summary'),reason=input.text('reason',{max:5000}),id=newId();await reconcileRecipients(env,actor.today)
 insist(await mayReceive(env,actor,summary),'not_found',404)
 await commit(env,[stmt(env,'INSERT INTO wl_review_appeals(id,summary_id,member_id,reason,created_at) VALUES(?,?,?,?,?)',id,summary,actor.id,reason,now())],{actor:actor.id,action:'performance.summary.appeal',subject:summary})
 return {id}
}
