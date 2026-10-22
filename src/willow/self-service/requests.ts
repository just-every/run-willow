// SELF-001: proposed bytes never change. HR approval commits the native revision and outcome together.
import { approveDocumentStatements, documentReviewAuthority, reviewsDocumentChange } from '../document-write'
import { otherPersonalFence } from '../levels/other-personal'
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { scopeFence } from '../levels/scope'
import { commit, guard, insist, newId, now, one, stmt } from '../core'
import { addDays } from '../dates'
import { Input } from '../input'
import { DEPENDENTS, recordTables, validateRowValues } from '../record-tables/schema'
import { personRecordTables, prepareRow } from '../record-tables/rows'
import { personView } from '../profile'
import { approvePersonalStatements, personalField, personalModeSnapshot, personalValue } from './personal'
import { handlesSelfExceptions, reviewsSelfChanges, reviewsChange, SELF_CHANGE_SELECT } from './view'

export async function proposeSelfChange(env: Bindings, actor: Actor, input: Input) {
 const kind=input.text('kind')
 input.only(kind==='personal' ? ['returnTo','kind','person','field','value'] : ['returnTo','kind','legalName','row','remove','values','col.name','col.relationship','col.date_of_birth'])
 const personId=kind==='personal' && input.provided('person') ? input.text('person') : actor.personId
 insist(personId,'person_required',403)
 const person=await one(env,'SELECT * FROM wl_people WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)',personId)
 insist(person,'not_found',404)
 insist(kind==='legalName'||kind==='dependent'||kind==='personal','invalid_change_kind')
 const guards: D1PreparedStatement[]=[]
 let before: unknown, after: unknown, source=person.revision, rowId: string|null=null, tableVersion: string|null=null
 if(kind==='legalName') { guards.push(await personalModeSnapshot(env,actor,'legalName')); before={legalName:person.legal_name}; after={legalName:input.text('legalName',{max:160})}; insist(JSON.stringify(before)!==JSON.stringify(after),'nothing_to_change') }
 else if(kind==='personal') {
  const field=personalField(input.text('field')), value=personalValue(input,field)
  const view=await personView(env,actor,personId)
  guards.push(personId===actor.personId ? await personalModeSnapshot(env,actor,field) : await otherPersonalFence(env,actor,personId,field,'approval'),guard(env,'stale','EXISTS(SELECT 1 FROM wl_people WHERE id=? AND revision=?)',personId,source))
  before={[field]:field==='preferredName'?view.preferredName:(view.private as Record<string,unknown>)[field]}
  after={[field]:value}
  rowId=field
  insist(JSON.stringify(before)!==JSON.stringify(after),'nothing_to_change')
 } else {
  const table=(await recordTables(env)).find(t=>t.id===DEPENDENTS)!
  insist(!table.current.retired,'table_retired',409)
  rowId=input.text('row',{optional:true,max:100})||null
  source=String((await one<{n:number}>(env,'SELECT COUNT(*) AS n FROM wl_record_row_versions v JOIN wl_record_rows r ON r.id=v.row_id WHERE r.person_id=? AND r.table_id=?',actor.personId,DEPENDENTS))!.n)
  const record=(await personRecordTables(env,actor,personId)).tables.find(t=>t.id===DEPENDENTS)!
  const row=record.rows.find(r=>r.id===rowId)
  insist(!rowId||row,'not_found',404)
  insist(!input.flag('remove')||row,'row_required')
  before=row?.values??null
  after=input.flag('remove')?null:validateRowValues(table.current.columns,input.has('values')?input.json('values'):Object.fromEntries(table.current.columns.map(c=>[c.key,input.text(`col.${c.key}`,{optional:true,max:10000})])))
  tableVersion=table.current.id
 }
 const id=newId(), at=now(), due=addDays(actor.today,7)
 await commit(env,[...guards,stmt(env,'INSERT INTO wl_self_changes (id,person_id,kind,row_id,before_json,after_json,source_revision,table_version_id,requested_by,requested_at,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,personId,kind,rowId,JSON.stringify(before),JSON.stringify(after),source,tableVersion,actor.id,at,due)],
 {actor:actor.id,action:'selfChange.request',subject:id,detail:{person:personId,kind}})
 return {id,status:'pending'}
}

export async function decideSelfChange(env: Bindings, actor: Actor, input: Input) {
 const id=input.text('change'), decision=input.text('decision'), comment=input.text('comment',{max:1000})
 insist(['approve','reject'].includes(decision),'invalid_decision')
 const row=await one(env,`${SELF_CHANGE_SELECT} WHERE c.id=?`,id)
 insist(row,'not_found',404)
 insist(reviewsChange(actor,row),'forbidden',403)
 insist(actor.id!==row.requested_by && actor.personId!==row.person_id,'self_approval',403)
 // A scoped reviewer is rechecked against fresh terms inside the write (ROLE-002).
 const statements=[...(row.kind==='document'?await documentReviewAuthority(env,actor,row):await scopeFence(env,actor,row.person_id,'people.manage','people.private')),guard(env,'already_decided','NOT EXISTS(SELECT 1 FROM wl_self_decisions WHERE change_id=?)',id)]
 if(decision==='approve') {
  if(row.kind==='document') {
   statements.push(...await approveDocumentStatements(env,actor,row))
  } else if(row.kind==='legalName') {
   statements.push(...await approvePersonalStatements(env,actor,{...row,row_id:'legalName'}))
  } else if(row.kind==='personal') {
   statements.push(...await approvePersonalStatements(env,actor,row))
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
 const id=input.text('change'),reference=input.text('reference',{max:300})
 const change=await one(env,`${SELF_CHANGE_SELECT} WHERE c.id=?`,id)
 insist(change,'not_found',404)
 insist(change.kind==='document'?reviewsDocumentChange(actor,change):handlesSelfExceptions(actor,change.person_id),'forbidden',403)
 await commit(env,[...(change.kind==='document'?await documentReviewAuthority(env,actor,change):can(actor,'payroll.handoff')&&can(actor,'pay.read') ? [] : await scopeFence(env,actor,change.person_id,'people.manage','people.private')),guard(env,'not_open',"EXISTS(SELECT 1 FROM wl_self_decisions WHERE change_id=? AND outcome='approved') AND NOT EXISTS(SELECT 1 FROM wl_self_reconciliation WHERE change_id=?)",id,id),stmt(env,'INSERT INTO wl_self_reconciliation VALUES (?,?,?,?)',id,reference,actor.id,now())],{actor:actor.id,action:'selfChange.reconcile',subject:id})
 return {id,status:'resolved'}
}
