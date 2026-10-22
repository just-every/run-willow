// ROLE-001: additive category reads, independently about self and others.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, insist } from '../core'
import type { Input } from '../input'
import { EVERYONE, levelScopes, scopeMembers, type Scope } from './scope'

export type CategoryMode='none'|'view'|'approval'|'edit'
export const CATEGORY_RANK:Record<CategoryMode,number>={none:0,view:1,approval:2,edit:3}
export interface DocumentRules {self:Record<string,CategoryMode>;others:Record<string,CategoryMode>}
export interface DocumentGrant {level:string;scope:Scope;rules:DocumentRules;people:Set<string>|null}
export const emptyDocumentRules=():DocumentRules=>({self:{},others:{}})
export async function documentRuleRows(env: Bindings) { return all<{level_id:string;relation:'self'|'others';category_id:string;mode:CategoryMode}>(env,'SELECT * FROM wl_level_document_categories') }
export function readDocumentRules(input: Input,categories:{id:string}[]):DocumentRules|undefined {
 const names=categories.flatMap(category=>['self','others'].map(relation=>`documentMode.${relation}.${category.id}`))
 if(!input.provided('documentCategories')&&!names.some(name=>input.provided(name))) return undefined
 const raw=input.provided('documentCategories') ? input.json('documentCategories') : Object.fromEntries(['self','others'].map(relation=>[relation,Object.fromEntries(categories.map(category=>[category.id,input.text(`documentMode.${relation}.${category.id}`,{optional:true})||'none']))]))
 insist(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).every(key=>['self','others'].includes(key)),'invalid_document_rights')
 const rules=raw as Partial<DocumentRules>
 for(const relation of ['self','others'] as const) {
  const value=rules[relation]??{}
  insist(value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([id,mode])=>categories.some(category=>category.id===id)&&['none','view','approval','edit'].includes(mode)),'invalid_document_rights')
 }
 return {self:rules.self??{},others:rules.others??{}}
}
export async function documentGrants(env: Bindings,member:string,person:string|null,date:string):Promise<DocumentGrant[]> {
 const rows=await all<{level_id:string;relation:'self'|'others';category_id:string;mode:CategoryMode}>(env,'SELECT f.* FROM wl_level_document_categories f JOIN wl_member_levels a ON a.level_id=f.level_id WHERE a.member_id=?',member)
 if(!rows.length) return []
 const scopes=await levelScopes(env)
 return Promise.all([...new Set(rows.map(row=>row.level_id))].map(async level=>{
  const scope=scopes.get(level)??EVERYONE,rules=emptyDocumentRules()
  for(const row of rows.filter(row=>row.level_id===level)) rules[row.relation][row.category_id]=row.mode
  return {level,scope,rules,people:scope.kind==='everyone'?null:await scopeMembers(env,date,scope,person)}
 }))
}
export const documentCategoryGrant=(actor:Actor,person:string,category:string)=>actor.documentCategories.some(grant=>actor.personId===person ? CATEGORY_RANK[grant.rules.self[category]??'none']>0 : CATEGORY_RANK[grant.rules.others[category]??'none']>0&&(!grant.people||grant.people.has(person)))
export const anyDocumentCategoryGrant=(actor:Actor,person:string)=>actor.documentCategories.some(grant=>actor.personId===person ? Object.values(grant.rules.self).some(mode=>CATEGORY_RANK[mode]>0) : Object.values(grant.rules.others).some(mode=>CATEGORY_RANK[mode]>0)&&(!grant.people||grant.people.has(person)))
export function documentMode(actor:Actor,person:string,category:string):CategoryMode {
 if(can(actor,'people.manage')) return 'edit'
 const modes=actor.documentCategories.filter(grant=>actor.personId===person || !grant.people || grant.people.has(person)).map(grant=>(actor.personId===person?grant.rules.self:grant.rules.others)[category]??'none')
 return modes.reduce<CategoryMode>((best,mode)=>CATEGORY_RANK[mode]>CATEGORY_RANK[best]?mode:best,'none')
}
