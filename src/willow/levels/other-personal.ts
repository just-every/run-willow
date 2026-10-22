// Personal rights about others contribute only within their own level's scope.
import type { Bindings } from '../../auth.server'
import { actorFor, canAbout, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt } from '../core'
import type { Input } from '../input'
import type { SelfField } from './personal'
import { EVERYONE, levelScopes, scopeMembers, type Scope } from './scope'
import { personalField, personalValue } from '../self-service/personal'

export const OTHER_FIELDS = ['legalName','preferredName','personal_email','phone','address','date_of_birth','emergency_contact'] as const
export type OtherMode = 'none' | 'view' | 'approval' | 'edit'
export type OtherRules = Partial<Record<SelfField, OtherMode>>
export interface OtherGrant { level: string; scope: Scope; fields: OtherRules; people: Set<string> | null }
const rank: Record<OtherMode, number> = {none:0, view:1, approval:2, edit:3}
export function unionOtherRules(rules: OtherRules[]): Record<SelfField, OtherMode> {
 return Object.fromEntries(OTHER_FIELDS.map(field => [field, rules.reduce<OtherMode>((best, rule) => rank[rule[field] ?? 'none'] > rank[best] ? rule[field]! : best, 'none')])) as Record<SelfField, OtherMode>
}
export function readOtherRules(input: Input): OtherRules | undefined {
 const names=OTHER_FIELDS.map(field=>`otherMode.${field}`)
 if(!input.provided('otherFields') && !names.some(name=>input.provided(name))) return undefined
 const value=input.provided('otherFields') ? input.json('otherFields') : Object.fromEntries(OTHER_FIELDS.map(field=>[field,input.text(`otherMode.${field}`,{optional:true})]).filter(([,mode])=>mode))
 insist(value && typeof value==='object' && !Array.isArray(value),'invalid_other_fields')
 const entries=Object.entries(value as Record<string,unknown>)
 insist(entries.every(([field,mode])=>(OTHER_FIELDS as readonly string[]).includes(field) && typeof mode==='string' && Object.hasOwn(rank,mode)),'invalid_other_fields')
 return Object.fromEntries(entries) as OtherRules
}
export async function otherPersonalGrants(env: Bindings, member: string, person: string|null, date: string): Promise<OtherGrant[]> {
 const rows=await all<{level_id:string;field:SelfField;mode:OtherMode}>(env,'SELECT f.* FROM wl_level_other_fields f JOIN wl_member_levels a ON a.level_id=f.level_id WHERE a.member_id=?',member)
 if(!rows.length) return []
 const scopes=await levelScopes(env)
 return Promise.all([...new Set(rows.map(row=>row.level_id))].map(async level=>{
  const scope=scopes.get(level) ?? EVERYONE
  return {level,scope,fields:Object.fromEntries(rows.filter(row=>row.level_id===level).map(row=>[row.field,row.mode])),people:scope.kind==='everyone' ? null : await scopeMembers(env,date,scope,person)}
 }))
}
export function otherPersonalMode(actor: Actor, person: string, field: SelfField): OtherMode {
 if(actor.personId===person) return 'none'
 // Direct grants and other levels remain independent sources (ROLE-002 precedence).
 const baseline=canAbout(actor,'people.manage',person) && ((field==='preferredName'||field==='legalName') || canAbout(actor,'people.private',person)) ? 'edit' : ((field==='preferredName'||field==='legalName') || canAbout(actor,'people.private',person) ? 'view' : 'none')
 const explicit=unionOtherRules(actor.otherPersonal.filter(grant=>!grant.people || grant.people.has(person)).map(grant=>grant.fields))[field]
 return rank[baseline] > rank[explicit] ? baseline : explicit
}
export const readsPersonalField=(actor: Actor,person: string,field: SelfField)=>actor.personId===person || otherPersonalMode(actor,person,field)!=='none'

/** Rebuild current authority after taking the watermark, then fence it in the native batch. */
export async function otherPersonalFence(env: Bindings, actor: Actor, person: string, field: SelfField, mode: 'edit'|'approval') {
 const snapshot=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const member=await one(env,`SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?`,actor.id)
 insist(member,'forbidden',403)
 const current=await actorFor(env,{id:member.id,email:member.email,name:member.name,owner:member.role==='owner',personId:member.person_id,sessionId:actor.sessionId})
 insist(otherPersonalMode(current,person,field)===mode,'personal_field_forbidden',403)
 return guard(env,'access_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot)
}
export async function editOtherPersonal(env: Bindings, actor: Actor, input: Input) {
 input.only(['person','revision','field','value','returnTo'])
 const person=input.text('person'), field=personalField(input.text('field')), value=personalValue(input,field), revision=input.text('revision')
 const fence=await otherPersonalFence(env,actor,person,field,'edit')
 insist(await one(env,'SELECT 1 FROM wl_people WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)',person),'not_found',404)
 const next=newId()
 await commit(env,[fence,guard(env,'stale','EXISTS(SELECT 1 FROM wl_people WHERE id=? AND revision=?)',person,revision),
  field==='legalName' ? stmt(env,'UPDATE wl_people SET legal_name=? WHERE id=?',value,person) : field==='preferredName' ? stmt(env,'UPDATE wl_people SET preferred_name=? WHERE id=?',value,person) : stmt(env,`UPDATE wl_person_private SET ${field}=? WHERE person_id=?`,value,person),
  stmt(env,'UPDATE wl_people SET revision=?,updated_at=? WHERE id=?',next,now(),person)],{actor:actor.id,action:'person.field',subject:person,detail:{field}})
 return {id:person,revision:next}
}
