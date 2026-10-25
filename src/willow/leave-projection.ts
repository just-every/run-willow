import { currentCredentialPrincipal, credentialFence } from './api-credentials/authenticate'
// Current-authority leave writes and small projections shared by the native doors.
import type { Bindings } from '../auth.server'
import { actorFor, type Actor } from './actor'
import { guard, insist, one, type Row } from './core'
import { levelSessionFence } from './levels/delegation'
import { readsLeaveField, type LeaveField } from './levels/leave'

export async function liveLeaveActor(env: Bindings, actor: Pick<Actor, 'id' | 'sessionId'>) {
 if(actor.id.startsWith('credential:')) {
  const current=await currentCredentialPrincipal(env,actor.id.slice(11))
  return {actor:current,guards:[credentialFence(env,current)]}
 }
 const snapshot = (await one<{ seq: number }>(env, 'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const member = await one(env, 'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?', actor.id)
 insist(member, 'forbidden', 403)
 const current = await actorFor(env, { id: member.id, email: member.email, name: member.name, owner: member.role === 'owner', personId: member.person_id, sessionId: actor.sessionId })
 return { actor: current, guards: [guard(env, 'access_changed', '(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?', snapshot), levelSessionFence(env, current)] }
}

/** A requester recheck uses current identity/levels, not the deciding owner's session. */
export async function currentLeaveMember(env: Bindings, id: string) {
 if(id.startsWith('credential:'))return currentCredentialPrincipal(env,id.slice(11))
 const member = await one(env, 'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?', id)
 insist(member, 'access_ended', 403)
 return actorFor(env, { id: member.id, email: member.email, name: member.name, owner: member.role === 'owner', personId: member.person_id, sessionId: '' })
}

export const leaveReadFields = (actor: Actor, person: string, allow?: (field: LeaveField) => boolean) => Object.fromEntries((['balances', 'ledger', 'requests', 'calendar', 'policies'] as const).map(field => [field, readsLeaveField(actor, person, field) && (!allow || allow(field))])) as Record<LeaveField, boolean>
export const absenceView = (row: Row, name: string) => ({ name, startDate: row.start_date, endDate: row.end_date, status: row.status })
