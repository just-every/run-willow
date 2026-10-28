import type { Bindings } from '../auth.server'
import { actorFor, can, type Actor } from './actor'
import { all, auditRead, commit, guard, insist, newId, now, one } from './core'
import { selfChanges } from './self-service/view'
import { addDays, requireDate } from './dates'
import { Input } from './input'
import { performanceMode, type PerformanceField, type PerformanceMode } from './levels/performance'
import { performanceAuthority } from './performance/authority'

const fields = ['trainingAssignments','trainingCompletions','trainingCertifications'] as const
const mode = (actor:Actor, person:string, field:PerformanceField):PerformanceMode => can(actor,'people.manage') ? 'edit' : performanceMode(actor,person,field)
const reads = (actor:Actor, person:string, field:PerformanceField) => mode(actor,person,field)!=='none'
const writes = (value:PerformanceMode) => value==='approval'||value==='edit'
type Operation = 'assign'|'complete'|'waive'

export async function trainingHome(env:Bindings, actor:Actor) {
 const people = (await all(env,'SELECT id,COALESCE(NULLIF(preferred_name,\'\'),legal_name) AS name FROM wl_people ORDER BY name')).filter(p=>fields.some(field=>reads(actor,p.id,field)))
 const courses = people.length || can(actor,'people.manage') ? await all(env,'SELECT id,title,self_completion FROM wl_training_courses ORDER BY title,id') : []
 const rows = await all(env,`SELECT a.*,c.title,c.self_completion,p.legal_name AS person_name,e.outcome,e.evidence,e.certificate,e.created_at AS completed_at,e.created_by AS completed_by
  FROM wl_training_assignments a JOIN wl_training_courses c ON c.id=a.course_id JOIN wl_people p ON p.id=a.person_id
  LEFT JOIN wl_training_events e ON e.assignment_id=a.id ORDER BY a.due_date,a.id`)
 const assignments = rows.filter(row=>reads(actor,row.person_id,'trainingAssignments') || reads(actor,row.person_id,'trainingCompletions')&&(!!row.outcome||writes(mode(actor,row.person_id,'trainingCompletions'))) || reads(actor,row.person_id,'trainingCertifications')&&!!row.certificate).map(row=>({
  id:row.id,person:row.person_id,personName:row.person_name,course:row.course_id,title:row.title,
  assignment:reads(actor,row.person_id,'trainingAssignments') ? {dueDate:row.due_date,createdAt:row.created_at} : null,
  completion:reads(actor,row.person_id,'trainingCompletions') && row.outcome ? {outcome:row.outcome,evidence:row.evidence,recordedAt:row.completed_at,recordedBy:row.completed_by} : null,
  certification:reads(actor,row.person_id,'trainingCertifications') && row.certificate ? {evidence:row.certificate,recordedAt:row.completed_at} : null,
  mayComplete:!row.outcome && writes(mode(actor,row.person_id,'trainingCompletions')) && (actor.personId!==row.person_id || !!row.self_completion),
  mayWaive:!row.outcome && actor.personId!==row.person_id && writes(mode(actor,row.person_id,'trainingAssignments')),
  mayCertify:actor.personId!==row.person_id&&writes(mode(actor,row.person_id,'trainingCertifications')),
  completionRequiresApproval:mode(actor,row.person_id,'trainingCompletions')==='approval',
  certificateRequiresApproval:mode(actor,row.person_id,'trainingCertifications')==='approval',
  waiverRequiresApproval:mode(actor,row.person_id,'trainingAssignments')==='approval',
 }))
 const requests=(await selfChanges(env,actor)).filter(row=>row.kind==='training').map(row=>{
  const {operation,payload}=row.after
  return {id:row.id,assignment:payload.assignment??row.after.target,person:row.personId,personName:people.find(p=>p.id===row.personId)?.name??'Person unavailable',courseTitle:courses.find(c=>c.id===(operation==='assign'?payload.course:rows.find(a=>a.id===payload.assignment)?.course_id))?.title??'Course unavailable',
   operation,payload,status:row.status,reason:row.decision?.comment,mayDecide:row.status==='pending'&&can(actor,'people.manage')&&row.requestedBy!==actor.id&&row.personId!==actor.personId}
 })
 await auditRead(env,actor.id,'training.read','training')
 return {connection:{provider:'TalentLMS',connected:false,state:'Not connected'},courses,people:people.map(p=>({id:String(p.id),name:String(p.name),mayAssign:p.id!==actor.personId&&writes(mode(actor,p.id,'trainingAssignments'))})),assignments,requests,mayManage:can(actor,'people.manage')}
}

export async function createCourse(env:Bindings, actor:Actor, input:Input) {
 const live=await performanceAuthority(env,actor,true)
 insist(can(live.actor,'people.manage'),'forbidden',403)
 input.only(['returnTo','title','selfCompletion'])
 const id=newId(),title=input.text('title',{max:300}),self=input.flag('selfCompletion')
 await commit(env,[...live.guards,stmtCourse(env,id,title,self,actor.id)],{actor:actor.id,action:'training.course',subject:id})
 return {id}
}
const stmtCourse=(env:Bindings,id:string,title:string,self:boolean,actor:string)=>env.DB.prepare('INSERT INTO wl_training_courses VALUES(?,?,?,?,?)').bind(id,title,self?1:0,actor,now())

async function prepare(env:Bindings, actor:Actor, input:Input, operation:Operation, target=newId(), requireSession=true) {
 const live=await performanceAuthority(env,actor,requireSession);actor=live.actor
 input.only(operation==='assign'?['returnTo','person','course','dueDate']:['returnTo','assignment','evidence','certificate'])
 let person:string, course:Record<string,any>,payload:Record<string,unknown>,source:string,assignment:string,before:Record<string,unknown>|null=null
 if(operation==='assign') {
  person=input.text('person');assignment=target
  insist(await one(env,'SELECT id FROM wl_people WHERE id=?',person),'not_found',404)
  course=(await one(env,'SELECT * FROM wl_training_courses WHERE id=?',input.text('course')))!
  insist(course,'course_not_found',404)
  payload={person,course:course.id,dueDate:requireDate(input.text('dueDate'),'invalid_dueDate')}
  source='new'
 } else {
  assignment=input.text('assignment')
  const row=await one(env,'SELECT * FROM wl_training_assignments WHERE id=?',assignment)
  insist(row,'not_found',404);person=row.person_id
  course=(await one(env,'SELECT * FROM wl_training_courses WHERE id=?',row.course_id))!
  payload={assignment,evidence:input.text('evidence',{max:4000}),certificate:input.text('certificate',{max:2000,optional:true})}
  source=row.id
  before={assignment:row.id,course:row.course_id,dueDate:row.due_date}
 }
 const field=operation==='complete'?'trainingCompletions':'trainingAssignments'
 const primary=mode(actor,person,field)
 insist(writes(primary),'forbidden',403)
 // Self rights permit completion only, never assignment or waiver; the immutable course must explicitly allow it.
 insist(actor.personId!==person || operation==='complete'&&!!course.self_completion,'self_completion_not_allowed',403)
 const certificate=String(payload.certificate??'')
 const certMode=mode(actor,person,'trainingCertifications')
 if(certificate)insist(operation==='complete'&&actor.personId!==person&&writes(certMode),'certification_forbidden',403)
 insist(!await one(env,'SELECT 1 FROM wl_erasure_requests WHERE person_id=? AND receipt_id IS NOT NULL',person),'not_found',404)
 const guards=[...live.guards,guard(env,'training_person_erased','NOT EXISTS(SELECT 1 FROM wl_erasure_requests WHERE person_id=? AND receipt_id IS NOT NULL)',person)]
 if(operation==='assign')guards.push(guard(env,'training_source_changed','NOT EXISTS(SELECT 1 FROM wl_training_assignments WHERE id=?)',assignment))
 else {
  insist(!await one(env,'SELECT 1 FROM wl_training_events WHERE assignment_id=?',assignment),'training_already_closed',409)
  guards.push(guard(env,'training_source_changed','EXISTS(SELECT 1 FROM wl_training_assignments WHERE id=?) AND NOT EXISTS(SELECT 1 FROM wl_training_events WHERE assignment_id=?)',assignment,assignment))
 }
 const statement=operation==='assign'
  ? env.DB.prepare('INSERT INTO wl_training_assignments VALUES(?,?,?,?,?,?)').bind(assignment,person,course.id,payload.dueDate,actor.id,now())
  : env.DB.prepare('INSERT INTO wl_training_events VALUES(?,?,?,?,?,?)').bind(assignment,operation==='complete'?'completed':'waived',payload.evidence,certificate,actor.id,now())
 return {actor,person,assignment,payload,before,source,guards,statement,approval:primary==='approval'||!!certificate&&certMode==='approval'}
}
async function mutate(env:Bindings,actor:Actor,input:Input,operation:Operation) {
 const p=await prepare(env,actor,input,operation),id=newId()
 if(p.approval) {
  await commit(env,[...p.guards,env.DB.prepare('INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,requested_by,requested_at,due_date) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,p.person,'training',p.assignment,JSON.stringify(p.before),JSON.stringify({operation,payload:p.payload,target:p.assignment}),p.source,actor.id,now(),addDays(actor.today,7))],{actor:actor.id,action:'selfChange.request',subject:id,detail:{operation,person:p.person,kind:'training'}})
  return {id,assignment:p.assignment,status:'pending'}
 }
 await commit(env,[...p.guards,p.statement],{actor:actor.id,action:'training.'+operation,subject:p.assignment,detail:{person:p.person}})
 return {id:p.assignment,status:'applied'}
}
export const assignTraining=(env:Bindings,actor:Actor,input:Input)=>mutate(env,actor,input,'assign')
export const completeTraining=(env:Bindings,actor:Actor,input:Input)=>mutate(env,actor,input,'complete')
export const waiveTraining=(env:Bindings,actor:Actor,input:Input)=>mutate(env,actor,input,'waive')
export function readsTrainingProposal(actor:Actor,row:Record<string,any>) {
 const after=JSON.parse(row.after_json),field=after.operation==='complete'?'trainingCompletions':'trainingAssignments'
 return (actor.id===row.requested_by||can(actor,'people.manage'))&&reads(actor,row.person_id,field)&&(!after.payload.certificate||reads(actor,row.person_id,'trainingCertifications'))
}

export async function approveTrainingStatements(env:Bindings,reviewer:Actor,row:Record<string,any>) {
 insist(can(reviewer,'people.manage'),'forbidden',403)
 const after=JSON.parse(row.after_json)
 insist(['assign','complete','waive'].includes(after.operation),'invalid_training_proposal')
 const member=await one(env,'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?',row.requested_by)
 insist(member,'requester_unavailable',403)
 const requester=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:''})
 const prepared=await prepare(env,requester,Input.of(after.payload),after.operation,row.row_id,false)
 insist(prepared.person===row.person_id&&prepared.assignment===row.row_id&&prepared.source===row.source_revision,'training_source_changed',409)
 return [...prepared.guards,prepared.statement]
}

/** Compatibility door consumes the same SELF-001 decision, never a parallel queue. */
export async function decideTraining(env:Bindings,actor:Actor,input:Input) {
 input.only(['returnTo','request','decision','reason'])
 const id=input.text('request')
 insist(await one(env,"SELECT 1 FROM wl_self_changes WHERE id=? AND kind='training'",id),'not_found',404)
 const {decideSelfChange}=await import('./self-service/requests')
 return decideSelfChange(env,actor,Input.of({change:id,decision:input.text('decision'),comment:input.text('reason',{max:1000})}))
}

/** Required work reuses native schedules and fixed notices, without training evidence in the projection. */
export async function trainingWork(env:Bindings):Promise<import('./work-sources').WorkSource[]> {
 const result:import('./work-sources').WorkSource[]=[]
 for(const row of await all(env,`SELECT a.*,c.self_completion,m.id AS member FROM wl_training_assignments a
  JOIN wl_training_courses c ON c.id=a.course_id LEFT JOIN wl_members m ON m.person_id=a.person_id AND m.status='active'
  WHERE NOT EXISTS(SELECT 1 FROM wl_training_events e WHERE e.assignment_id=a.id)`)) {
  const visible=(actor:Actor)=>can(actor,'people.manage')||actor.personId===row.person_id&&reads(actor,row.person_id,'trainingAssignments')
  result.push({key:`training:${row.id}`,kind:'training',title:'Complete assigned training',path:'/app/training',due:row.due_date,preferred:row.member,
   next:'Complete the course and record permitted evidence or contact HR',progress:'Completion pending',personId:row.person_id,
   visible,responsible:visible})
 }
 return result
}
