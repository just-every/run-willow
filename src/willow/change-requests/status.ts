import { readsCompensation } from '../levels/compensation'
import { readsJobField, type JobField } from '../levels/job'
// ROLE-001: one deliberately small projection shared by detail and list doors.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { sees } from '../access'
import { json, one, type Row } from '../core'
import { formatPay } from '../money'
import { displayName } from '../people'
import { ROLE_LABELS, type ResolvedStep } from './chain'
import type { Base, Plan } from './requests'
export const LABELS: Record<string, [string, string]> = { jobTitle: ['Job title', ''], departmentId: ['Department', 'wl_departments'], locationId: ['Location', 'wl_locations'], managerPersonId: ['Manager', 'people'], scheduleId: ['Working schedule', 'wl_schedules'] }
export const COLUMNS: Record<string, string> = { jobTitle: 'job_title', departmentId: 'department_id', locationId: 'location_id', managerPersonId: 'manager_person_id', scheduleId: 'schedule_id' }

async function labelValue(env:Bindings,table:string,id:string|null) {
 if(!id) return null
 if(!table) return id
 if(table==='people') {
  const p=await one(env,'SELECT legal_name,preferred_name FROM wl_people WHERE id=?',id)
  return p ? displayName(p) : id
 }
 return (await one(env,`SELECT name FROM ${table} WHERE id=?`,id))?.name ?? id
}
export async function ownChangeStatus(env:Bindings,actor:Actor,row:Row) {
 const plan=json<Plan>(row.plan_json,{} as Plan),base=json<Base>(row.base_json,{} as Base),steps=json<ResolvedStep[]>(row.steps_json,[])
 const terms=(await one(env,'SELECT * FROM wl_terms WHERE id=?',base.termId))!
 const changes: {field:string;from?:string|null;to:string|null}[]=[]
 for(const [key,value] of Object.entries(plan.fields)) {
  if((terms[COLUMNS[key]]??null)===(value??null)) continue
  const readable=readsJobField(actor,row.person_id,key as JobField)
  changes.push({field:LABELS[key][0],to:readable?await labelValue(env,LABELS[key][1],value??null):'Withheld'})
 }
 if(plan.employmentType) changes.push({field:'Employment type',to:sees(actor,row.person_id,'employment')?plan.employmentType.replace('_',' '):'Withheld'})
 if(plan.fte!==undefined) changes.push({field:'FTE',to:readsJobField(actor,row.person_id,'fte')?String(plan.fte??'Unknown'):'Withheld'})
 for(const [key,value] of Object.entries(plan.dates??{})) changes.push({field:key==='startDate'?'Employment start date':'Employment end date',to:readsJobField(actor,row.person_id,key as JobField)?value??'Ongoing':'Withheld'})
 if(plan.employmentStatus) changes.push({field:'Employment status',to:readsJobField(actor,row.person_id,'employmentStatus')?plan.employmentStatus:'Withheld'})
 if(plan.compensationRecord) {const award=plan.compensationRecord;changes.push({field:award.kind==='bonus'?'Bonus':'Equity',to:readsCompensation(actor,row.person_id,award.kind)?award.kind==='bonus'?`${award.currency} ${award.amount}`:`${award.units} ${award.security}`:'Withheld'})}
  if(plan.compensationDefinition){const definition=plan.compensationDefinition;changes.push({field:definition.kind==='bands'?'Compensation band':'Compensation cycle',to:readsCompensation(actor,row.person_id,definition.kind)?Object.values(definition.values).join(' · '):'Withheld'})}
 // Self-profile pay access does not imply the level's future self-compensation View right.
 if(plan.pay) changes.push(readsCompensation(actor,row.person_id,plan.payField??'pay')
  ? {field:'Pay',from:formatPay(base.payBasis as never,base.payCents,base.currency),to:formatPay(base.newPayBasis as never,base.newPayCents,base.currency)}
  : {field:'Pay',from:'Withheld',to:'Withheld'})
 return {statusOnly:true as const,id:row.id,type:row.request_type,status:row.status,effectiveFrom:plan.effectiveFrom,submittedAt:row.requested_at,updatedAt:row.updated_at,
  progress:{step:row.status==='approved'?steps.length:Math.min(row.step+1,steps.length),total:steps.length,waitingOn:row.status==='pending'?ROLE_LABELS[steps[row.step].role]:row.status==='returned'?'Requester':null},changes}
}
