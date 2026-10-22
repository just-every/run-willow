// Pending impact is computed by the very predicates used by each native decision.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all,json,type Row } from '../core'
import { mayApprove,type ResolvedStep,stepLabel } from '../change-requests/chain'
import { mayDecideLeave } from '../leave'
import { displayName } from '../people'
import { canDecideSelfChange,SELF_CHANGE_SELECT,selfApprovalKey } from '../self-service/view'
import { workMembers } from '../work-sources'
import type { Plan } from './actions'
import type { levels } from './store'
import { proposedApprovalActors } from './approval-preview-actors'

interface Pending {source:string;key:string;person:string;title:string;path:string;preferred?:string|null;eligible:(actor:Actor)=>boolean|Promise<boolean>}
export interface ApprovalImpact {person:string;source:string;approval:string;title:string;path:string;before:{id:string;name:string}[];after:{id:string;name:string}[];beforeOwner:string|null;afterOwner:string|null;beforeSubstitute:string|null;afterSubstitute:string|null;reassigned:boolean;orphaned:boolean}
export async function approvalImpact(env:Bindings,_viewer:Actor,plan:Plan,data:Awaited<ReturnType<typeof levels>>):Promise<ApprovalImpact[]> {
 const [self,leave,changes]=await Promise.all([
  all(env,`${SELF_CHANGE_SELECT} WHERE d.change_id IS NULL`),all(env,"SELECT * FROM wl_leave_requests WHERE status='pending'"),all(env,"SELECT * FROM wl_change_requests WHERE status='pending'"),
 ])
 if(!self.length&&!leave.length&&!changes.length)return []
 const [beforeActors,people,schedules]=await Promise.all([workMembers(env),all(env,'SELECT id,legal_name,preferred_name FROM wl_people'),all(env,'SELECT source,owner,substitute FROM wl_work_schedule')])
 const afterActors=await proposedApprovalActors(env,plan,data,beforeActors)
 const names=new Map(people.map(person=>[person.id,displayName(person)]))
 const pending:Pending[]=[
  ...self.map(row=>({source:`self-change:${row.id}`,key:selfApprovalKey(row),person:row.person_id,title:`${row.kind==='document'?'Document':row.kind==='customField'?'Custom field':'Personal'} change for ${names.get(row.person_id)}`,path:`/app/self-changes/${row.id}`,eligible:(actor:Actor)=>canDecideSelfChange(env,actor,row)})),
  ...leave.map(row=>({source:`leave:${row.id}`,key:'leave',person:row.person_id,title:`Leave request for ${names.get(row.person_id)}`,path:`/app/leave/${row.id}`,preferred:row.approver_member_id,eligible:(actor:Actor)=>mayDecideLeave(actor,row)})),
 ]
 for(const row of changes) {
  const steps=json<ResolvedStep[]>(row.steps_json,[]),step=steps[row.step]
  if(step)pending.push({source:`change-request:${row.id}`,key:step.approvalKey??`change:${row.request_type}:${step.role}`,person:row.person_id,title:`${row.request_type==='job'?'Job':'Compensation'} change for ${names.get(row.person_id)} · ${stepLabel(step)}`,path:`/app/changes/${row.id}`,preferred:step.member,eligible:(actor:Actor)=>mayApprove(env,actor,row as {requested_by:string;person_id:string},step)})
 }
 const rows:ApprovalImpact[]=[]
 for(const item of pending) {
  const eligible=async(actors:Actor[])=>{
   const decisions=await Promise.all(actors.map(async actor=>({actor,allowed:await item.eligible(actor)})))
   return decisions.filter(row=>row.allowed).map(row=>row.actor)
  }
  const [before,after]=await Promise.all([eligible(beforeActors),eligible(afterActors)])
  const current=schedules.find(schedule=>schedule.source===item.source)
  const route=(actors:Actor[],old?:Row)=>{
   const owner=actors.find(actor=>actor.id===old?.owner)??actors.find(actor=>actor.id===item.preferred)??actors[0]
   const substitute=actors.find(actor=>actor.id!==owner?.id&&actor.id===old?.substitute)??actors.find(actor=>actor.id!==owner?.id)
   return {owner:owner?.id??null,substitute:substitute?.id??null}
  }
  const previous=route(before,current),next=route(after,current)
  if(before.map(actor=>actor.id).join(',')===after.map(actor=>actor.id).join(',')&&previous.owner===next.owner&&previous.substitute===next.substitute)continue
  rows.push({person:item.person,source:item.source,approval:item.key,title:item.title,path:item.path,before:before.map(actor=>({id:actor.id,name:actor.name})),after:after.map(actor=>({id:actor.id,name:actor.name})),beforeOwner:previous.owner,afterOwner:next.owner,beforeSubstitute:previous.substitute,afterSubstitute:next.substitute,reassigned:previous.owner!==next.owner||previous.substitute!==next.substitute,orphaned:next.owner===null})
 }
 return rows
}
