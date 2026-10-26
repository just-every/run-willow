// A filter resolves once at preview time; the audited snapshot fences later changes.
import { administratesPerson } from './delegation'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { insist } from '../core'
import type { Input } from '../input'
import { directoryFilters, filterDirectory } from '../organization'
import { directory } from '../profile'

export async function bulkSelection(env: Bindings, actor: Actor, input: Input, members: Record<string,any>[]) {
 const selection=input.text('selection',{optional:true})
 insist(!selection||selection==='filter','invalid_selection')
 const keys=['q','name','location','department','role','status']
 if(selection!=='filter') {
  insist(!keys.some(key=>input.has(key)),'mixed_selection')
  return {members:[...new Set(input.list('members'))].sort()}
 }
 insist(!input.list('members').length,'mixed_selection')
 const filter=Object.fromEntries(keys.map(key=>[key,input.text(key,{optional:true})]))
 const filters=directoryFilters(new URLSearchParams(filter),actor.today)
 const people=new Set(filterDirectory(await directory(env,actor),filters).map(person=>person.id))
 return {filter:{...filter,status:filters.status},members:members.filter(member=>member.id!==actor.id&&administratesPerson(actor,member.person_id)&&member.status==='active'&&!member.owner&&people.has(member.person_id)).map(member=>member.id).sort()}
}
