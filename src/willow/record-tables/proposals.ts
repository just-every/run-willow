// API row requests share native validation and the immutable HR proposal queue.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { credentialContext, credentialPersonAllowed } from '../api-credentials/principal'
import { currentCredentialPrincipal, credentialFence } from '../api-credentials/authenticate'
import { commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { addDays } from '../dates'
import { Input } from '../input'
import { liveApprovalActor } from '../levels/approvals'
import { prepareRow, personRecordTables } from './rows'
import { recordTables, readsTable, writesTable, validateRowValues } from './schema'

async function requester(env: Bindings, actor: Pick<Actor,'id'|'sessionId'>) {
 if(actor.id.startsWith('credential:')) {
  const current=await currentCredentialPrincipal(env,actor.id.slice(11))
  return {actor:current,guards:[credentialFence(env,current)]}
 }
 return liveApprovalActor(env,actor)
}
const countRows=async(env:Bindings,person:string,table:string)=>(await one<{n:number}>(env,'SELECT COUNT(*) AS n FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id=v.row_id WHERE r.person_id=? AND r.table_id=?',person,table))!.n

export async function proposeRecordRow(env:Bindings,actor:Actor,input:Input) {
 input.only(['person','table','row','effectiveFrom','values','remove','returnTo'])
 const live=await requester(env,actor);actor=live.actor
 const person=input.text('person'),table=(await recordTables(env)).find(table=>table.id===input.text('table')||table.key===input.text('table'))
 insist(credentialPersonAllowed(actor,person),'not_found',404)
 insist(!credentialContext(actor)||credentialContext(actor)!.writeScopes.includes('tables.approval'),'credential_read_only',403)
 insist(table&&readsTable(actor,person,table)&&writesTable(actor,person,table),'forbidden',403)
 insist(await one(env,'SELECT 1 FROM wl_people WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)',person),'not_found',404)
 input.text('effectiveFrom')
 const prepared=await prepareRow(env,actor,input),row=input.text('row',{optional:true})||null
 const projected=(await personRecordTables(env,actor,person,prepared.result.effectiveFrom,{audit:false})).tables.find(item=>item.id===table.id)!
 const before=[...projected.rows,...projected.formerRows].find(item=>item.id===row)?.values??null
 const values=input.flag('remove')?null:validateRowValues(table.current.columns,input.json('values')),id=newId(),source=String(await countRows(env,person,table.id))
 const current=await requester(env,actor)
 insist(writesTable(current.actor,person,table),'forbidden',403)
 await commit(env,[...live.guards,...current.guards,guard(env,'table_definition_changed','(SELECT id FROM wl_record_table_versions WHERE table_id=? ORDER BY version DESC LIMIT 1)=?',table.id,table.current.id),guard(env,'stale','(SELECT COUNT(*) FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id=v.row_id WHERE r.person_id=? AND r.table_id=?)=?',person,table.id,Number(source)),stmt(env,'INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,table_version_id,requested_by,requested_at,due_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,person,'recordRow',row,JSON.stringify(before),JSON.stringify({table:table.id,key:table.key,label:table.current.label,row,effectiveFrom:prepared.result.effectiveFrom,values,remove:input.flag('remove')}),source,table.current.id,actor.id,now(),addDays(actor.today,7))],{actor:actor.id,action:'selfChange.request',subject:id,detail:{person,kind:'recordRow',table:table.key}})
 return {id,status:'pending'}
}

export async function approveRecordRowStatements(env:Bindings,reviewer:Actor,row:Row) {
 const after=JSON.parse(row.after_json),live=await requester(env,{id:row.requested_by,sessionId:''})
 const table=(await recordTables(env)).find(table=>table.id===after.table)
 insist(table&&table.current.id===row.table_version_id,'table_definition_changed',409)
 insist(credentialPersonAllowed(live.actor,row.person_id)&&writesTable(live.actor,row.person_id,table)&&readsTable(live.actor,row.person_id,table),'record_approval_unavailable',403)
 const prepared=await prepareRow(env,reviewer,Input.of({person:row.person_id,table:after.table,...(after.row?{row:after.row}:{}),effectiveFrom:after.effectiveFrom,values:after.values,remove:after.remove}))
 return [...live.guards,guard(env,'stale','(SELECT COUNT(*) FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id=v.row_id WHERE r.person_id=? AND r.table_id=?)=?',row.person_id,after.table,Number(row.source_revision)),...prepared.statements]
}
