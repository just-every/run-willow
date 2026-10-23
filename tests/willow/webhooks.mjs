// Real Worker and durable D1 queue; only the remote receiver is a network-edge fake.
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { fixture, day } from './regression-fixture.mjs'
import { verifyWillowWebhook } from '../../public/willow-webhook-verifier.mjs'

export async function webhookProof(h,owner,fx,deliveries,receiver) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const apply=async plan=>api('level.apply',{review:(await api('level.preview',plan)).id})
 const location=await api('location.create',{name:'synthetic-willow-15000',timezone:'UTC'})
 const level=await apply({kind:'level',name:'synthetic-willow-15001',permissions:[],scope:{kind:'group',dimensions:{location:[location.id]}}})
 const key=await api('apiKey.issue',{name:'synthetic-willow-15002',level:level.id,writeScopes:['webhooks.manage'],expiresAt:new Date(Date.now()+30*86400000).toISOString()})
 const call=async(path,body,status=200)=>{
  const response=await fetch(h.origin+'/api/willow/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
  const value=await response.json()
  assert.equal(response.status,status,JSON.stringify(value))
  return value
 }
 const configuration={endpoint:'https://synthetic-willow-15003.example.com/receive',fields:['name','status','current','private','pay'],events:['employee.created','employee.updated','employee.terminated','terms.recorded','terms.effective'],monitoredFields:['name','private']}
 await call('webhooks',{...configuration,endpoint:'http://127.0.0.1/receive'},400)
 const hook=await call('webhooks',configuration)
 assert.equal(hook.data.active,false)
 assert.ok(hook.secret)
 assert.ok(!JSON.stringify(await call('webhooks')).includes(hook.secret))
 await fx.join('synthetic-willow-15013',{locationId:location.id})
 await api('webhook.run',{})
 assert.equal(deliveries.length,0,'Registration cannot send before explicit owner consent')
 await api('webhook.approve',{webhook:hook.data.id},403)
 await h.api('webhook.approve',fx.staff.hr.cookie,{webhook:hook.data.id,consent:true},403)
 await api('webhook.approve',{webhook:hook.data.id,consent:true})
 const near=await fx.join('synthetic-willow-15004',{locationId:location.id,phone:'synthetic-willow-15005',payAmount:'93456.78'})
 await fx.join('synthetic-willow-15006')
 await api('webhook.run',{})
 assert.equal(deliveries.length,1,'Only the scoped hire reaches the receiver')
 const created=deliveries[0],payload=JSON.parse(created.body)
 assert.equal(payload.type,'employee.created');assert.equal(payload.data.id,near.person)
 assert.equal(payload.data.private,undefined);assert.equal(payload.data.pay,undefined)
 assert.ok(payload.withheld.includes('private')&&payload.withheld.includes('pay'))
 assert.ok(!created.body.includes('93456.78')&&!created.body.includes('synthetic-willow-15005'))
 const proof={secret:hook.secret,id:created.id,timestamp:created.timestamp,signature:created.signature,body:created.body}
 const seen=new Set()
 assert.equal(await verifyWillowWebhook({...proof,seen}),true)
 assert.equal(await verifyWillowWebhook({...proof,seen}),false,'Receiver rejects an event ID already consumed')
 assert.equal(await verifyWillowWebhook({...proof,seen:new Set(),now:Number(created.timestamp)*1000+301000}),false,'Receiver rejects a captured stale event')
 assert.equal(await verifyWillowWebhook({...proof,body:created.body+' ',seen:new Set()}),false)
 // A hidden monitored edit does not disclose that the field changed.
 const view=await api('people/'+near.person)
 await api('person.field',{person:near.person,revision:view.revision,field:'phone',value:'synthetic-willow-15014'})
 await api('webhook.run',{})
 assert.equal(deliveries.length,1,'An unreadable monitored field cannot emit an update signal')
 const next=await api('people/'+near.person)
 await api('person.field',{person:near.person,revision:next.revision,field:'preferredName',value:'synthetic-willow-15015'})
 await api('webhook.run',{})
 assert.equal(deliveries.length,2)
 assert.equal(JSON.parse(deliveries.at(-1).body).type,'employee.updated')
 assert.equal(JSON.parse(deliveries.at(-1).body).data.name,'synthetic-willow-15015')
 // A definite receiver refusal retries durably, pauses at three failures and supports explicit replay.
 receiver.status=503
 await api('leaver.start',{period:near.period,endDate:day(0),reason:'synthetic-willow-15007',template:fx.templates.leaver})
 await api('webhook.run',{})
 const failed=deliveries.at(-1)
 assert.equal(JSON.parse(failed.body).type,'employee.terminated')
 const tick=async time=>{
  const response=await fetch(h.origin+'/cdn-cgi/local/scheduled?time='+time+'&cron='+encodeURIComponent('*/15 * * * *')+'&format=json')
  assert.equal(response.status,200,await response.text())
 }
 const base=Date.now()
 await tick(base+61000)
 await tick(base+362000)
 let log=await call('webhooks/'+hook.data.id+'/deliveries')
 assert.equal(log.data.paused,true)
 const record=log.deliveries.find(row=>row.id===failed.id)
 assert.equal(record.attempts,3);assert.equal(record.responseCode,503)
 assert.ok(log.data.alert)
 receiver.status=204
 await api('webhook.replay',{delivery:failed.id})
 await api('webhook.run',{})
 log=await call('webhooks/'+hook.data.id+'/deliveries')
 assert.equal(log.deliveries.find(row=>row.id===failed.id).status,'delivered')
 assert.equal(deliveries.at(-1).id,failed.id,'Manual replay keeps the durable event identity')
 // Future native terms changes have a recorded event and a separately due effective event.
 const future=await fx.join('synthetic-willow-15008',{locationId:location.id})
 await api('mover.schedule',{period:future.period,effectiveFrom:day(1),jobTitle:'synthetic-willow-15009',reason:'synthetic-willow-15010'})
 await api('webhook.run',{})
 assert.ok(deliveries.some(row=>JSON.parse(row.body).type==='terms.recorded'))
 assert.ok(!deliveries.some(row=>JSON.parse(row.body).type==='terms.effective'))
 const canceled=await api('mover.schedule',{period:future.period,effectiveFrom:day(2),jobTitle:'synthetic-willow-15016',reason:'synthetic-willow-15017'})
 await api('webhook.run',{})
 await api('terms.cancel',{terms:canceled.terms,reason:'synthetic-willow-15018'})
 await tick(base+3*86400000+600000)
 assert.equal(deliveries.filter(row=>JSON.parse(row.body).type==='terms.effective').length,1)
 const count=deliveries.length
 await api('apiKey.revoke',{credential:key.id})
 await fx.join('synthetic-willow-15011',{locationId:location.id})
 await api('webhook.run',{})
 assert.equal(deliveries.length,count,'Revoked keys stop queued and new webhook delivery')
 assert.ok(!JSON.stringify(await api('audit')).includes(hook.secret))
 console.log('API-003 webhooks: PASS — exact location reach, restricted-field omission, independent HMAC, timestamp and replay checks, durable retries/pause/log/manual replay, future effective event and key revocation')
}

if(import.meta.url==='file://'+process.argv[1]) {
 const deliveries=[],receiver={status:204}
 const h=await harness({scheduled:true,provider:async request=>{
  if(new URL(request.url).hostname==='synthetic-willow-15003.example.com') {
   deliveries.push({id:request.headers.get('webhook-id'),timestamp:request.headers.get('webhook-timestamp'),signature:request.headers.get('webhook-signature'),body:await request.text()})
   return new Response(null,{status:receiver.status})
  }
  return new Response(null,{status:202})
 }})
 try {
  assert.equal((await h.raw('/auth/bootstrap',{body:{token:h.vars.SETUP_TOKEN,displayName:'synthetic-willow-15012'}})).status,303)
  const owner=await h.signIn(h.vars.OWNER_EMAIL)
  assert.equal((await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})).status,303)
  await webhookProof(h,owner,await fixture(h,owner),deliveries,receiver)
 } finally {await h.close()}
}
