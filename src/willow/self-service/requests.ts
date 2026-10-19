// SELF-001: proposed bytes never change. HR approval commits the native revision and outcome together.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { commit, guard, insist, newId, now, one, stmt } from '../core'
import { addDays } from '../dates'
import { Input } from '../input'
import { DEPENDENTS, recordTables, validateRowValues } from '../record-tables/schema'
import { personRecordTables, prepareRow } from '../record-tables/rows'
import { handlesSelfExceptions, reviewsSelfChanges } from './view'

export async function proposeSelfChange(env: Bindings, actor: Actor, input: Input) {
 input.only(['returnTo','kind','legalName','row','remove','values','col.name','col.relationship','col.date_of_birth'])
 insist(actor.personId,'person_required',403)
 const kind=input.text('kind'), person=await one(env,'SELECT * FROM wl_people WHERE id=?',actor.personId)
 insist(person,'not_found',404)
 insist(kind==='legalName'||kind==='dependent','invalid_change_kind')
 let before: unknown, after: unknown, source=person.revision, rowId: string|null=null, tableVersion: string|null=null
 if(kind==='legalName') { before={legalName:person.legal_name}; after={legalName:input.text('legalName',{max:160})}; insist(JSON.stringify(before)!==JSON.stringify(after),'nothing_to_change') }
 else {
  const table=(await recordTables(env)).find(t=>t.id===DEPENDENTS)!
  insist(!table.current.retired,'table_retired',409)
  rowId=input.text('row',{optional:true,max:100})||null
  source=String((await one<{n:number}>(env,'SELECT COUNT(*) AS n FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id=v.row_id WHERE r.person_id=? AND r.table_id=?',actor.personId,DEPENDENTS))!.n)
  const record=(await personRecordTables(env,actor,actor.personId)).tables.find(t=>t.id===DEPENDENTS)!
  const row=record.rows.find(r=>r.id===rowId)
  insist(!rowId||row,'not_found',404)
  insist(!input.flag('remove')||row,'row_required')
  before=row?.values??null
  after=input.flag('remove')?null:validateRowValues(table.current.columns,input.has('values')?input.json('values'):Object.fromEntries(table.current.columns.map(c=>[c.key,input.text(`col.${c.key}`,{optional:true,max:10000})])))
  tableVersion=table.current.id
 }
 const id=newId(), at=now(), due=addDays(actor.today,7)
 await commit(env,[stmt(env,'INSERT INTO wl_self_changes (id,person_id,kind,row_id,before_json,after_json,source_revision,table_version_id,requested_by,requested_at,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,actor.personId,kind,rowId,JSON.stringify(before),JSON.stringify(after),source,tableVersion,actor.id,at,due)],
 {actor:actor.id,action:'selfChange.request',subject:id,detail:{person:actor.personId,kind}})
 return {id,status:'pending'}
}

export async function decideSelfChange(env: Bindings, actor: Actor, input: Input) {
 insist(reviewsSelfChanges(actor),'forbidden',403)
 const id=input.text('change'), decision=input.text('decision'), comment=input.text('comment',{max:1000})
 insist(['approve','reject'].includes(decision),'invalid_decision')
 const row=await one(env,'SELECT * FROM wl_self_changes WHERE id=?',id)
 insist(row,'not_found',404)
 insist(actor.id!==row.requested_by && actor.personId!==row.person_id,'self_approval',403)
 const statements=[guard(env,'already_decided','NOT EXISTS(SELECT 1 FROM wl_self_decisions WHERE change_id=?)',id)]
 if(decision==='approve') {
  if(row.kind==='legalName') {
   statements.push(guard(env,'stale','EXISTS(SELECT 1 FROM wl_people WHERE id=? AND revision=?)',row.person_id,row.source_revision),
    stmt(env,'UPDATE wl_people SET legal_name=?,revision=?,updated_at=? WHERE id=?',JSON.parse(row.after_json).legalName,newId(),now(),row.person_id))
  } else {
   statements.push(guard(env,'stale','(SELECT COUNT(*) FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id=v.row_id WHERE r.person_id=? AND r.table_id=?)=?',row.person_id,DEPENDENTS,Number(row.source_revision)),
    guard(env,'table_definition_changed','(SELECT id FROM wl_record_table_versions WHERE table_id=? ORDER BY version DESC LIMIT 1)=?',DEPENDENTS,row.table_version_id))
   const prepared=await prepareRow(env,actor,Input.of({person:row.person_id,table:DEPENDENTS,...(row.row_id?{row:row.row_id}:{}),values:JSON.parse(row.after_json),remove:row.after_json==='null',effectiveFrom:actor.today}))
   statements.push(...prepared.statements)
  }
 }
 statements.push(stmt(env,'INSERT INTO wl_self_decisions VALUES (?,?,?,?,?)',id,decision==='approve'?'approved':'rejected',actor.id,now(),comment))
 await commit(env,statements,{actor:actor.id,action:'selfChange.decide',subject:id,detail:{decision,person:row.person_id}})
 return {id,status:decision==='approve'?'approved':'rejected'}
}

export async function reconcileSelfChange(env: Bindings, actor: Actor, input: Input) {
 insist(handlesSelfExceptions(actor),'forbidden',403)
 const id=input.text('change'),reference=input.text('reference',{max:300})
 await commit(env,[guard(env,'not_open',"EXISTS(SELECT 1 FROM wl_self_decisions WHERE change_id=? AND outcome='approved') AND NOT EXISTS(SELECT 1 FROM wl_self_reconciliation WHERE change_id=?)",id,id),stmt(env,'INSERT INTO wl_self_reconciliation VALUES (?,?,?,?)',id,reference,actor.id,now())],{actor:actor.id,action:'selfChange.reconcile',subject:id})
 return {id,status:'resolved'}
}
