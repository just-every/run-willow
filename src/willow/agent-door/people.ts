import type { Bindings } from '../../auth.server'
import { operatorAuth, authConfig } from '../../auth.server'
import { operatorAuthPeople, ToolRefusal, type PeopleAdapter, type Person } from '../../modules/agent-door/index.ts'
import { currentActor, actorFor } from '../actor'
import { one } from '../core'

/** Business subjects resolve to OA ids first, then the native durable member id.
 * Neither token email nor a subsequently reused address selects a member. */
export function willowPeople(env: Bindings): PeopleAdapter {
 const policyRoles=new Map<string,'owner'|'editor'|null>()
 const native = operatorAuthPeople({db:env.DB, allowList:authConfig(env).allowList, session:request=>operatorAuth(env).getSession(request)})
 async function mapped(operator: Person|null): Promise<Person|null> {
  if(!operator?.active)return null
  const member=await one(env,`SELECT m.id,m.name,m.status FROM wl_agent_people b JOIN wl_members m ON m.id=b.member_id WHERE b.operator_id=?`,operator.id)
  if(member?.status!=='active')return null
  const principal={...operator,id:member.id,name:member.name}
  policyRoles.set(member.id,(await membership(operator.id))?.role??null)
  return principal
 }
 async function operator(id:string) {
  const row=await one<{operator_id:string}>(env,'SELECT operator_id FROM wl_agent_people WHERE member_id=?',id)
  return row?native.person(row.operator_id):null
 }
 async function membership(id:string):Promise<{id:string;role:'owner'|'editor'|null}|null> {
  const owner=await one<{owner_id:string|null}>(env,`SELECT s.owner_id FROM bs_settings s JOIN wl_agent_installation_owner b ON b.operator_id=? WHERE s.singleton=1 AND s.stopped=0`,id)
  if(owner?.owner_id)return {id:owner.owner_id,role:'owner'}
  const member=await one<{business_id:string;business_role:string}>(env,"SELECT business_id,business_role FROM bs_team WHERE operator_id=? AND state<>'conflict' AND business_id IS NOT NULL",id)
  return member?{id:member.business_id,role:member.business_role==='admin'?'editor':null}:null
 }
 return {
  businessRole:person=>env.RER_OWNER_CLAIM_PUBLIC_KEYS?policyRoles.get(person.id)??null:person.role==='owner'?'owner':null,
  async sponsor({sub}) {
   const owner=await one<{operator_id:string}>(env,`SELECT b.operator_id FROM wl_agent_installation_owner b JOIN bs_settings s ON s.singleton=1 AND s.owner_id=? AND s.stopped=0`,sub)
   const team=owner?null:await one<{operator_id:string|null}>(env,"SELECT operator_id FROM bs_team WHERE business_id=? AND state<>'conflict'",sub)
   const id=owner?.operator_id??team?.operator_id
   return id?mapped(await native.person(id)):null
  },
  person:async id=>mapped(await operator(id)),
  async session(request) {
   const actor=await currentActor(env,request)
   return actor?mapped(await operator(actor.id)):null
  },
  async businessMember(person) {
   const account=await operator(person.id)
   return account?.active?membership(account.id):null
  },
 }
}

/** Rebuild every native grant for every read, classification and execution.
 * Empty sessionId confers no interactive-session or step-up authority. */
export async function agentActor(env:Bindings, person:Readonly<Person>) {
 const current=await willowPeople(env).person(person.id)
 if(!current?.active)throw new ToolRefusal('unauthenticated')
 const row=await one<{person_id:string|null}>(env,'SELECT person_id FROM wl_members WHERE id=?',person.id)
 if(!row)throw new ToolRefusal('unauthenticated')
 return actorFor(env,{id:current.id,email:current.email,name:current.name,owner:current.role==='owner',personId:row.person_id,sessionId:''})
}
