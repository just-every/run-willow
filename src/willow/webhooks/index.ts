import { readsPersonalField } from '../levels/other-personal'
import type { SelfField } from '../levels/personal'
// Native audit events are the durable source; no employee values are stored in the delivery queue.
import type { Bindings } from '../../auth.server'
import { actorFor, employerZone, requireOwner, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { today } from '../dates'
import { readsCategory } from '../access'
import type { Input } from '../input'
import { credentialContext, credentialPersonAllowed } from '../api-credentials/principal'
import { assertCredentialCurrent, credentialFence, currentCredentialPrincipal } from '../api-credentials/authenticate'
import { personView } from '../profile'
import { credentialRead } from '../api-credentials/response'
import { levelSessionFence } from '../levels/delegation'
import { protectSecret, recoverSecret, sign } from './crypto'

export const WEBHOOK_EVENTS=['employee.created','employee.updated','employee.terminated','employee.rehired','terms.recorded','terms.effective','timeoff.approved','timeoff.canceled','signature.completed'] as const
const FIELDS=['name','legalName','preferredName','workEmail','employeeNumber','status','current','employment','private','pay','leave','documents','customFields','recordTables','compensation']
const MONITORED_FIELDS=[...FIELDS,'personal_email','phone','address','date_of_birth','emergency_contact']
// Global subscriptions retain explicit owner authority, never a portable session.
const globals=new WeakMap<Actor,{version:number;snapshot:number}>()
const snapshot=async(env:Bindings)=>(await one(env,"SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit WHERE action NOT LIKE '%.read' AND action<>'document.download'"))!.seq
async function hookPrincipal(env:Bindings,hook:Row,instant?:number) {
 if(!hook.global_member)return currentCredentialPrincipal(env,hook.credential_id,instant)
 const member=await one(env,"SELECT m.*,o.version FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active' AND o.role='owner' AND o.version=?",hook.global_member,hook.global_version)
 insist(member,'access_changed',403)
 const actor=await actorFor(env,{id:member.id,email:member.email,name:member.name,personId:member.person_id,owner:true,sessionId:''})
 actor.today=today(await employerZone(env),instant)
 globals.set(actor,{version:member.version,snapshot:await snapshot(env)})
 return actor
}
function hookFence(env:Bindings,actor:Actor) {
 const global=globals.get(actor)
 return global?guard(env,'access_changed',"EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active' AND o.role='owner' AND o.version=?) AND (SELECT COALESCE(MAX(seq),0) FROM wl_audit WHERE action NOT LIKE '%.read' AND action<>'document.download')=?",actor.id,global.version,global.snapshot):credentialFence(env,actor)
}
async function assertHookCurrent(env:Bindings,actor:Actor) {
 if(!globals.has(actor))return assertCredentialCurrent(env,actor)
 const global=globals.get(actor)!
 insist(await snapshot(env)===global.snapshot&&await one(env,"SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active' AND o.role='owner' AND o.version=?",actor.id,global.version),'access_changed',403)
}
function endpoint(value:string) {
 let url:URL
 try {url=new URL(value)}catch{insist(false,'invalid_webhook_endpoint')}
 insist(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&(!url.port||url.port==='443')&&/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)&&!/(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname),'invalid_webhook_endpoint')
 return url.href
}
const metadata=(row:Row)=>({id:row.id,kind:row.global_member?'global':'permissioned',credentialId:row.credential_id,endpoint:row.endpoint,fields:JSON.parse(row.fields_json),events:JSON.parse(row.events_json),monitoredFields:JSON.parse(row.monitored_fields_json),active:!!row.active,paused:!!row.paused,failures:row.failures,alert:row.paused?'Delivery paused; owner review required':row.active?null:'Owner approval required'})
// Check execution evidence in SQL; certificate content and signing values never enter webhook custody.
async function completedSignature(env:Bindings,request:string) {
 return one(env,`SELECT r.id,r.person_id,r.template_id,r.cohort,t.category_id,c.subject_reads,c.manager_reads,
 json_extract(r.certificate,'$.completedAt') AS completed_at
 FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id JOIN wl_doc_categories c ON c.id=t.category_id
 JOIN wl_documents d ON d.id=r.document_id AND d.person_id=r.person_id AND d.category_id=t.category_id
 JOIN wl_document_versions v ON v.id=r.sealed_version AND v.document_id=d.id
 WHERE r.id=? AND r.state='signed' AND r.sealed_version IS NOT NULL
 AND json_extract(r.certificate,'$.request')=r.id AND json_extract(r.certificate,'$.template')=t.id
 AND json_extract(r.certificate,'$.sha256')=r.rendered_sha256 AND v.sha256=r.rendered_sha256 AND v.size=r.rendered_size
 AND json_type(r.certificate,'$.completedAt') IN ('integer','real')
 AND json_array_length(r.certificate,'$.signers')=json_array_length(t.signers_json)
 AND (SELECT COUNT(*) FROM wl_sign_events e WHERE e.request_id=r.id AND e.kind='sign')=json_array_length(t.signers_json)`,request)
}
async function deliverySignature(env:Bindings,delivery:Row,actor:Actor) {
 const source=await one(env,"SELECT subject FROM wl_audit WHERE seq=? AND action='signature.sign' AND json_extract(detail,'$.state')='signed'",delivery.source_seq)
 const completed=source?await completedSignature(env,source.subject):null
 return completed&&completed.person_id===delivery.person_id&&credentialPersonAllowed(actor,completed.person_id)&&readsCategory(actor,completed.person_id,completed)?completed:null
}
export async function registerWebhook(env:Bindings,actor:Actor,input:Input) {
 input.only(['endpoint','fields','events','monitoredFields'])
 const context=credentialContext(actor)
 if(!context)requireOwner(actor)
 else insist(context.writeScopes.includes('webhooks.manage'),'credential_read_only',403)
 const fields=input.list('fields'),events=input.list('events'),monitored=input.provided('monitoredFields')?input.list('monitoredFields'):fields
 insist(monitored.length>0&&new Set(monitored).size===monitored.length&&monitored.every(field=>MONITORED_FIELDS.includes(field)),'invalid_monitored_fields')
 insist(fields.length>0&&new Set(fields).size===fields.length&&fields.every(field=>FIELDS.includes(field)),'invalid_webhook_fields')
 insist(events.length>0&&new Set(events).size===events.length&&events.every(event=>(WEBHOOK_EVENTS as readonly string[]).includes(event)),'invalid_webhook_events')
 const url=endpoint(input.text('endpoint',{max:2000})),id=newId(),secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
 const cursor=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const owner=context?null:await one(env,"SELECT version FROM oa_operators WHERE lower(email)=? AND role='owner' AND status='active'",actor.email)
 await commit(env,[context?credentialFence(env,actor):levelSessionFence(env,actor),stmt(env,'INSERT INTO wl_webhooks(id,credential_id,global_member,global_version,endpoint,secret_cipher,fields_json,events_json,monitored_fields_json,cursor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,context?.id??null,context?null:actor.id,owner?.version??null,url,await protectSecret(env,secret),JSON.stringify(fields),JSON.stringify(events),JSON.stringify(monitored),cursor,now())],{actor:actor.id,action:'webhook.register',subject:id,detail:{kind:context?'permissioned':'global',credential:context?.id??null,fields,events}})
 return {apiVersion:'1',data:{id,active:false,approvalRequired:true},secret}
}
export async function approveWebhook(env:Bindings,actor:Actor,input:Input) {
 requireOwner(actor);input.only(['webhook','consent','returnTo'])
 insist(input.flag('consent'),'webhook_consent_required',403)
 const id=input.text('webhook'),row=await one(env,'SELECT * FROM wl_webhooks WHERE id=?',id)
 insist(row,'not_found',404)
 const principal=await hookPrincipal(env,row)
 if(!row.global_member)insist(credentialContext(principal)!.writeScopes.includes('webhooks.manage'),'credential_read_only',403)
 await commit(env,[levelSessionFence(env,actor),hookFence(env,principal),stmt(env,'UPDATE wl_webhooks SET active=1,paused=0,failures=0,approved_by=?,approved_at=?,cursor=(SELECT COALESCE(MAX(seq),0) FROM wl_audit) WHERE id=?',actor.id,now(),id)],{actor:actor.id,action:'webhook.approve',subject:id,detail:{endpoint:row.endpoint,fields:JSON.parse(row.fields_json),events:JSON.parse(row.events_json),monitoredFields:JSON.parse(row.monitored_fields_json),consent:true}})
 return {id,active:true}
}
export async function webhookList(env:Bindings,actor:Actor) {
 const context=credentialContext(actor)
 if(!context)requireOwner(actor)
 const hooks=await all(env,context?'SELECT * FROM wl_webhooks WHERE credential_id=?':'SELECT * FROM wl_webhooks',...(context?[context.id]:[]))
 return {apiVersion:'1',data:hooks.map(metadata)}
}
export async function webhookLog(env:Bindings,actor:Actor,id:string) {
 const context=credentialContext(actor)
 if(!context)requireOwner(actor)
 const hook=await one(env,'SELECT * FROM wl_webhooks WHERE id=?',id)
 insist(hook&&(!context||hook.credential_id===context.id),'not_found',404)
 const rows=await all(env,'SELECT id,event_type,person_id,source_seq,status,attempts,response_code,due_at,completed_at FROM wl_webhook_deliveries WHERE webhook_id=? ORDER BY created_at,id',id)
 const visible=await Promise.all(rows.map(async row=>!context||credentialPersonAllowed(actor,row.person_id)&&(row.event_type!=='signature.completed'||!!await deliverySignature(env,row,actor))))
 return {apiVersion:'1',data:metadata(hook),deliveries:rows.filter((row,index)=>visible[index]).map(row=>({id:row.id,event:row.event_type,status:row.status,attempts:row.attempts,responseCode:row.response_code,dueAt:row.due_at,completedAt:row.completed_at}))}
}
export async function replayWebhook(env:Bindings,actor:Actor,input:Input) {
 requireOwner(actor);input.only(['delivery','returnTo'])
 const id=input.text('delivery'),row=await one(env,'SELECT d.*,w.credential_id,w.global_member,w.global_version,w.active FROM wl_webhook_deliveries d JOIN wl_webhooks w ON w.id=d.webhook_id WHERE d.id=?',id)
 insist(row&&row.active,'not_found',404)
 insist(['failed','uncertain'].includes(row.status),'webhook_not_replayable',409)
 const principal=await hookPrincipal(env,row)
 insist(credentialPersonAllowed(principal,row.person_id),'not_found',404)
 if(row.event_type==='signature.completed')insist(await deliverySignature(env,row,principal),'not_found',404)
 await commit(env,[levelSessionFence(env,actor),hookFence(env,principal),guard(env,'stale',"EXISTS(SELECT 1 FROM wl_webhook_deliveries WHERE id=? AND status IN ('failed','uncertain'))",id),stmt(env,"UPDATE wl_webhook_deliveries SET status='pending',attempts=0,due_at=?,response_code=NULL WHERE id=?",now(),id),stmt(env,'UPDATE wl_webhooks SET paused=0,failures=0 WHERE id=?',row.webhook_id)],{actor:actor.id,action:'webhook.replay',subject:id})
 return {id,status:'pending'}
}
// Resolve the actual published source, including changes approved through the native queue.
async function updateSource(env:Bindings,audit:Row) {
 const detail=JSON.parse(audit.detail)
 if(audit.action==='person.update')return {fields:detail.changed??[],keys:detail.customFieldKeys??[]}
 if(audit.action==='person.field')return {fields:[detail.field]}
 if(audit.action==='customField.write')return {fields:['customFields'],keys:detail.fields??[],effective:detail.effectiveFrom}
 if(audit.action.startsWith('recordRow.'))return {fields:['recordTables'],table:detail.table,effective:detail.effectiveFrom}
 if(audit.action==='selfChange.decide'&&detail.decision==='approve') {
  const proposal=await one(env,'SELECT kind,row_id,after_json FROM wl_self_changes WHERE id=?',audit.subject)
  if(!proposal)return null
  const after=JSON.parse(proposal.after_json)
  if(proposal.kind==='personal'||proposal.kind==='legalName')return {fields:[proposal.kind==='legalName'?'legalName':proposal.row_id]}
  if(proposal.kind==='customField')return {fields:['customFields'],keys:[after.key],effective:after.effectiveFrom}
  if(proposal.kind==='recordRow')return {fields:['recordTables'],table:after.key,effective:after.effectiveFrom}
  if(proposal.kind==='dependent')return {fields:['recordTables'],table:'dependents'}
 }
 return null
}
async function eventsFor(env:Bindings,audit:Row,date:string) {
 const detail=JSON.parse(audit.detail),events:{type:string;person:string;date:string;fields?:string[]}[]=[]
 if(['joiner.start','joiner.rehire','leaver.start'].includes(audit.action)) {
  const type=audit.action==='joiner.start'?'employee.created':audit.action==='joiner.rehire'?'employee.rehired':'employee.terminated'
  events.push({type,person:audit.subject,date})
  const period=await one(env,'SELECT start_date,end_date FROM wl_periods WHERE id=? AND person_id=?',detail.period,audit.subject)
  const effective=audit.action==='leaver.start'?period?.end_date:period?.start_date
  if(effective&&effective>date)events.push({type,person:audit.subject,date:effective})
 }
 else if(audit.action==='terms.schedule') {
  const row=await one(env,"SELECT p.person_id,t.effective_from FROM wl_terms t JOIN wl_periods p ON p.id=t.period_id WHERE t.id=? AND t.status='active'",audit.subject)
  if(row)events.push({type:'terms.recorded',person:row.person_id,date},{type:'terms.effective',person:row.person_id,date:row.effective_from})
 } else {
  const source=await updateSource(env,audit)
  if(source) {
   const fields=source.fields.flatMap((field:string)=>['legalName','preferredName'].includes(field)?[field,'name']:['personal_email','phone','address','date_of_birth','emergency_contact'].includes(field)?[field,'private']:[field])
   const person=audit.action==='selfChange.decide'?detail.person:audit.subject
   events.push({type:'employee.updated',person,date,fields})
   if(source.effective&&source.effective>date)events.push({type:'employee.updated',person,date:source.effective,fields})
  } else if(['leave.approve','leave.cancel','leave.withdraw'].includes(audit.action)) {
   const row=await one(env,'SELECT person_id FROM wl_leave_requests WHERE id=?',audit.subject)
   if(row)events.push({type:audit.action==='leave.approve'?'timeoff.approved':'timeoff.canceled',person:row.person_id,date})
  } else if(audit.action==='signature.sign'&&detail.state==='signed') {
   const completed=await completedSignature(env,audit.subject)
   if(completed)events.push({type:'signature.completed',person:completed.person_id,date})
  }
 }
 return events
}
async function hookRecord(env:Bindings,actor:Actor,person:string):Promise<Row> {
 const url=new URL('/api/willow/people/'+person,env.AUTH_ORIGIN)
 return globals.has(actor)?await personView(env,actor,person):await credentialRead(env,actor,new Request(url),url) as Row
}
async function readableUpdate(env:Bindings,actor:Actor,person:string,audit:Row,monitored:string[],record:Row) {
 const changed=await updateSource(env,audit)
 const personal=['legalName','preferredName','personal_email','phone','address','date_of_birth','emergency_contact']
 return !!changed?.fields.some((field:string)=>{
  if(personal.includes(field))return readsPersonalField(actor,person,field as SelfField)&&(monitored.includes(field)||monitored.includes(['legalName','preferredName'].includes(field)?'name':'private'))
  if(field==='customFields')return monitored.includes(field)&&(record.customFields?.fields??[]).some((item:Row)=>(changed.keys??[]).includes(item.key))
  if(field==='recordTables')return monitored.includes(field)&&(record.recordTables?.tables??[]).some((item:Row)=>item.key===changed.table)
  return field==='directory'?monitored.some(value=>['name','legalName','preferredName','workEmail','employeeNumber'].includes(value)&&Object.hasOwn(record,value)):monitored.includes(field)&&Object.hasOwn(record,field)
 })
}
async function ingest(env:Bindings,hook:Row,instant:number,date:string,actor:Actor) {
 const audits=await all(env,'SELECT seq,action,subject,detail FROM wl_audit WHERE seq>? ORDER BY seq LIMIT 200',hook.cursor)
 if(!audits.length)return
 const events=JSON.parse(hook.events_json) as string[],statements:D1PreparedStatement[]=[]
 for(const audit of audits)for(const event of await eventsFor(env,audit,date)) {
  if(!events.includes(event.type)||!credentialPersonAllowed(actor,event.person))continue
  if(event.type==='signature.completed') {
   const completed=await completedSignature(env,audit.subject)
   if(!completed||!credentialPersonAllowed(actor,event.person)||!readsCategory(actor,event.person,completed))continue
  }
  if(event.type==='employee.updated') {
   try {
    if(!await readableUpdate(env,actor,event.person,audit,JSON.parse(hook.monitored_fields_json),await hookRecord(env,actor,event.person)))continue
   }catch {continue}
  }
  statements.push(stmt(env,'INSERT OR IGNORE INTO wl_webhook_deliveries(id,webhook_id,event_key,event_type,person_id,source_seq,due_on,due_at,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM wl_people WHERE id=?)',newId(),hook.id,event.type==='signature.completed'?event.type+':'+audit.subject:audit.seq+':'+event.type+':'+event.date,event.type,event.person,audit.seq,event.date,instant,instant,event.person))
 }
 await commit(env,[hookFence(env,actor),guard(env,'stale','EXISTS(SELECT 1 FROM wl_webhooks WHERE id=? AND cursor=? AND active=1 AND paused=0)',hook.id,hook.cursor),...statements,stmt(env,'UPDATE wl_webhooks SET cursor=? WHERE id=?',audits.at(-1)!.seq,hook.id)],{actor:'scheduler',action:'webhook.capture.read',subject:hook.id})
}
async function dispatch(env:Bindings,hook:Row,delivery:Row,instant:number) {
 let actor:Actor
 try {actor=await hookPrincipal(env,hook,instant)}catch{
  await stmt(env,'UPDATE wl_webhooks SET active=0,paused=1 WHERE id=?',hook.id).run();return
 }
 if(!credentialPersonAllowed(actor,delivery.person_id)) {await stmt(env,"UPDATE wl_webhook_deliveries SET status='canceled',completed_at=? WHERE id=?",instant,delivery.id).run();return}
 const completed=delivery.event_type==='signature.completed'?await deliverySignature(env,delivery,actor):null
 if(delivery.event_type==='signature.completed'&&!completed) {await stmt(env,"UPDATE wl_webhook_deliveries SET status='canceled',completed_at=? WHERE id=?",instant,delivery.id).run();return}
 if(delivery.event_type==='terms.effective'&&!await one(env,"SELECT 1 FROM wl_audit a JOIN wl_terms t ON t.id=a.subject WHERE a.seq=? AND t.status='active'",delivery.source_seq)) {
  await stmt(env,"UPDATE wl_webhook_deliveries SET status='canceled',completed_at=? WHERE id=?",instant,delivery.id).run();return
 }
 let record:Row
 try {
  record=await hookRecord(env,actor,delivery.person_id)
 }catch {await stmt(env,"UPDATE wl_webhook_deliveries SET status='canceled',completed_at=? WHERE id=?",instant,delivery.id).run();return}
 if(delivery.event_type==='employee.updated') {
  const source=await one(env,'SELECT seq,action,subject,detail FROM wl_audit WHERE seq=?',delivery.source_seq)
  const readable=source&&await readableUpdate(env,actor,delivery.person_id,source,JSON.parse(hook.monitored_fields_json),record)
  if(!readable){await stmt(env,"UPDATE wl_webhook_deliveries SET status='canceled',completed_at=? WHERE id=?",instant,delivery.id).run();return}
 }
 const data:Row={id:delivery.person_id},withheld:string[]=[]
 for(const field of JSON.parse(hook.fields_json) as string[])if(Object.hasOwn(record,field))data[field]=record[field];else withheld.push(field)
 if(completed)data.signature={request:completed.id,template:completed.template_id,cohort:completed.cohort,completedAt:completed.completed_at}
 const body=JSON.stringify({id:delivery.id,type:delivery.event_type,data,withheld}),timestamp=String(Math.floor(instant/1000))
 const secret=await recoverSecret(env,hook.secret_cipher),signature=await sign(secret,delivery.id,timestamp,body)
 await assertHookCurrent(env,actor)
 try {
  await commit(env,[hookFence(env,actor),guard(env,'stale',"EXISTS(SELECT 1 FROM wl_webhook_deliveries d JOIN wl_webhooks w ON w.id=d.webhook_id WHERE d.id=? AND d.status IN ('pending','failed') AND w.active=1 AND w.paused=0)",delivery.id),stmt(env,"UPDATE wl_webhook_deliveries SET status='sending',attempts=attempts+1,due_at=? WHERE id=?",instant,delivery.id)],{actor:'scheduler',action:'webhook.claim.read',subject:delivery.id})
 }catch{return}
 await assertHookCurrent(env,actor)
 let code:number|null=null,status='uncertain'
 try {
  const response=await fetch(hook.endpoint,{method:'POST',redirect:'manual',headers:{'content-type':'application/json','webhook-id':delivery.id,'webhook-timestamp':timestamp,'webhook-signature':signature},body,signal:AbortSignal.timeout(10000)})
  code=response.status;status=response.ok?'delivered':'failed';await response.body?.cancel()
 }catch {/* An uncertain request is paused for explicit replay instead of a blind duplicate. */}
 const attempt=delivery.attempts+1,pause=status==='uncertain'||status==='failed'&&attempt>=3
 await commit(env,[stmt(env,'UPDATE wl_webhook_deliveries SET status=?,response_code=?,due_at=?,completed_at=? WHERE id=?',status,code,instant+[60000,300000,1800000][Math.min(attempt-1,2)],status==='delivered'?instant:null,delivery.id),stmt(env,'UPDATE wl_webhooks SET failures=CASE WHEN ?=\'delivered\' THEN 0 ELSE failures+1 END,paused=CASE WHEN ? THEN 1 ELSE paused END WHERE id=?',status,+pause,hook.id)],{actor:'scheduler',action:'webhook.delivery.read',subject:delivery.id,detail:{status,responseCode:code}})
}
export async function runWebhookScheduler(env:Bindings,instant=now()) {
 const date=today(await employerZone(env),instant)
 for(const hook of await all(env,'SELECT * FROM wl_webhooks WHERE active=1 AND paused=0 ORDER BY id')) {
  let actor:Actor
  try {actor=await hookPrincipal(env,hook,instant)}catch {await stmt(env,'UPDATE wl_webhooks SET active=0,paused=1 WHERE id=?',hook.id).run();continue}
  await ingest(env,hook,instant,date,actor)
  // A crashed claim has an uncertain outcome; only explicit owner replay may resume it.
  await stmt(env,"UPDATE wl_webhook_deliveries SET status='uncertain' WHERE webhook_id=? AND status='sending' AND due_at<?",hook.id,instant-300000).run()
  if(await one(env,"SELECT 1 FROM wl_webhook_deliveries WHERE webhook_id=? AND status='uncertain'",hook.id)) {await stmt(env,'UPDATE wl_webhooks SET paused=1 WHERE id=?',hook.id).run();continue}
  for(const row of await all(env,"SELECT * FROM wl_webhook_deliveries WHERE webhook_id=? AND status IN ('pending','failed') AND due_at<=? AND due_on<=? ORDER BY source_seq,id LIMIT 30",hook.id,instant,date)) {
   if((await one(env,'SELECT paused FROM wl_webhooks WHERE id=?',hook.id))?.paused)break
   await dispatch(env,hook,row,instant)
  }
 }
}
export async function runWebhooksNow(env:Bindings,actor:Actor) {requireOwner(actor);await runWebhookScheduler(env);return {ok:true}}

export async function disableWebhook(env:Bindings,actor:Actor,input:Input) {
 requireOwner(actor);input.only(['webhook','returnTo'])
 const id=input.text('webhook')
 insist(await one(env,'SELECT id FROM wl_webhooks WHERE id=?',id),'not_found',404)
 await commit(env,[levelSessionFence(env,actor),stmt(env,'UPDATE wl_webhooks SET active=0,paused=0 WHERE id=?',id),stmt(env,"UPDATE wl_webhook_deliveries SET status='canceled',completed_at=? WHERE webhook_id=? AND status IN ('pending','failed')",now(),id)],{actor:actor.id,action:'webhook.disable',subject:id})
 return {id,active:false}
}
