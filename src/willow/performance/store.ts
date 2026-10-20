import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, commit, guard, insist, one, stmt } from '../core'
import { CURRENT_TERMS } from '../employment'
export const hr = (actor:Actor) => can(actor,'people.manage')
export interface ReviewCycle { id:string; name:string; due_date:string; status:string; questions:string; created_at:number }
export async function cycleRow(env:Bindings,id:string) {
 const row=await one<ReviewCycle>(env,'SELECT * FROM wl_review_cycles WHERE id=?',id)
 insist(row,'not_found',404);return row
}
export const openGuard=(env:Bindings,id:string)=>guard(env,'stale',"EXISTS(SELECT 1 FROM wl_review_cycles WHERE id=? AND status='open')",id)
export async function currentManager(env:Bindings,person:string,date:string) {
 return await one(env,`SELECT m.id FROM (${CURRENT_TERMS}) t JOIN wl_members m ON m.person_id=t.manager_person_id JOIN oa_operators o ON lower(o.email)=m.email WHERE t.person_id=?2 AND m.status='active' AND o.status='active'`,date,person)
}
/** Reconcile dated succession before every performance read/write. Historical recipients never disappear. */
export async function reconcileRecipients(env:Bindings,date:string) {
 const summaries=await all(env,'SELECT id,person_id FROM wl_review_summaries ORDER BY created_at,id')
 for(const summary of summaries) {
  const manager=await currentManager(env,summary.person_id,date)
  if(!manager)continue
  if(await one(env,'SELECT 1 FROM wl_review_recipients WHERE summary_id=? AND member_id=?',summary.id,manager.id))continue
  if(await one(env,'SELECT 1 FROM wl_review_withholdings WHERE summary_id=? AND manager=?',summary.id,manager.id))continue
  await commit(env,[stmt(env,`INSERT OR IGNORE INTO wl_review_recipients(summary_id,member_id,kind,created_at) SELECT ?,?,'succession',? WHERE NOT EXISTS(SELECT 1 FROM wl_review_withholdings WHERE summary_id=? AND manager=?)`,summary.id,manager.id,Date.now(),summary.id,manager.id)],{actor:'system',action:'performance.summary.transfer',subject:summary.id,detail:{recipient:manager.id}})
 }
}
export async function mayReceive(env:Bindings,actor:Actor,summary:string) {
 return !!await one(env,'SELECT 1 FROM wl_review_recipients WHERE summary_id=? AND member_id=?',summary,actor.id)
}
