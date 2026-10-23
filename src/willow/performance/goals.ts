import { performanceAuthority } from './authority'
import { performanceMode, readsPerformanceField, type PerformanceMode } from '../levels/performance'
// Goals and their evidence live independently of review cycles. Permission is
// always today's scope; a former manager never inherits a historical grant.
import type { Bindings } from '../../auth.server'
import { actorFor, can, type Actor } from '../actor'
import { all, commit, guard, insist, json, newId, now, one, stmt } from '../core'
import { addDays, requireDate } from '../dates'
import { Input } from '../input'

const currentManagers = `WITH current_managers AS (
 SELECT p.person_id,t.manager_person_id FROM wl_periods p JOIN wl_terms t ON t.period_id=p.id
 WHERE p.start_date<=?1 AND (p.end_date IS NULL OR p.end_date>=?1)
 AND t.status='active' AND t.effective_from=(SELECT MAX(n.effective_from) FROM wl_terms n
 WHERE n.period_id=p.id AND n.status='active' AND n.effective_from<=?1)
)`
const activeMember = `EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email
 WHERE m.id=? AND m.status='active' AND o.status='active')`
function nativeScope(actor: Actor, person: string, manager: string | null) {
 return can(actor,'people.manage') || actor.personId===person || (!!actor.personId && actor.personId===manager)
}

const inScope=(actor:Actor,person:string,manager:string|null)=>nativeScope(actor,person,manager)||readsPerformanceField(actor,person,'goals')

export const goalMode=(actor:Actor,person:string,manager:string|null):PerformanceMode=>nativeScope(actor,person,manager)?'edit':performanceMode(actor,person,'goals')
export const readsGoal=(actor:Actor,person:string)=>can(actor,'people.manage')||actor.personId===person||actor.reports.has(person)||readsPerformanceField(actor,person,'goals')
const writesGoal=(actor:Actor,person:string,manager:string|null)=>['edit','approval'].includes(goalMode(actor,person,manager))

export async function goalHome(env: Bindings, actor: Actor) {
 const [people, members, rows]=await Promise.all([
  all(env,`${currentManagers} SELECT p.id,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS name,m.manager_person_id
   FROM wl_people p LEFT JOIN current_managers m ON m.person_id=p.id ORDER BY name`,actor.today),
  all(env,`SELECT m.id,m.name,m.person_id,(o.role='owner' OR EXISTS(SELECT 1 FROM wl_effective_permissions permission
   WHERE permission.member_id=m.id AND permission.permission='people.manage')) AS manages_people
   FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email
   WHERE m.status='active' AND o.status='active' ORDER BY m.name`),
  all(env,`${currentManagers} SELECT g.*,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS person_name,
   owner.name AS owner_name,manager.manager_person_id,c.evidence,c.completed_by,c.completed_at
   FROM wl_goals g JOIN wl_people p ON p.id=g.person_id LEFT JOIN wl_members owner ON owner.id=g.owner_member
   LEFT JOIN current_managers manager ON manager.person_id=g.person_id
   LEFT JOIN wl_goal_completions c ON c.goal_id=g.id ORDER BY g.due_date,g.created_at,g.id`,actor.today),
 ])
 const scoped=rows.filter(g=>inScope(actor,g.person_id,g.manager_person_id))
 const ids=new Set(scoped.map(g=>g.id))
 const checkins=ids.size ? await all(env,`SELECT c.*,m.name AS author_name FROM wl_goal_checkins c
  JOIN wl_members m ON m.id=c.author WHERE c.goal_id IN (${[...ids].map(()=>'?').join(',')}) ORDER BY c.seq`,...ids) : []
 const activeActor=members.some(m=>m.id===actor.id)
 return {
  readablePeople:people.filter(p=>inScope(actor,p.id,p.manager_person_id)).map(p=>({id:p.id,name:p.name})),
  people:people.filter(p=>writesGoal(actor,p.id,p.manager_person_id)).map(p=>({id:p.id,name:p.name})),
  members:members.map(m=>({id:m.id,name:m.name,personId:m.person_id,managesPeople:!!m.manages_people})),
  goals:scoped.map(g=>({id:g.id,personId:g.person_id,personName:g.person_name,title:g.title,
   milestones:json<string[]>(g.milestones_json,[]),dueDate:g.due_date,development:!!g.development,
   owner:g.owner_member,ownerName:g.owner_name,createdAt:g.created_at,
   checkins:checkins.filter(c=>c.goal_id===g.id).map(c=>({id:c.id,progress:c.progress,note:c.note,author:c.author,authorName:c.author_name,createdAt:c.created_at})),
   completion:g.evidence===null ? null : {evidence:g.evidence,completedBy:g.completed_by,completedAt:g.completed_at},
   mayCheckin:g.evidence===null && writesGoal(actor,g.person_id,g.manager_person_id),
   checkinRequiresApproval:goalMode(actor,g.person_id,g.manager_person_id)==='approval',
   completeRequiresApproval:goalMode(actor,g.person_id,g.manager_person_id)==='approval',
   mayComplete:!!g.development && g.evidence===null && writesGoal(actor,g.person_id,g.manager_person_id) && (can(actor,'people.manage') || (activeActor && g.owner_member===actor.id)),
  })),
 }
}

type GoalOperation='create'|'checkin'|'complete'
const SOURCE_SQL="SELECT json_array((SELECT COALESCE(MAX(seq),0) FROM wl_goal_checkins WHERE goal_id=?1),(SELECT COUNT(*) FROM wl_goal_completions WHERE goal_id=?1)) AS source"
const goalSource=async(env:Bindings,id:string)=>String((await one(env,SOURCE_SQL,id))!.source)


async function prepareGoalMutation(env:Bindings,actor:Actor,input:Input,operation:GoalOperation,{approved=false,id:fixedId}:{approved?:boolean;id?:string}={}) {
 const live=await performanceAuthority(env,actor,!approved);actor=live.actor
 const fields=operation==='create'?['returnTo','person','title','milestones','dueDate','development','owner']:operation==='checkin'?['returnTo','goal','progress','note']:['returnTo','goal','evidence']
 input.only(fields)
 const id=operation==='create'?fixedId??newId():input.text('goal')
 const row=operation==='create'
  ? await one(env,`${currentManagers} SELECT p.id AS person_id,m.manager_person_id FROM wl_people p LEFT JOIN current_managers m ON m.person_id=p.id WHERE p.id=?2`,actor.today,input.text('person'))
  : await one(env,`${currentManagers} SELECT g.*,m.manager_person_id FROM wl_goals g LEFT JOIN current_managers m ON m.person_id=g.person_id WHERE g.id=?2`,actor.today,id)
 insist(row&&writesGoal(actor,row.person_id,row.manager_person_id),'not_found',404)
 insist(!await one(env,'SELECT 1 FROM wl_erasure_requests WHERE person_id=? AND receipt_id IS NOT NULL',row.person_id),'not_found',404)
 const person=row.person_id,mode=goalMode(actor,person,row.manager_person_id),at=now()
 const guards:D1PreparedStatement[]=[...live.guards,guard(env,'goal_person_erased','NOT EXISTS(SELECT 1 FROM wl_erasure_requests WHERE person_id=? AND receipt_id IS NOT NULL)',person)],changes:D1PreparedStatement[]=[]
 let checkinId:string|undefined
 let payload:Record<string,unknown>,before:Record<string,unknown>|null=null
 const source=operation==='create'?'new':await goalSource(env,id)
 if(operation==='create') {
  const title=input.text('title',{max:300}),due=requireDate(input.text('dueDate'),'invalid_dueDate'),development=input.flag('development'),milestones=input.list('milestones')
  insist(milestones.length<=30&&milestones.every(m=>m.length<=300),'invalid_milestones')
  const owner=input.text('owner',{optional:!development})||null
  if(owner) {
   const member=await one(env,'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?',owner)
   insist(member,'invalid_owner')
   const ownerActor=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:''})
   insist(writesGoal(ownerActor,person,row.manager_person_id),'invalid_owner')
   guards.push(guard(env,'goal_owner_inactive',activeMember,owner))
  }
  payload={person,title,milestones,dueDate:due,development,owner:owner??''}
  guards.push(guard(env,'stale','NOT EXISTS(SELECT 1 FROM wl_goals WHERE id=?)',id))
  changes.push(stmt(env,`INSERT INTO wl_goals(id,person_id,title,milestones_json,due_date,development,owner_member,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,id,person,title,JSON.stringify(milestones),due,development?1:0,owner,actor.id,at))
 } else {
  insist(!await one(env,'SELECT 1 FROM wl_goal_completions WHERE goal_id=?',id),'goal_completed',409)
  before={title:row.title,milestones:JSON.parse(row.milestones_json),dueDate:row.due_date,development:!!row.development,owner:row.owner_member,source}
  guards.push(guard(env,'goal_source_changed',`(${SOURCE_SQL.replace(' AS source','').replaceAll('?1','?')})=?`,id,id,source),guard(env,'goal_completed','NOT EXISTS(SELECT 1 FROM wl_goal_completions WHERE goal_id=?)',id))
  if(operation==='checkin') {
   const progress=input.integer('progress',{min:0,max:100})!,note=input.text('note',{max:4000}),checkin=newId()
   payload={goal:id,progress,note};checkinId=checkin
   changes.push(stmt(env,'INSERT INTO wl_goal_checkins(id,goal_id,author,progress,note,created_at) VALUES(?,?,?,?,?,?)',checkin,id,actor.id,progress,note,at))
  } else {
   const evidence=input.text('evidence',{max:4000});insist(evidence.length>=3,'invalid_evidence')
   insist(row.development,'not_development')
   insist(can(actor,'people.manage')||row.owner_member===actor.id,'forbidden',403)
   payload={goal:id,evidence}
   changes.push(stmt(env,'INSERT INTO wl_goal_completions(goal_id,evidence,completed_by,completed_at) VALUES(?,?,?,?)',id,evidence,actor.id,at))
  }
 }
 return {id,person,mode,source,payload,before,guards,statements:[...guards,...changes],checkinId,action:operation==='create'?'goal.create':operation==='checkin'?'goal.checkin':'goal.complete'}
}

async function mutateGoal(env:Bindings,actor:Actor,input:Input,operation:GoalOperation) {
 const prepared=await prepareGoalMutation(env,actor,input,operation)
 if(prepared.mode==='approval') {
  const id=newId()
  // Validation and authority guards run now, but no goal statement publishes.
  await commit(env,[...prepared.guards,
   stmt(env,'INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,requested_by,requested_at,due_date) VALUES(?,?,?,?,?,?,?,?,?,?)',id,prepared.person,'goal',prepared.id,JSON.stringify(prepared.before),JSON.stringify({operation,payload:prepared.payload}),prepared.source,actor.id,now(),addDays(actor.today,7))],{actor:actor.id,action:'selfChange.request',subject:id,detail:{person:prepared.person,kind:'goal'}})
  return {id,goal:prepared.id,status:'pending',notice:'Goal change requested. Track it in Personal changes.'}
 }
 await commit(env,prepared.statements,{actor:actor.id,action:prepared.action,subject:prepared.id,detail:{person:prepared.person}})
 return {id:prepared.id,...prepared.checkinId?{checkin:prepared.checkinId}:{}}
}
export const saveGoal=(env:Bindings,actor:Actor,input:Input)=>mutateGoal(env,actor,input,'create')
export const checkinGoal=(env:Bindings,actor:Actor,input:Input)=>mutateGoal(env,actor,input,'checkin')
export const finishDevelopment=(env:Bindings,actor:Actor,input:Input)=>mutateGoal(env,actor,input,'complete')

export async function approveGoalStatements(env:Bindings,reviewer:Actor,row:Record<string,any>) {
 const after=JSON.parse(row.after_json)
 insist(['create','checkin','complete'].includes(after.operation),'invalid_goal_proposal')
 const member=await one(env,'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?',row.requested_by)
 insist(member,'goal_requester_unavailable',403)
 const requester=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:''})
 const prepared=await prepareGoalMutation(env,requester,Input.of(after.payload),after.operation,{approved:true,id:row.row_id})
 insist(prepared.person===row.person_id&&prepared.id===row.row_id,'invalid_goal_proposal')
 insist(prepared.source===row.source_revision,'goal_source_changed',409)
 return [...prepared.statements,stmt(env,'INSERT INTO wl_audit(at,actor,action,subject,detail) VALUES(?,?,?,?,?)',now(),requester.id,prepared.action,prepared.id,JSON.stringify({person:prepared.person,approval:row.id,approvedBy:reviewer.id}))]
}
