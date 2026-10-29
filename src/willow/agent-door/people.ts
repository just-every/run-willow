import type { Bindings } from '../../auth.server'
import { operatorAuth, authConfig } from '../../auth.server'
import { operatorAuthPeople, ToolRefusal, type PeopleAdapter, type Person } from '../../modules/agent-door/index.ts'
import { currentActor, actorFor } from '../actor'
import { one } from '../core'

/** Business subjects resolve to OA ids first, then the native durable member id.
 * Neither token email nor a subsequently reused address selects a member. */
export function willowPeople(env: Bindings): PeopleAdapter {
 const native = operatorAuthPeople({db:env.DB, allowList:authConfig(env).allowList, session:request=>operatorAuth(env).getSession(request)})
 async function mapped(operator: Person|null): Promise<Person|null> {
  if(!operator?.active)return null
  const member=await one(env,`SELECT m.id,m.name,m.status FROM wl_agent_people b JOIN wl_members m ON m.id=b.member_id WHERE b.operator_id=?`,operator.id)
  return member?.status==='active'?{...operator,id:member.id,name:member.name}:null
 }
 async function operator(id:string) {
  const row=await one<{operator_id:string}>(env,'SELECT operator_id FROM wl_agent_people WHERE member_id=?',id)
  return row?native.person(row.operator_id):null
 }
 return {
  businessRole:person=>person.role==='owner'?'owner':null,
  sponsor:async claims=>mapped(await native.sponsor(claims)),
  person:async id=>mapped(await operator(id)),
  async session(request) {
   const actor=await currentActor(env,request)
   return actor?mapped(await operator(actor.id)):null
  },
  async businessMember(person) {
   const account=await operator(person.id)
   return account?.active?await native.businessMember!(account):null
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
