// ROLE-001: explicit personal write modes. No rows means the existing self-service right.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, insist } from '../core'
import type { Input } from '../input'

export const SELF_FIELDS = ['preferredName','personal_email','phone','address','date_of_birth','emergency_contact'] as const
export type SelfField = typeof SELF_FIELDS[number]
export type SelfMode = 'view' | 'approval' | 'edit'
export type SelfRules = Partial<Record<SelfField, SelfMode>>
export const SELF_LABELS: Record<SelfField,string> = {preferredName:'Preferred name',personal_email:'Personal email',phone:'Phone',address:'Home address',date_of_birth:'Date of birth',emergency_contact:'Emergency contact'}
const rank: Record<SelfMode,number> = {view:0,approval:1,edit:2}
export function combineSelfRules(rules: SelfRules[]): Record<SelfField,SelfMode> {
 return Object.fromEntries(SELF_FIELDS.map(field=>{
  const modes=rules.map(rule=>rule[field]).filter((mode): mode is SelfMode=>!!mode)
  return [field,modes.length ? modes.reduce((a,b)=>rank[a]>rank[b]?a:b) : 'edit']
 })) as Record<SelfField,SelfMode>
}
export function readSelfRules(input: Input): SelfRules | undefined {
 const names=SELF_FIELDS.map(field=>`selfMode.${field}`)
 if(!input.provided('selfFields')&&!names.some(name=>input.provided(name))) return undefined
 const value=input.provided('selfFields') ? input.json('selfFields') : Object.fromEntries(SELF_FIELDS.map(field=>[field,input.text(`selfMode.${field}`,{optional:true})]).filter(([,mode])=>mode))
 insist(value && typeof value==='object'&&!Array.isArray(value),'invalid_self_fields')
 const entries=Object.entries(value as Record<string,unknown>)
 insist(entries.every(([field,mode])=>(SELF_FIELDS as readonly string[]).includes(field)&&['view','approval','edit'].includes(String(mode))),'invalid_self_fields')
 return Object.fromEntries(entries) as SelfRules
}
export async function selfWriteModes(env: Bindings, actor: Actor) {
 if(actor.owner) return combineSelfRules([])
 const rows=await all<{field:SelfField;mode:SelfMode}>(env,`SELECT f.field,f.mode FROM wl_level_self_fields f JOIN wl_member_levels a ON a.level_id=f.level_id WHERE a.member_id=?`,actor.id)
 return combineSelfRules(rows.map(row=>({[row.field]:row.mode})))
}
