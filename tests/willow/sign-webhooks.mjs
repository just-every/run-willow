// Observed native completion uses API-003's existing consented, scoped delivery queue.
import assert from 'node:assert/strict'
import { PDFDocument,StandardFonts } from 'pdf-lib'
import { file } from './harness.mjs'
import { verifyWillowWebhook } from '../../public/willow-webhook-verifier.mjs'

export async function signatureWebhookProof(h,owner,fx,deliveries,receiver) {
 const api=(path,body,status)=>h.api(path,owner,body,status),as=(cookie,path,body,status)=>h.api(path,cookie,body,status)
 const apply=async plan=>api('level.apply',{review:(await api('level.preview',plan)).id})
 const location=await api('location.create',{name:'synthetic-willow-15400',timezone:'UTC'})
 const near=await fx.join('synthetic-willow-15401',{locationId:location.id}),outside=await fx.join('synthetic-willow-15402')
 for(const person of [near,outside])await api('access.give',{person:person.person})
 near.cookie=await h.signIn('synthetic-willow-15401@example.com',{requested:true})
 outside.cookie=await h.signIn('synthetic-willow-15402@example.com',{requested:true})
 const category=await api('category.create',{name:'synthetic-willow-15403',subjectReads:true})
 const hiddenCategory=await api('category.create',{name:'synthetic-willow-15404',subjectReads:true})
 const folder=await api('company.folder',{name:'synthetic-willow-15405',audience:{kind:'everyone',id:null}})
 const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica)
 document.addPage([612,792]).drawText('synthetic-willow-15406',{x:40,y:730,font,size:14})
 const source=await api('company.file',{folder:folder.id,title:'synthetic-willow-15407',file:file('policy.pdf',await document.save())})
 const fields=[{signer:0,kind:'signature',page:1,x:.1,y:.6,width:.3,height:.1},{signer:1,kind:'signature',page:1,x:.5,y:.6,width:.3,height:.1}]
 const template=async category=>{
  const created=await api('signature.template',{source:source.versionId,title:'synthetic-willow-15408',category,signers:['employee','hr'],fields})
  const row=(await api('signature-templates')).find(t=>t.id===created.id)
  await api('signature.template.approve',{template:row.id,digest:row.digest,reviewed:true});return row.id
 }
 const allowedTemplate=await template(category.id),hiddenTemplate=await template(hiddenCategory.id)
 const scope={kind:'group',dimensions:{location:[location.id]}}
 const level=await apply({kind:'level',name:'synthetic-willow-15409',permissions:[],scope,documentCategories:{others:{[category.id]:'view'}}})
 const key=await api('apiKey.issue',{name:'synthetic-willow-15410',level:level.id,writeScopes:['webhooks.manage'],expiresAt:new Date(Date.now()+30*86400000).toISOString()})
 const call=async(path,body,status=200)=>{
  const response=await fetch(h.origin+'/api/willow/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
  const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value
 }
 const hook=await call('webhooks',{endpoint:'https://synthetic-willow-15003.example.com/receive',fields:['name','private','pay'],events:['signature.completed']})
 const baseline=deliveries.length
 await api('webhook.run',{});assert.equal(deliveries.length,baseline)
 await api('webhook.approve',{webhook:hook.data.id,consent:true})
 const issue=async(template,people)=>{
  const review=await api('signature.preview',{template,people,hr:fx.staff.hr.member,expiresAt:Date.now()+7*86400000})
  return api('signature.send',{review:review.id,digest:review.digest,approved:true})
 }
 const sign=async(cookie,id,name)=>{
  const request=await as(cookie,'signature-requests/'+id),base={request:id,revision:request.revision,digest:request.digest}
  const payload=await as(cookie,'signature.prepare',{...base,name})
  return as(cookie,'signature.act',{...base,action:'sign',consent:true,payload:payload.id})
 }
 const finish=async(person,id)=>{await sign(person.cookie,id,'synthetic-willow-15411');await sign(fx.staff.hr.cookie,id,'synthetic-willow-15412')}
 const pending=await issue(allowedTemplate,[near.person]),cancelled=await issue(allowedTemplate,[near.person])
 await sign(near.cookie,pending.requests[0],'synthetic-willow-15411')
 await api('signature.cancel',{cohort:cancelled.id})
 await api('webhook.run',{})
 assert.equal(deliveries.length,baseline,'Partial signatures and cancellation never emit completion')
 const hidden=await issue(hiddenTemplate,[near.person]),elsewhere=await issue(allowedTemplate,[outside.person])
 await finish(near,hidden.requests[0]);await finish(outside,elsewhere.requests[0])
 await api('webhook.run',{})
 assert.equal(deliveries.length,baseline,'Current category and credential population both govern completion signals')
 assert.deepEqual((await call('webhooks/'+hook.data.id+'/deliveries')).deliveries,[],'A forbidden completion does not enter the credential log')
 receiver.status=503
 await sign(fx.staff.hr.cookie,pending.requests[0],'synthetic-willow-15412')
 await api('webhook.run',{})
 assert.equal(deliveries.length,baseline+1)
 const observed=deliveries.at(-1),payload=JSON.parse(observed.body),completed=await api('signature-requests/'+pending.requests[0])
 assert.equal(completed.state,'signed');assert.ok(completed.sealedVersion)
 assert.equal(payload.type,'signature.completed');assert.equal(payload.data.id,near.person)
 assert.equal(payload.data.signature.request,pending.requests[0]);assert.equal(payload.data.signature.template,allowedTemplate)
 assert.equal(payload.data.signature.cohort,pending.id);assert.equal(payload.data.signature.completedAt,completed.certificate.completedAt)
 assert.deepEqual(Object.keys(payload.data.signature).sort(),['cohort','completedAt','request','template'])
 for(const value of ['synthetic-willow-15411','synthetic-willow-15412',completed.digest,'certificate','sessionBinding','values','signers'])assert.ok(!observed.body.includes(value))
 assert.ok(payload.withheld.includes('private')&&payload.withheld.includes('pay'))
 const proof={secret:hook.secret,id:observed.id,timestamp:observed.timestamp,signature:observed.signature,body:observed.body},seen=new Set()
 assert.equal(await verifyWillowWebhook({...proof,seen}),true);assert.equal(await verifyWillowWebhook({...proof,seen}),false)
 await api('webhook.run',{});assert.equal(deliveries.length,baseline+1,'The failed attempt waits for its existing due time or explicit replay')
 receiver.status=204
 await api('webhook.replay',{delivery:observed.id});await api('webhook.run',{})
 assert.equal(deliveries.length,baseline+2);assert.equal(deliveries.at(-1).id,observed.id)
 await api('webhook.run',{});assert.equal(deliveries.length,baseline+2,'A delivered completion has one durable event identity')
 assert.equal((await call('webhooks/'+hook.data.id+'/deliveries')).deliveries.length,1)
 const blocked=await issue(allowedTemplate,[near.person]);await finish(near,blocked.requests[0])
 receiver.status=503;await api('webhook.run',{});const failed=deliveries.at(-1)
 const count=deliveries.length
 await apply({kind:'level',level:level.id,name:'synthetic-willow-15409',permissions:[],scope,documentCategories:{others:{[category.id]:'none'}}})
 await api('webhook.replay',{delivery:failed.id},401)
 receiver.status=204;await api('webhook.run',{})
 assert.equal(deliveries.length,count,'Loss of the category level invalidates the credential before replay or retry')
 console.log('Signature completion webhooks: PASS — observed final state only, category/population boundaries, protected payload, signed deduplication, durable replay and authority loss')
}
