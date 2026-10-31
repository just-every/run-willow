import { msg } from '../locale/runtime'
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all } from '../core'
import { readsCustomField } from '../custom-fields/read'
import { effectiveFieldDefinitions, writesCustomField } from '../custom-fields/store'
import { field, form, h, hidden, select } from './html'

/** Proposing never supplies a write right: these are the native writer's existing fields. */
export async function customApprovalForms(env: Bindings, actor: Actor) {
 if(!can(actor,'people.manage'))return h``
 const definitions=(await effectiveFieldDefinitions(env,actor.today)).filter(item=>!item.retired&&writesCustomField(actor,item))
 const people=await all(env,'SELECT id,COALESCE(preferred_name,legal_name) AS name FROM wl_people WHERE NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL) ORDER BY legal_name')
 return definitions.length?h`<section class="card"><h2>Propose a custom field change</h2><p>Each proposal saves one field for review. Its value stays unchanged until another eligible person approves it.</p>${definitions.map(definition=>{
  const choices=people.filter(person=>readsCustomField(actor,person.id,definition)).map(person=>({value:person.id,label:person.name}))
  if(!choices.length)return h``
  const value=definition.type==='boolean'?select('New value','fieldValue',[{value:'true',label:msg('Yes')},{value:'false',label:msg('No')}],'',{required:definition.required,blank:'Not recorded'}):definition.type==='select'?select('New value','fieldValue',definition.validation.options,'',{required:definition.required,blank:'Not recorded'}):field('New value','fieldValue',{required:definition.required,type:definition.type==='date'?'date':'text'})
  return h`<details><summary>${definition.label}</summary>${form('custom.propose','/app/self-changes/{id}',[hidden('field',definition.id),select('Person','person',choices),field('Effective from','effectiveFrom',{type:'date',value:actor.today}),value],'Submit for review')}</details>`
 })}</section>`:h``
}
