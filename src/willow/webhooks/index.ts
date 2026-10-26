import { readsPersonalField } from '../levels/other-personal'
import type { SelfField } from '../levels/personal'
// Native audit events are the durable source; no employee values are stored in the delivery queue.
import type { Bindings } from '../../auth.server'
import { employerZone, requireOwner, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { today } from '../dates'
import { readsCategory } from '../access'
import type { Input } from '../input'
import { credentialContext, credentialPersonAllowed } from '../api-credentials/principal'
import { assertCredentialCurrent, credentialFence, currentCredentialPrincipal } from '../api-credentials/authenticate'
import { credentialRead } from '../api-credentials/response'
import { levelSessionFence } from '../levels/delegation'
import { protectSecret, recoverSecret, sign } from './crypto'

export const WEBHOOK_EVENTS=['employee.created','employee.updated','employee.terminated','employee.rehired','terms.recorded','terms.effective','timeoff.approved','timeoff.canceled','signature.completed'] as const
const FIELDS=['name','workEmail','status','current','employment','private','pay','leave','documents','customFields','recordTables','compensation']
function endpoint(value:string) {
 let url:URL
 try {url=new URL(value)}catch{insist(false,'invalid_webhook_endpoint')}
 insist(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&(!url.port||url.port==='443')&&/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)&&!/(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname),'invalid_webhook_endpoint')
 return url.href
}
const metadata=(row:Row)=>({id:row.id,credentialId:row.credential_id,endpoint:row.endpoint,fields:JSON.parse(row.fields_json),events:JSON.parse(row.events_json),monitoredFields:JSON.parse(row.monitored_fields_json),active:!!row.active,paused:!!row.paused,failures:row.failures,alert:row.paused?'Delivery paused; owner review required':row.active?null:'Owner approval required'})
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
 insist(context&&context.writeScopes.includes('webhooks.manage'),'credential_read_only',403)
 const fields=input.list('fields'),events=input.list('events'),monitored=input.provided('monitoredFields')?input.list('monitoredFields'):fields
 insist(monitored.length>0&&new Set(monitored).size===monitored.length&&monitored.every(field=>FIELDS.includes(field)),'invalid_monitored_fields')
 insist(fields.length>0&&new Set(fields).size===fields.length&&fields.every(field=>FIELDS.includes(field)),'invalid_webhook_fields')
 insist(events.length>0&&new Set(events).size===events.length&&events.every(event=>(WEBHOOK_EVENTS as readonly string[]).includes(event)),'invalid_webhook_events')
 const url=endpoint(input.text('endpoint',{max:2000})),id=newId(),secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
 const cursor=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 await commit(env,[credentialFence(env,actor),stmt(env,'INSERT INTO wl_webhooks(id,credential_id,endpoint,secret_cipher,fields_json,events_json,monitored_fields_json,cursor,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,context.id,url,await protectSecret(env,secret),JSON.stringify(fields),JSON.stringify(events),JSON.stringify(monitored),cursor,now())],{actor:actor.id,action:'webhook.register',subject:id,detail:{credential:context.id,fields,events}})
 return {apiVersion:'1',data:{id,active:false,approvalRequired:true},secret}
}
export async function approveWebhook(env:Bindings,actor:Actor,input:Input) {
 requireOwner(actor);input.only(['webhook','consent','returnTo'])
 insist(input.flag('consent'),'webhook_consent_required',403)
 const id=input.text('webhook'),row=await one(env,'SELECT * FROM wl_webhooks WHERE id=?',id)
 insist(row,'not_found',404)
 const principal=await currentCredentialPrincipal(env,row.credential_id)
 insist(credentialContext(principal)!.writeScopes.includes('webhooks.manage'),'credential_read_only',403)
 await commit(env,[levelSessionFence(env,actor),credentialFence(env,principal),stmt(env,'UPDATE wl_webhooks SET active=1,paused=0,failures=0,approved_by=?,approved_at=?,cursor=(SELECT COALESCE(MAX(seq),0) FROM wl_audit) WHERE id=?',actor.id,now(),id)],{actor:actor.id,action:'webhook.approve',subject:id,detail:{endpoint:row.endpoint,fields:JSON.parse(row.fields_json),events:JSON.parse(row.events_json),monitoredFields:JSON.parse(row.monitored_fields_json),consent:true}})
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
 const id=input.text('delivery'),row=await one(env,'SELECT d.*,w.credential_id,w.active FROM wl_webhook_deliveries d JOIN wl_webhooks w ON w.id=d.webhook_id WHERE d.id=?',id)
 insist(row&&row.active,'not_found',404)
 insist(['failed','uncertain'].includes(row.status),'webhook_not_replayable',409)
 const principal=await currentCredentialPrincipal(env,row.credential_id)
 insist(credentialPersonAllowed(principal,row.person_id),'not_found',404)
 if(row.event_type==='signature.completed')insist(await deliverySignature(env,row,principal),'not_found',404)
 await commit(env,[levelSessionFence(env,actor),credentialFence(env,principal),guard(env,'stale',"EXISTS(SELECT 1 FROM wl_webhook_deliveries WHERE id=? AND status IN ('failed','uncertain'))",id),stmt(env,"UPDATE wl_webhook_deliveries SET status='pending',attempts=0,due_at=?,response_code=NULL WHERE id=?",now(),id),stmt(env,'UPDATE wl_webhooks SET paused=0,failures=0 WHERE id=?',row.webhook_id)],{actor:actor.id,action:'webhook.replay',subject:id})
 return {id,status:'pending'}
}
async function eventsFor(env:Bindings,audit:Row,date:string) {
 const detail=JSON.parse(audit.detail),events:{type:string;person:string;date:string;fields?:string[]}[]=[]
 if(['joiner.start','joiner.rehire','leaver.start'].includes(audit.action)) events.push({type:audit.action==='joiner.start'?'employee.created':audit.action==='joiner.rehire'?'employee.rehired':'employee.terminated',person:audit.subject,date})
 else if(audit.action==='terms.schedule') {
  const row=await one(env,'SELECT p.person_id,t.effective_from FROM wl_terms t JOIN wl_periods p ON p.id=t.period_id WHERE t.id=? AND t.status=\'active\'',audit.subject)
  if(row)events.push({type:'terms.recorded',person:row.person_id,date},{type:'terms.effective',person:row.person_id,date:row.effective_from})
 } else if(['person.update','person.field','customField.write','recordRow.write','recordRow.remove'].includes(audit.action)) {
  const fields=audit.action==='customField.write'?['customFields']:audit.action.startsWith('recordRow.')?['recordTables']:(audit.action==='person.field'?[detail.field]:detail.changed??[]).map((field:string)=>['legalName','preferredName'].includes(field)?'name':['personal_email','phone','address','date_of_birth','emergency_contact'].includes(field)?'private':field)
  events.push({type:'employee.updated',person:audit.subject,date,fields})
 }
 else if(audit.action==='selfChange.decide'&&detail.decision==='approve')events.push({type:'employee.updated',person:detail.person,date})
 else if(['leave.approve','leave.cancel','leave.withdraw'].includes(audit.action)) {
  const row=await one(env,'SELECT person_id FROM wl_leave_requests WHERE id=?',audit.subject)
  if(row)events.push({type:audit.action==='leave.approve'?'timeoff.approved':'timeoff.canceled',person:row.person_id,date})
 }
 else if(audit.action==='signature.sign'&&detail.state==='signed') {
  const completed=await completedSignature(env,audit.subject)
  if(completed)events.push({type:'signature.completed',person:completed.person_id,date})
 }
 return events
}
async function ingest(env:Bindings,hook:Row,instant:number,date:string,actor:Actor) {
 const audits=await all(env,'SELECT seq,action,subject,detail FROM wl_audit WHERE seq>? ORDER BY seq LIMIT 200',hook.cursor)
 if(!audits.length)return
 const events=JSON.parse(hook.events_json) as string[],statements:D1PreparedStatement[]=[]
 for(const audit of audits)for(const event of await eventsFor(env,audit,date)) {
  if(!events.includes(event.type))continue
  if(event.type==='signature.completed') {
   const completed=await completedSignature(env,audit.subject)
   if(!completed||!credentialPersonAllowed(actor,event.person)||!readsCategory(actor,event.person,completed))continue
  }
  if(event.type==='employee.updated'&&event.fields&&!event.fields.some(field=>(JSON.parse(hook.monitored_fields_json) as string[]).includes(field)))continue
  statements.push(stmt(env,'INSERT OR IGNORE INTO wl_webhook_deliveries(id,webhook_id,event_key,event_type,person_id,source_seq,due_on,due_at,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM wl_people WHERE id=?)',newId(),hook.id,event.type==='signature.completed'?event.type+':'+audit.subject:audit.seq+':'+event.type,event.type,event.person,audit.seq,event.date,instant,instant,event.person))
 }
 await commit(env,[guard(env,'stale','EXISTS(SELECT 1 FROM wl_webhooks WHERE id=? AND cursor=? AND active=1 AND paused=0)',hook.id,hook.cursor),...statements,stmt(env,'UPDATE wl_webhooks SET cursor=? WHERE id=?',audits.at(-1)!.seq,hook.id)],{actor:'scheduler',action:'webhook.capture.read',subject:hook.id})
}
async function dispatch(env:Bindings,hook:Row,delivery:Row,instant:number) {
 let actor:Actor
 try {actor=await currentCredentialPrincipal(env,hook.credential_id,instant)}catch{
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
  const url=new URL('/api/willow/people/'+delivery.person_id,env.AUTH_ORIGIN)
  record=await credentialRead(env,actor,new Request(url),url) as Row
 }catch {await stmt(env,"UPDATE wl_webhook_deliveries SET status='canceled',completed_at=? WHERE id=?",instant,delivery.id).run();return}
 if(delivery.event_type==='employee.updated') {
  const source=await one(env,'SELECT seq,action,subject,detail FROM wl_audit WHERE seq=?',delivery.source_seq)
  const detail=source?JSON.parse(source.detail):{},monitored=JSON.parse(hook.monitored_fields_json) as string[]
  const changed=source?.action==='person.field'?[detail.field]:source?.action==='person.update'?detail.changed??[]:[]
  const personal=['legalName','preferredName','personal_email','phone','address','date_of_birth','emergency_contact']
  let readable=changed.some((field:string)=>personal.includes(field)?readsPersonalField(actor,delivery.person_id,field as SelfField)&&monitored.includes(['legalName','preferredName'].includes(field)?'name':'private'):monitored.includes(field)&&Object.hasOwn(record,field))
  if(source?.action==='customField.write')readable=monitored.includes('customFields')&&(record.customFields?.fields??[]).some((field:Row)=>(detail.fields??[]).includes(field.key))
  if(source?.action?.startsWith('recordRow.'))readable=monitored.includes('recordTables')&&(record.recordTables?.tables??[]).some((table:Row)=>table.key===detail.table)
  if(source?.action==='selfChange.decide') {
   const proposal=await one(env,'SELECT kind,row_id FROM wl_self_changes WHERE id=?',source.subject)
   const field=proposal?.row_id
   readable=proposal?.kind==='personal'&&personal.includes(field)&&readsPersonalField(actor,delivery.person_id,field as SelfField)&&monitored.includes(['legalName','preferredName'].includes(field)?'name':'private')
  }
  if(!readable){await stmt(env,"UPDATE wl_webhook_deliveries SET status='canceled',completed_at=? WHERE id=?",instant,delivery.id).run();return}
 }
 const data:Row={id:delivery.person_id},withheld:string[]=[]
 for(const field of JSON.parse(hook.fields_json) as string[])if(Object.hasOwn(record,field))data[field]=record[field];else withheld.push(field)
 if(completed)data.signature={request:completed.id,template:completed.template_id,cohort:completed.cohort,completedAt:completed.completed_at}
 const body=JSON.stringify({id:delivery.id,type:delivery.event_type,data,withheld}),timestamp=String(Math.floor(instant/1000))
 const secret=await recoverSecret(env,hook.secret_cipher),signature=await sign(secret,delivery.id,timestamp,body)
 await assertCredentialCurrent(env,actor)
 try {
  await commit(env,[credentialFence(env,actor),guard(env,'stale',"EXISTS(SELECT 1 FROM wl_webhook_deliveries d JOIN wl_webhooks w ON w.id=d.webhook_id WHERE d.id=? AND d.status IN ('pending','failed') AND w.active=1 AND w.paused=0)",delivery.id),stmt(env,"UPDATE wl_webhook_deliveries SET status='sending',attempts=attempts+1,due_at=? WHERE id=?",instant,delivery.id)],{actor:'scheduler',action:'webhook.claim.read',subject:delivery.id})
 }catch{return}
 await assertCredentialCurrent(env,actor)
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
  try {actor=await currentCredentialPrincipal(env,hook.credential_id,instant)}catch {await stmt(env,'UPDATE wl_webhooks SET active=0,paused=1 WHERE id=?',hook.id).run();continue}
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
