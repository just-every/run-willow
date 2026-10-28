// Additional field modes never disclose another author's confidential inputs.
import type { Bindings } from '../../auth.server'
import { actorFor, can, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { addDays } from '../dates'
import { Input } from '../input'
import { performanceMode, type PerformanceMode } from '../levels/performance'
import { performanceAuthority } from './authority'

export const ENTRY_FIELDS=['feedback','oneOnOneNotes'] as const
type EntryField=typeof ENTRY_FIELDS[number]
const fieldOf=(value:string):EntryField=>{insist((ENTRY_FIELDS as readonly string[]).includes(value),'invalid_performance_field');return value as EntryField}
const mode=(actor:Actor,person:string,field:EntryField):PerformanceMode=>can(actor,'people.manage')?'edit':performanceMode(actor,person,field)
const writable=(value:PerformanceMode)=>value==='edit'||value==='approval'
const readable=(actor:Actor,row:Row)=>can(actor,'people.manage')||actor.id===row.author&&mode(actor,row.person_id,row.field)!=='none'

export async function entryHome(env:Bindings,actor:Actor) {
 const entries=(await all(env,'SELECT e.*,p.legal_name AS person_name FROM wl_performance_entries e JOIN wl_people p ON p.id=e.person_id ORDER BY e.created_at,e.entry_id,e.version')).filter(row=>readable(actor,row))
 const people=await all(env,"SELECT id,COALESCE(NULLIF(preferred_name,''),legal_name) AS name FROM wl_people p WHERE NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=p.id AND r.receipt_id IS NOT NULL) ORDER BY name")
 return {
  fieldEntries:entries.map(row=>({id:row.id,entry:row.entry_id,version:row.version,person:row.person_id,personName:row.person_name,field:row.field,author:row.author,text:row.content,createdAt:row.created_at,
   mayEdit:row.author===actor.id&&writable(mode(actor,row.person_id,row.field))&&!entries.some(next=>next.entry_id===row.entry_id&&next.version>row.version),
   requiresApproval:mode(actor,row.person_id,row.field)==='approval'})),
  entryPeople:Object.fromEntries(ENTRY_FIELDS.map(field=>[field,people.filter(person=>writable(mode(actor,person.id,field))).map(person=>({id:person.id,name:person.name,requiresApproval:mode(actor,person.id,field)==='approval'}))])) as Record<EntryField,{id:string;name:string;requiresApproval:boolean}[]>,
 }
}

async function prepare(env:Bindings,actor:Actor,input:Input,{approved=false,target=newId()}={}) {
 const live=await performanceAuthority(env,actor,!approved);actor=live.actor
 input.only(['returnTo','person','field','text','entry','revision'])
 const field=fieldOf(input.text('field')),person=input.text('person'),text=input.text('text',{max:4000})
 insist(await one(env,'SELECT 1 FROM wl_people WHERE id=?',person),'not_found',404)
 const current=mode(actor,person,field)
 insist(writable(current),'forbidden',403)
 const entry=input.text('entry',{optional:true})||target
 const prior=await one(env,'SELECT * FROM wl_performance_entries WHERE entry_id=? ORDER BY version DESC LIMIT 1',entry)
 insist(!input.provided('entry')||prior,'not_found',404)
 const revision=input.text('revision',{optional:true})
 insist(!prior||prior.author===actor.id&&prior.person_id===person&&prior.field===field,'not_found',404)
 insist(prior?revision===prior.id:!revision,'entry_source_changed',409)
 insist(!await one(env,'SELECT 1 FROM wl_erasure_requests WHERE person_id=? AND receipt_id IS NOT NULL',person),'not_found',404)
 const source=prior?.id??'new',version=(prior?.version??0)+1,id=newId()
 const guards=[...live.guards,guard(env,'entry_person_erased','NOT EXISTS(SELECT 1 FROM wl_erasure_requests WHERE person_id=? AND receipt_id IS NOT NULL)',person),
  guard(env,'entry_source_changed',"COALESCE((SELECT id FROM wl_performance_entries WHERE entry_id=? ORDER BY version DESC LIMIT 1),'new')=?",entry,source)]
 const statement=stmt(env,'INSERT INTO wl_performance_entries VALUES(?,?,?,?,?,?,?,?)',id,entry,version,person,field,actor.id,text,now())
 return {entry,id,person,current,source,guards,statement,before:prior?{text:prior.content,version:prior.version,revision:prior.id}:null,payload:{person,field,text,...prior?{entry,revision}:{}}}
}

export async function savePerformanceEntry(env:Bindings,actor:Actor,input:Input) {
 const p=await prepare(env,actor,input)
 if(p.current==='approval') {
  const id=newId()
  await commit(env,[...p.guards,stmt(env,'INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,requested_by,requested_at,due_date) VALUES(?,?,?,?,?,?,?,?,?,?)',
   id,p.person,'performanceEntry',p.entry,JSON.stringify(p.before),JSON.stringify({payload:p.payload,target:p.entry}),p.source,actor.id,now(),addDays(actor.today,7))],{actor:actor.id,action:'selfChange.request',subject:id,detail:{person:p.person,kind:'performanceEntry'}})
  return {id,entry:p.entry,status:'pending'}
 }
 await commit(env,[...p.guards,p.statement],{actor:actor.id,action:'performance.entry',subject:p.entry,detail:{person:p.person,field:p.payload.field}})
 return {id:p.id,entry:p.entry,status:'applied'}
}

export function readsEntryProposal(actor:Actor,row:Row) {
 const field=fieldOf(JSON.parse(row.after_json).payload.field)
 return can(actor,'people.manage')||actor.id===row.requested_by&&mode(actor,row.person_id,field)!=='none'
}
export async function approveEntryStatements(env:Bindings,reviewer:Actor,row:Row) {
 insist(can(reviewer,'people.manage'),'forbidden',403)
 const member=await one(env,'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?',row.requested_by)
 insist(member,'requester_unavailable',403)
 const requester=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:member.role==='owner',sessionId:''})
 const after=JSON.parse(row.after_json),p=await prepare(env,requester,Input.of(after.payload),{approved:true,target:row.row_id})
 insist(p.entry===row.row_id&&p.person===row.person_id&&p.source===row.source_revision,'entry_source_changed',409)
 return [...p.guards,p.statement]
}
