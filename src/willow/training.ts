import type { Bindings } from '../auth.server'
import { actorFor, can, type Actor } from './actor'
import { all, auditRead, commit, guard, insist, newId, now, one } from './core'
import { requireDate } from './dates'
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
 const pending = await all(env,`SELECT r.*,d.outcome AS decision,d.reason FROM wl_training_requests r LEFT JOIN wl_training_decisions d ON d.request_id=r.id ORDER BY r.requested_at,r.id`)
 const requests=[]
 for(const row of pending) {
  if(row.requested_by!==actor.id && !can(actor,'people.manage'))continue
  const payload=JSON.parse(row.payload_json)
  const field=row.operation==='complete'?'trainingCompletions':'trainingAssignments'
  if(!reads(actor,row.person_id,field)||payload.certificate&&!reads(actor,row.person_id,'trainingCertifications'))continue
  requests.push({id:row.id,assignment:row.target_id,person:row.person_id,personName:people.find(person=>person.id===row.person_id)?.name??'Person unavailable',courseTitle:courses.find(course=>course.id===(row.operation==='assign'?payload.course:rows.find(assignment=>assignment.id===row.target_id)?.course_id))?.title??'Course unavailable',operation:row.operation,payload:JSON.parse(row.payload_json),status:row.decision??'pending',reason:row.reason,mayDecide:!row.decision&&can(actor,'people.manage')&&row.requested_by!==actor.id&&row.person_id!==actor.personId})
 }
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
 let person:string, course:Record<string,any>,payload:Record<string,unknown>,source:string,assignment:string
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
 return {actor,person,assignment,payload,source,guards,statement,approval:primary==='approval'||!!certificate&&certMode==='approval'}
}
async function mutate(env:Bindings,actor:Actor,input:Input,operation:Operation) {
 const p=await prepare(env,actor,input,operation),id=newId()
 if(p.approval) {
  await commit(env,[...p.guards,env.DB.prepare('INSERT INTO wl_training_requests VALUES(?,?,?,?,?,?,?,?)').bind(id,p.person,operation,p.assignment,JSON.stringify(p.payload),p.source,actor.id,now())],{actor:actor.id,action:'training.request',subject:id,detail:{operation,person:p.person}})
  return {id,assignment:p.assignment,status:'pending'}
 }
 await commit(env,[...p.guards,p.statement],{actor:actor.id,action:'training.'+operation,subject:p.assignment,detail:{person:p.person}})
 return {id:p.assignment,status:'applied'}
}
export const assignTraining=(env:Bindings,actor:Actor,input:Input)=>mutate(env,actor,input,'assign')
export const completeTraining=(env:Bindings,actor:Actor,input:Input)=>mutate(env,actor,input,'complete')
export const waiveTraining=(env:Bindings,actor:Actor,input:Input)=>mutate(env,actor,input,'waive')
export async function decideTraining(env:Bindings,actor:Actor,input:Input) {
 const live=await performanceAuthority(env,actor,true);actor=live.actor
 insist(can(actor,'people.manage'),'forbidden',403)
 input.only(['returnTo','request','decision','reason'])
 const id=input.text('request'),decision=input.text('decision'),reason=input.text('reason',{max:2000})
 insist(decision==='approve'||decision==='reject','invalid_decision')
 const row=await one(env,'SELECT * FROM wl_training_requests WHERE id=?',id)
 insist(row,'not_found',404)
 insist(row.requested_by!==actor.id&&row.person_id!==actor.personId,'self_approval_forbidden',403)
 insist(!await one(env,'SELECT 1 FROM wl_training_decisions WHERE request_id=?',id),'already_decided',409)
 const statements=[...live.guards,guard(env,'already_decided','NOT EXISTS(SELECT 1 FROM wl_training_decisions WHERE request_id=?)',id)]
 if(decision==='approve') {
  const member=await one(env,'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?',row.requested_by)
  insist(member,'requester_unavailable',403)
  const requester=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:''})
  const prepared=await prepare(env,requester,Input.of(JSON.parse(row.payload_json)),row.operation,row.target_id,false)
  insist(prepared.person===row.person_id&&prepared.assignment===row.target_id&&prepared.source===row.source_revision,'training_source_changed',409)
  statements.push(...prepared.guards,prepared.statement)
 }
 statements.push(env.DB.prepare('INSERT INTO wl_training_decisions VALUES(?,?,?,?,?)').bind(id,decision==='approve'?'approved':'rejected',actor.id,now(),reason))
 await commit(env,statements,{actor:actor.id,action:'training.decide',subject:id,detail:{decision}})
 return {id,status:decision==='approve'?'approved':'rejected'}
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
 for(const row of await all(env,`SELECT r.*,a.due_date FROM wl_training_requests r LEFT JOIN wl_training_assignments a ON a.id=r.target_id
  WHERE NOT EXISTS(SELECT 1 FROM wl_training_decisions d WHERE d.request_id=r.id)`)) {
  const reviewer=(actor:Actor)=>can(actor,'people.manage')&&actor.id!==row.requested_by&&actor.personId!==row.person_id
  const field=row.operation==='complete'?'trainingCompletions':'trainingAssignments'
  const payload=JSON.parse(row.payload_json)
  result.push({key:`training-request:${row.id}`,kind:'training-request',title:'Review training change',path:'/app/training',due:row.due_date??payload.dueDate,
   next:'Review the exact proposed training change',progress:'Independent review pending',personId:row.person_id,approval:true,
   visible:actor=>reviewer(actor)||actor.id===row.requested_by&&reads(actor,row.person_id,field)&&(!payload.certificate||reads(actor,row.person_id,'trainingCertifications')),
   responsible:reviewer})
 }
 return result
}
