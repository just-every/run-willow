// ROLE-003: explicit global HR delegation. Scoped access-administration is not offered.
import type { Bindings } from '../../auth.server'
import { actorFor, requireLevelAdmin, type Actor, type Permission } from '../actor'
import { all, guard, insist, one } from '../core'
import { SELF_FIELDS, selfWriteModes, type SelfMode } from './personal'
import { OTHER_FIELDS, type OtherMode } from './other-personal'
import type { DocumentRules } from './documents'
import type { Scope } from './scope'
import type { Plan } from './actions'
import type { levels } from './store'

// Group containment is structural, so a later transfer cannot widen a grant past its issuer's scope.
const coversScope=(cover: Scope,requested: Scope)=>cover.kind==='everyone' || cover.kind==='group' && requested.kind==='group' && Object.entries(cover.dimensions).every(([dimension,allowed])=>!!requested.dimensions[dimension] && requested.dimensions[dimension].every(value=>allowed.includes(value)))
const selfRank: Record<SelfMode,number>={view:0,approval:1,edit:2}
const otherRank: Record<OtherMode,number>={none:0,view:1,approval:2,edit:3}
export const PAY_RIGHTS=['pay.read','payroll.handoff','compensation.approve']
export async function currentLevelAdmin(env: Bindings, actor: Actor) {
 const row=await one(env,`SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?`,actor.id)
 insist(row,'forbidden',403)
 const current=await actorFor(env,{id:row.id,email:row.email,name:row.name,personId:row.person_id,owner:row.role==='owner',sessionId:actor.sessionId})
 requireLevelAdmin(current)
 return current
}
export const levelSessionFence=(env: Bindings,actor: Actor)=>guard(env,'access_changed',`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email)
 WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`,actor.sessionId,actor.id,Date.now())

/** Delegates hold employer-wide HR authority today, so any narrower level scope stays within their reach. */
export async function validateDelegation(env: Bindings,actor: Actor,plan: Plan,data: Awaited<ReturnType<typeof levels>>) {
 requireLevelAdmin(actor)
 if(actor.owner) return
 const self=await selfWriteModes(env,actor)
 const categories=await all<{id:string;subject_reads:number}>(env,'SELECT id,subject_reads FROM wl_doc_categories')
 const checkDefinition=(definition:{permissions:readonly string[];selfFields:Record<string,SelfMode>;otherFields:Record<string,OtherMode>;scope:Scope;followOwnChanges:boolean;documentCategories:DocumentRules})=>{
  insist(!definition.permissions.some(p=>p==='access.admin'||p==='eeo.individual'),'owner_only_delegation',403)
  insist(definition.permissions.every(p=>actor.permissions.has(p as Permission) || actor.scoped.some(grant=>grant.permissions.has(p as Permission)&&coversScope(grant.scope,definition.scope))),'delegation_ceiling',403)
  for(const relation of ['self','others'] as const) for(const [category,mode] of Object.entries(definition.documentCategories[relation])) if(mode==='view') insist(actor.permissions.has('documents.private') || relation==='self' && !!actor.personId && !!categories.find(c=>c.id===category)?.subject_reads || actor.documentCategories.some(grant=>grant.rules[relation][category]==='view' && (relation==='self'||coversScope(grant.scope,definition.scope))) || relation==='others' && actor.scoped.some(grant=>grant.permissions.has('documents.private')&&coversScope(grant.scope,definition.scope)),'delegation_ceiling',403)
  insist(!definition.followOwnChanges || actor.followOwnChanges,'delegation_ceiling',403)
  for(const field of SELF_FIELDS) if(definition.selfFields[field]) insist(selfRank[definition.selfFields[field]]<=selfRank[self[field]],'delegation_ceiling',403)
  for(const field of OTHER_FIELDS) if(definition.otherFields[field]) {
   const baseline:OtherMode=field==='preferredName' || actor.permissions.has('people.private') ? 'edit' : 'none'
   const held=actor.otherPersonal.filter(grant=>coversScope(grant.scope,definition.scope)).reduce<OtherMode>((best,grant)=>otherRank[grant.fields[field]??'none']>otherRank[best]?grant.fields[field]!:best,baseline)
   const privateScope=actor.scoped.some(grant=>grant.permissions.has('people.private')&&coversScope(grant.scope,definition.scope))
   insist(otherRank[definition.otherFields[field]]<=(privateScope?otherRank.edit:otherRank[held]),'delegation_ceiling',403)
  }
 }
 const checkMember=(id:string)=>{
  const member=data.members.find(m=>m.id===id)
  insist(member && !member.owner && member.id!==actor.id,'delegation_target_fixed',403)
  const old=data.assignments.filter(a=>a.member_id===id).map(a=>data.levels.find(l=>l.id===a.level_id)!)
  insist(!old.some(l=>l.permissions.includes('eeo.individual')),'owner_only_delegation',403)
 }
 if(plan.kind==='level') {
  checkDefinition(plan)
  const prior=data.levels.find(l=>l.id===plan.level)
  insist(!prior?.permissions.includes('eeo.individual'),'owner_only_delegation',403)
  for(const assignment of data.assignments.filter(a=>a.level_id===plan.level)) checkMember(assignment.member_id)
 } else {
  const assignments=plan.kind==='revert' ? plan.assignments : (plan.kind==='assignment'?[plan.member]:plan.members).map(member=>({member,levels:plan.levels}))
  for(const assignment of assignments) {
   checkMember(assignment.member)
   for(const id of assignment.levels) {const definition=data.levels.find(l=>l.id===id);insist(definition,'level_not_found',404);checkDefinition(definition)}
  }
 }
}

export async function delegatedPayReview(env: Bindings,actor: Actor,plan: Plan,data: Awaited<ReturnType<typeof levels>>) {
 if(actor.owner) return false
 if(plan.kind==='level') return plan.permissions.some(p=>PAY_RIGHTS.includes(p))
 const assigned=plan.kind==='revert' ? plan.assignments.flatMap(a=>a.levels) : plan.levels
 return assigned.some(id=>data.levels.find(l=>l.id===id)!.permissions.some(p=>PAY_RIGHTS.includes(p)))
}
