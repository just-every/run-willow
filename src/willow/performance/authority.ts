import type { Bindings } from '../../auth.server'
import { actorFor, type Actor } from '../actor'
import { guard, insist, one } from '../core'

// Capture before rebuilding current rights, then fence both Willow authority
// and Base identity in the same transaction as the native performance mutation.
export async function performanceAuthority(env:Bindings,actor:Actor,requireSession:boolean) {
 const snapshot=(await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const member=await one(env,'SELECT m.*,o.id AS operator_id,o.version AS operator_version,o.role FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=?',actor.id)
 insist(member,'forbidden',403)
 const current=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:actor.sessionId})
 const guards=[guard(env,'goal_access_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),
  guard(env,'goal_access_changed',"EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=? AND m.person_id IS ? AND m.status='active' AND o.id=? AND o.role=? AND o.version=? AND o.status='active')",member.id,member.person_id,member.operator_id,member.role,member.operator_version)]
 if(requireSession)guards.push(guard(env,'goal_access_changed',"EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND s.operator_id=? AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)",actor.sessionId,member.operator_id,Date.now()))
 return {actor:current,guards}
}

