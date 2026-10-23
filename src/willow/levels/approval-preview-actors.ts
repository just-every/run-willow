// Compile the proposed access definition in memory for the immutable review.
import type { Bindings } from '../../auth.server'
import { PERMISSIONS,type Actor,type Permission } from '../actor'
import { all } from '../core'
import type { Plan } from './actions'
import type { levels } from './store'
import { scopeMembers } from './scope'
import type { ApprovalKey } from './approvals'

type Data=Awaited<ReturnType<typeof levels>>
export async function proposedApprovalActors(env:Bindings,plan:Plan,data:Data,actors:Actor[]) {
 const direct=await all<{member_id:string;permission:Permission}>(env,'SELECT member_id,permission FROM wl_permissions')
 return Promise.all(actors.map(async actor=>{
  if(actor.owner)return actor
  const before=data.assignments.filter(row=>row.member_id===actor.id).map(row=>row.level_id)
  const ids=plan.kind==='assignment'&&plan.member===actor.id||plan.kind==='bulk-assignment'&&plan.members.includes(actor.id)?plan.levels:plan.kind==='revert'?plan.assignments.find(row=>row.member===actor.id)?.levels??before:before
  if(plan.kind==='level'?!before.includes(plan.level):ids===before)return actor
  const definitions=ids.map(id=>{
   const stored=data.levels.find(level=>level.id===id)!
   return plan.kind==='level'&&id===plan.level?{...stored,...plan,id:plan.level}:stored
  })
  const compiled=await Promise.all(definitions.map(async definition=>({definition,members:await scopeMembers(env,actor.today,definition.scope,actor.personId)})))
  const permissions=new Set<Permission>([...direct.filter(row=>row.member_id===actor.id).map(row=>row.permission),...definitions.filter(level=>level.scope.kind==='everyone').flatMap(level=>level.permissions as Permission[])])
  const held=(values:string[])=>values.filter((permission):permission is Permission=>(PERMISSIONS as readonly string[]).includes(permission))
  return {...actor,permissions,
   scoped:compiled.filter(({definition:d})=>d.scope.kind!=='everyone'&&d.permissions.length).map(({definition:d,members})=>({level:d.id,scope:d.scope,permissions:new Set(held(d.permissions)),people:members})),
   approvalGrants:compiled.filter(({definition:d})=>d.approvals.length).map(({definition:d,members})=>({level:d.id,scope:d.scope,keys:d.approvals as ApprovalKey[],members})),
   performanceFields:compiled.map(({definition:d,members})=>({level:d.id,scope:d.scope,fields:d.performanceFields,members})),
   jobFields:compiled.map(({definition:d,members})=>({level:d.id,scope:d.scope,fields:d.jobFields,members})),
   leaveFields:compiled.map(({definition:d,members})=>({level:d.id,scope:d.scope,fields:d.leaveFields,members})),
   compensationFields:compiled.map(({definition:d,members})=>({level:d.id,scope:d.scope,fields:d.compensationFields,members})),
   otherPersonal:compiled.map(({definition:d,members})=>({level:d.id,scope:d.scope,fields:d.otherFields,people:d.scope.kind==='everyone'?null:members})),
   documentCategories:compiled.map(({definition:d,members})=>({level:d.id,scope:d.scope,rules:d.documentCategories,people:d.scope.kind==='everyone'?null:members})),
   followOwnChanges:definitions.some(level=>level.followOwnChanges),
  }
 }))
}
