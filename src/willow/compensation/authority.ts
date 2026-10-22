// ROLE-001 compensation-owner authority is explicit and employer-wide.
import type { Bindings } from '../../auth.server'
import { actorFor, can, requirePermission, type Actor } from '../actor'
import { guard, insist, one } from '../core'
import { businessVersion, guardBandSnapshot } from './bands'

export const mayApproveCompensation=(actor: Actor)=>['people.manage','pay.read','compensation.approve'].every(permission=>can(actor,permission as 'people.manage'|'pay.read'|'compensation.approve'))

/** Re-read authority and keep both its business snapshot and live session in the write. */
export async function compensationApprovalAuthority(env: Bindings, actor: Actor) {
 const source=await businessVersion(env)
 const member=await one(env,`SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?`,actor.id)
 insist(member,'forbidden',403)
 const current=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:actor.sessionId})
 requirePermission(current,'people.manage','pay.read','compensation.approve')
 return {actor:current,guards:[guardBandSnapshot(env,source),guard(env,'access_changed',`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email)
  WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`,actor.sessionId,actor.id,Date.now())]}
}
