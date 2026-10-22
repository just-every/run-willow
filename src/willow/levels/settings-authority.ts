import type { Bindings } from '../../auth.server'
import { actorFor, type Actor } from '../actor'
import { guard, insist, one } from '../core'
import { requireSetting, type SettingsKey } from './settings'

const ACTIVE_SESSION = `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email) WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`

/** Rebuild native and selected authority; writes include these guards in their business batch. */
export async function liveSettingsActor(env: Bindings, actor: Pick<Actor,'id'|'sessionId'>, key: SettingsKey) {
 const snapshot=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const row=await one(env,'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?',actor.id)
 insist(row,'forbidden',403)
 const at=Date.now()
 insist((await one<{active:number}>(env,`SELECT ${ACTIVE_SESSION} AS active`,actor.sessionId,actor.id,at))?.active,'forbidden',403)
 const current=await actorFor(env,{id:row.id,email:row.email,name:row.name,owner:row.role==='owner',personId:row.person_id,sessionId:actor.sessionId})
 requireSetting(current,key)
 return {actor:current,guards:[guard(env,'access_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),guard(env,'access_changed',ACTIVE_SESSION,actor.sessionId,actor.id,Date.now())]}
}
