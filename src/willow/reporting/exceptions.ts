import { readsSelfChange } from '../self-service/view'
// Historical exception/work counts use recorded employer dates, then current reader facets.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { sees } from '../access'
import { all } from '../core'
import { today } from '../dates'
export async function datedExceptions(env:Bindings,actor:Actor,asOf:string,zone:string) {
 const open=new Map<string,{exceptions:number;overdue:number;tasks:{id:string;caseId:string;dueDate:string}[];sources:{kind:string;path:string;dueDate:string}[]}>()
 const entry=(person:string)=>{let value=open.get(person);if(!value){value={exceptions:0,overdue:0,tasks:[],sources:[]};open.set(person,value)}return value}
 const before=(at:number|null)=>at!==null&&today(zone,at)<=asOf
 for(const r of await all(env,'SELECT t.*,c.person_id,c.opened_at,c.completed_at AS case_completed_at FROM wl_case_tasks t JOIN wl_cases c ON c.id=t.case_id')) {
  if(!sees(actor,r.person_id,'lifecycle')||!before(r.opened_at)||(r.created_at&&!before(r.created_at))||before(r.superseded_at)||before(r.completed_at)||before(r.case_completed_at))continue
  const e=entry(r.person_id);e.tasks.push({id:r.id,caseId:r.case_id,dueDate:r.due_date});if(r.due_date<asOf)e.overdue++
 }
 for(const r of await all(env,`SELECT c.*,d.outcome,d.decided_at,x.recorded_at AS resolved_at FROM wl_self_changes c LEFT JOIN wl_self_decisions d ON d.change_id=c.id LEFT JOIN wl_self_reconciliation x ON x.change_id=c.id`)) {
  if(r.kind==='goal'||r.kind==='training') {
   if(readsSelfChange(actor,r)&&before(r.requested_at)&&!before(r.decided_at)){const e=entry(r.person_id);e.exceptions++;e.sources.push({kind:r.kind==='training'?'Training decision':'Goal decision',path:`/app/self-changes/${r.id}`,dueDate:r.due_date});if(r.due_date<asOf)e.overdue++}
   continue
  }
  if(!sees(actor,r.person_id,'private')||!before(r.requested_at))continue
  if(!before(r.decided_at)||(r.outcome==='approved'&&!before(r.resolved_at))){const e=entry(r.person_id);e.exceptions++;e.sources.push({kind:'Profile decision or handoff',path:`/app/self-changes/${r.id}`,dueDate:r.due_date});if(r.due_date<asOf)e.overdue++}
 }
 for(const r of await all(env,'SELECT * FROM wl_leave_requests')) {
  if(!sees(actor,r.person_id,'leave')||!before(r.requested_at)||before(r.decided_at))continue
  const e=entry(r.person_id);e.exceptions++;e.sources.push({kind:'Leave decision',path:`/app/leave/${r.id}`,dueDate:r.start_date});if(r.start_date<asOf)e.overdue++
 }
 // Payroll exception history is visible only to its separately authorized handoff readers.
 if(actor.owner||(actor.permissions.has('payroll.handoff')&&actor.permissions.has('pay.read'))) {
  const claims=await all(env,'SELECT i.source_kind,i.source_id,b.exported_at FROM wl_payroll_items i JOIN wl_payroll_batches b ON b.id=i.batch_id')
  const counted=new Set<string>()
  for(const b of await all(env,'SELECT id,created_at,exceptions,period_end FROM wl_payroll_batches')) {
   if(!before(b.created_at))continue
   for(const x of JSON.parse(b.exceptions) as {key:string;person:string}[]) {
    if(x.key.startsWith('self-change:')||counted.has(x.key)||claims.some(c=>`${c.source_kind}:${c.source_id}`===x.key&&before(c.exported_at)))continue
    counted.add(x.key);const e=entry(x.person);e.exceptions++;e.sources.push({kind:'Payroll exception',path:`/app/payroll/${b.id}`,dueDate:b.period_end});if(b.period_end<asOf)e.overdue++
   }
  }
 }
 return open
}
