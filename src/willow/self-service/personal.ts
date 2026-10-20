// A personal proposal contains exactly one validated field and its nullable value.
import type { Bindings } from '../../auth.server'
import { actorFor, type Actor } from '../actor'
import { guard, insist, newId, now, one, stmt } from '../core'
import { isDate } from '../dates'
import { Input } from '../input'
import { SELF_FIELDS, selfWriteModes, type SelfField } from '../levels/personal'

export function personalField(value: string): SelfField {
 insist((SELF_FIELDS as readonly string[]).includes(value),'invalid_personal_field')
 return value as SelfField
}

export function personalValue(input: Input, field: SelfField) {
 insist(input.provided('value'),'missing_value')
 const value=input.text('value',{optional:true,max:field==='preferredName'?120:400})||null
 insist(field!=='date_of_birth'||!value||isDate(value),'invalid_date_of_birth')
 return value
}

/** Read before resolving authority; the batch fence rejects intervening changes. */
export async function personalModeSnapshot(env: Bindings, actor: Actor, field: SelfField) {
 const snapshot=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 insist((await selfWriteModes(env,actor))[field]==='approval','personal_approval_unavailable',403)
 return guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot)
}

export async function approvePersonalStatements(env: Bindings, reviewer: Actor, row: Record<string, any>) {
 const field=personalField(row.row_id), value=personalValue(Input.of({value:JSON.parse(row.after_json)[field]}),field)
 const snapshot=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const member=await one(env,`SELECT m.id,m.email,m.name,m.person_id,o.role FROM wl_members m
  JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?`,row.requested_by)
 insist(member && member.person_id===row.person_id,'personal_approval_unavailable',403)
 const requester=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:reviewer.sessionId})
 insist((await selfWriteModes(env,requester))[field]==='approval','personal_approval_unavailable',403)
 return [
  guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),
  guard(env,'stale','EXISTS(SELECT 1 FROM wl_people WHERE id=? AND revision=?)',row.person_id,row.source_revision),
  ...(field==='preferredName' ? [stmt(env,'UPDATE wl_people SET preferred_name=? WHERE id=?',value,row.person_id)]
   : [stmt(env,`UPDATE wl_person_private SET ${field}=? WHERE person_id=?`,value,row.person_id)]),
  stmt(env,'UPDATE wl_people SET revision=?,updated_at=? WHERE id=?',newId(),now(),row.person_id),
 ]
}
