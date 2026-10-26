import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { freshAiActor } from './ai-provider'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { levelSessionFence } from './levels/delegation'
import { directory } from './profile'

export const reviewsPolicyEscalations = (actor: Actor) => can(actor,'people.manage') || can(actor,'leave.manage')
export const POLICY_ESCALATION_PATH = '/app/policy-assistant#hr-policy-follow-up'

export async function requestPolicyEscalation(env: Bindings, actor: Actor, input: Input) {
 input.only(['returnTo'])
 actor=await freshAiActor(env,actor)
 const existing=await one<{id:string}>(env,"SELECT id FROM wl_ai_policy_escalations WHERE requested_by=? AND status='open'",actor.id)
 if(existing)return existing
 const id=newId()
 await commit(env,[levelSessionFence(env,actor),stmt(env,`INSERT INTO wl_ai_policy_escalations(id,requested_by,person_id,created_at,status)
  SELECT ?,id,person_id,?,'open' FROM wl_members WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_ai_policy_escalations WHERE requested_by=? AND status='open')`,id,now(),actor.id,actor.id)],
 {actor:actor.id,action:'policy.followup.request',subject:actor.id,detail:{outcome:'contact_requested'}})
 const open=await one<{id:string}>(env,"SELECT id FROM wl_ai_policy_escalations WHERE requested_by=? AND status='open'",actor.id)
 insist(open,'policy_followup_changed',409)
 return open
}

export async function resolvePolicyEscalation(env: Bindings, actor: Actor, input: Input) {
 input.only(['escalation','returnTo'])
 actor=await freshAiActor(env,actor)
 insist(reviewsPolicyEscalations(actor),'forbidden',403)
 const id=input.text('escalation',{max:100})
 await commit(env,[levelSessionFence(env,actor),guard(env,'policy_followup_authority_changed',`EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND (o.role='owner' OR EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission IN ('people.manage','leave.manage'))))`,actor.id),
  guard(env,'policy_followup_changed',"EXISTS(SELECT 1 FROM wl_ai_policy_escalations WHERE id=? AND status='open')",id),
  stmt(env,"UPDATE wl_ai_policy_escalations SET status='resolved',resolved_by=?,resolved_at=? WHERE id=? AND status='open'",actor.id,now(),id)],
 {actor:actor.id,action:'policy.followup.resolve',subject:id,detail:{outcome:'hr_followup_completed'}})
 return {id,status:'resolved'}
}

export async function policyEscalations(env: Bindings, actor: Actor) {
 actor=await freshAiActor(env,actor)
 const hr=reviewsPolicyEscalations(actor)
 const people=new Map((await directory(env,actor)).map(person=>[person.id,person]))
 const rows=await all(env,`SELECT id,requested_by,person_id,status,created_at FROM wl_ai_policy_escalations ${hr?'':'WHERE requested_by=?'} ORDER BY created_at DESC,id`,...(hr?[]:[actor.id]))
 return rows.map(row=>({id:row.id as string,requestedBy:row.requested_by as string,
  requester:{id:people.has(row.person_id)?row.person_id as string:null,name:people.get(row.person_id)?.name??'Requester details withheld'},status:row.status as 'open'|'resolved',createdAt:row.created_at as number,canResolve:hr&&row.status==='open'}))
}
