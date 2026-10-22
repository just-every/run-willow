import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all } from '../core'
import { JOB_FIELDS, JOB_LABELS, canEditJobField, jobMode, type JobField } from '../levels/job'
import { EMPLOYMENT_TYPES } from '../people'
import { field, form, h, hidden, select } from './html'

export async function jobFieldPanel(env:Bindings,actor:Actor,person:string,view:Record<string,any>,dated:boolean) {
 if(dated||actor.personId===person) return h``
 const permitted=JOB_FIELDS.filter(key=>['edit','approval'].includes(jobMode(actor,person,key)))
 if(!permitted.length) return h``
 const period=view.employment?.find((p:any)=>p.id===view.selectedPeriod)
 if(!period) return h``
 const [departments,locations,schedules,people]=await Promise.all([all(env,'SELECT id,name FROM wl_departments ORDER BY name'),all(env,'SELECT id,name FROM wl_locations ORDER BY name'),all(env,'SELECT id,name FROM wl_schedules ORDER BY name'),all(env,'SELECT id,COALESCE(preferred_name,legal_name) AS name FROM wl_people ORDER BY legal_name')])
 const choices:Partial<Record<JobField,{value:string;label:string}[]>>=Object.fromEntries(Object.entries({departmentId:departments,locationId:locations,scheduleId:schedules,managerPersonId:people}).map(([key,rows])=>[key,rows.map(row=>({value:row.id,label:row.name}))]))
 choices.employmentStatus=['active','upcoming','former'].map(value=>({value,label:value}))
 choices.employmentType=EMPLOYMENT_TYPES.map(value=>({value,label:value.replace('_',' ')}))
 return h`<section class="card"><h2>Change permitted job fields</h2><p>Each change affects one granted field. Requests follow the configured job approval chain and leave the record unchanged until approved.</p>${permitted.map(key=>{
  const immediate=canEditJobField(actor,person,key),name=immediate?'value':key
  const input=choices[key]?select(JOB_LABELS[key],name,choices[key]!, '',{required:true}):field(JOB_LABELS[key],name,{type:key==='startDate'||key==='endDate'?'date':'text',required:key!=='endDate',hint:key==='fte'?'A fraction between 0 and 1.':undefined})
  return h`<details><summary>${JOB_LABELS[key]}${immediate?'':' · approval required'}</summary>${form(immediate?'job.field':'change.request',immediate?`/app/people/${person}`:'/app/changes/{id}',[hidden('person',person),...(immediate?[hidden('period',period.id),hidden('revision',period.revision),hidden('field',key)]:[]),input,field('Effective from','effectiveFrom',{type:'date',value:actor.today}),field('Reason','reason')],immediate?`Save ${JOB_LABELS[key].toLowerCase()}`:`Request ${JOB_LABELS[key].toLowerCase()} change`)}</details>`
 })}</section>`
}
