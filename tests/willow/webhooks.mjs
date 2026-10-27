// Real Worker and durable D1 queue; only the remote receiver is a network-edge fake.
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { fixture, day } from './regression-fixture.mjs'
import { verifyWillowWebhook } from '../../public/willow-webhook-verifier.mjs'
import { signatureWebhookProof } from './sign-webhooks.mjs'

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
 await webhookBrowserProof(h,owner,fx.staff.hr.cookie,hook.data.id,'consent')
 if(process.env.WILLOW_LEVELS_BROWSER!=='1') {
  const response=await h.raw('/app/do/webhook.approve',{cookie:owner,form:new URLSearchParams({webhook:hook.data.id,consent:'yes',returnTo:'/app/settings/webhooks'})})
  assert.equal(response.status,303)
 }
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
 await webhookBrowserProof(h,owner,fx.staff.hr.cookie,hook.data.id,'replay')
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')await api('webhook.replay',{delivery:failed.id})
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
 await webhookBrowserProof(h,owner,fx.staff.hr.cookie,hook.data.id,'stop')
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')await api('webhook.disable',{webhook:hook.data.id})
 await fx.join('synthetic-willow-15019',{locationId:location.id})
 await api('webhook.run',{})
 assert.equal(deliveries.length,count,'Owner stop prevents new deliveries')
 await api('webhook.approve',{webhook:hook.data.id,consent:true})
 await api('apiKey.revoke',{credential:key.id})
 await fx.join('synthetic-willow-15011',{locationId:location.id})
 await api('webhook.run',{})
 assert.equal(deliveries.length,count,'Revoked keys stop queued and new webhook delivery')
 assert.ok(!JSON.stringify(await api('audit')).includes(hook.secret))
 // Global subscriptions are configured by an owner without a portable credential.
 const globalConfig={endpoint:configuration.endpoint,fields:['name','workEmail','private','employment'],events:['employee.created','employee.updated'],monitoredFields:['workEmail']}
 await h.api('webhook.register',fx.staff.hr.cookie,globalConfig,403)
 const global=await api('webhook.register',globalConfig)
 assert.equal(global.data.active,false)
 const globalBefore=deliveries.length
 const globalPerson=await fx.join('synthetic-willow-15100')
 await api('webhook.run',{})
 assert.equal(deliveries.length,globalBefore,'Global registration still requires explicit consent')
 await api('webhook.approve',{webhook:global.data.id},403)
 await webhookBrowserProof(h,owner,fx.staff.hr.cookie,global.data.id,'consent')
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')await api('webhook.approve',{webhook:global.data.id,consent:true})
 const globalNear=await fx.join('synthetic-willow-15101',{locationId:location.id})
 const globalFar=await fx.join('synthetic-willow-15102')
 await api('webhook.run',{})
 assert.deepEqual(deliveries.slice(globalBefore).map(row=>JSON.parse(row.body).data.id).sort(),[globalNear.person,globalFar.person].sort(),'Global authority reaches both locations')
 for(const row of deliveries.slice(globalBefore)) {
  const body=JSON.parse(row.body)
  assert.equal(body.data.employment[0].terms[0].pay.amountCents,8123456)
  assert.ok(body.data.private.phone)
  assert.equal(await verifyWillowWebhook({secret:global.secret,id:row.id,timestamp:row.timestamp,signature:row.signature,body:row.body,seen:new Set()}),true)
 }
 const beforeUpdate=deliveries.length
 let profile=await api('people/'+globalNear.person)
 await api('person.update',{person:globalNear.person,revision:profile.revision,legalName:'synthetic-willow-15106',preferredName:profile.preferredName??'',workEmail:profile.workEmail,employeeNumber:''})
 await api('webhook.run',{})
 assert.equal(deliveries.length,beforeUpdate,'An unmonitored name edit cannot signal a work email change')
 profile=await api('people/'+globalNear.person)
 await api('person.update',{person:globalNear.person,revision:profile.revision,legalName:profile.legalName,preferredName:profile.preferredName??'',workEmail:'synthetic-willow-15103@example.com',employeeNumber:''})
 await api('webhook.run',{})
 assert.equal(deliveries.length,beforeUpdate+1,'A monitored directory field emits an update')
 assert.equal(JSON.parse(deliveries.at(-1).body).data.workEmail,'synthetic-willow-15103@example.com')
 await h.api('webhooks',fx.staff.hr.cookie,undefined,403)
 assert.ok((await api('webhooks')).data.some(row=>row.id===global.data.id&&row.kind==='global'))
 await api('webhook.disable',{webhook:global.data.id})
 await fx.join('synthetic-willow-15104');await api('webhook.run',{})
 assert.equal(deliveries.length,beforeUpdate+1,'Explicit stop also cancels global capture')
 // Future hire and termination each notify when recorded and when due, without repeats.
 const lifecycle=await api('webhook.register',{...globalConfig,fields:['name','status'],events:['employee.created','employee.terminated']})
 await api('webhook.approve',{webhook:lifecycle.data.id,consent:true})
 const lifecycleBefore=deliveries.length
 const upcoming=await fx.join('synthetic-willow-15107',{startDate:day(2)})
 await api('webhook.run',{})
 let observed=deliveries.slice(lifecycleBefore).map(row=>JSON.parse(row.body))
 assert.deepEqual(observed.map(row=>[row.type,row.data.id,row.data.status]),[['employee.created',upcoming.person,'upcoming']])
 await tick(Date.parse(day(1)+'T12:00:00Z'))
 assert.equal(deliveries.length,lifecycleBefore+1,'Future hire does not fire early')
 await tick(Date.parse(day(2)+'T12:00:00Z'))
 observed=deliveries.slice(lifecycleBefore).map(row=>JSON.parse(row.body))
 assert.deepEqual(observed.map(row=>row.type),['employee.created','employee.created'])
 assert.notEqual(observed[0].id,observed[1].id)
 await tick(Date.parse(day(2)+'T13:00:00Z'))
 assert.equal(deliveries.length,lifecycleBefore+2,'Effective hire is durable and unique')
 await api('leaver.start',{period:globalPerson.period,endDate:day(3),reason:'synthetic-willow-15108',template:fx.templates.leaver})
 await api('webhook.run',{})
 assert.equal(deliveries.length,lifecycleBefore+3)
 assert.equal(JSON.parse(deliveries.at(-1).body).type,'employee.terminated')
 await tick(Date.parse(day(3)+'T12:00:00Z'))
 assert.equal(deliveries.length,lifecycleBefore+4)
 assert.equal(JSON.parse(deliveries.at(-1).body).type,'employee.terminated')
 await tick(Date.parse(day(4)+'T12:00:00Z'))
 assert.equal(deliveries.length,lifecycleBefore+4,'Future termination is delivered only once at each boundary')
 await api('webhook.disable',{webhook:lifecycle.data.id})
 let afterLifecycle=deliveries.length
 await webhookSourceProof(h,owner,fx,deliveries,globalPerson)
 afterLifecycle=deliveries.length
 // Losing the creating owner's authority stops a separate global subscription.
 const operators=await (await h.raw('/auth/operators',{cookie:owner})).json()
 const promoted=operators.find(row=>row.email==='managera@example.com')
 assert.equal((await h.raw('/auth/operator/role',{cookie:owner,body:{operatorId:promoted.id,role:'owner'}})).status,200)
 const otherOwner=await h.signIn('managera@example.com')
 const ended=await h.api('webhook.register',otherOwner,globalConfig)
 await h.api('webhook.approve',otherOwner,{webhook:ended.data.id,consent:true})
 assert.equal((await h.raw('/auth/operator/status',{cookie:owner,body:{operatorId:promoted.id,status:'inactive'}})).status,200)
 await fx.join('synthetic-willow-15105');await api('webhook.run',{})
 assert.equal(deliveries.length,afterLifecycle,'Ended creator authority prevents global delivery')
 assert.equal((await api('webhooks')).data.find(row=>row.id===ended.data.id).paused,true)
 await api('webhook.approve',{webhook:ended.data.id,consent:true},403)
 assert.ok(!JSON.stringify(await api('audit')).includes(global.secret))
 console.log('API-003 webhooks: PASS — exact location reach, restricted-field omission, independent HMAC, timestamp and replay checks, durable retries/pause/log/manual replay, future effective event and key revocation')
}

// Extend the existing API-003 journey; all records and approvals use public doors.
async function webhookSourceProof(h,owner,fx,deliveries,former) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const tick=async offset=>{
  const response=await fetch(h.origin+'/cdn-cgi/local/scheduled?time='+Date.parse(day(offset)+'T12:00:00Z')+'&cron='+encodeURIComponent('*/15 * * * *')+'&format=json')
  assert.equal(response.status,200,await response.text())
 }
 const register=async (fields,monitoredFields,events=['employee.updated'])=>{
  const hook=await api('webhook.register',{endpoint:'https://synthetic-willow-15003.example.com/receive',fields,monitoredFields,events})
  await api('webhook.approve',{webhook:hook.data.id,consent:true})
  return hook.data.id
 }
 const person=fx.staff.employee.person
 // Every personal field can be selected independently of unrelated readable fields.
 const values={legalName:'synthetic-willow-15200',preferredName:'synthetic-willow-15201',personal_email:'synthetic-willow-15202@example.com',phone:'synthetic-willow-15203',address:'synthetic-willow-15204',date_of_birth:'1990-02-03',emergency_contact:'synthetic-willow-15205'}
 for(const [field,value] of Object.entries(values)) {
  const id=await register(['name','private'],[field]),before=deliveries.length
  let view=await api('people/'+person)
  await api('person.update',{person,revision:view.revision,legalName:view.legalName,preferredName:view.preferredName??'',workEmail:'synthetic-willow-15206@example.com',employeeNumber:'unmonitored'})
  await api('webhook.run',{})
  assert.equal(deliveries.length,before,'Unrelated directory edits do not signal '+field)
  view=await api('people/'+person)
  await api('person.field',{person,revision:view.revision,field,value})
  await api('webhook.run',{})
  assert.equal(deliveries.length,before+1,'Readable selected field emits exactly once: '+field)
  const body=JSON.parse(deliveries.at(-1).body)
  assert.equal(body.data.id,person)
  assert.equal(field==='legalName'?body.data.name:field==='preferredName'?body.data.name:body.data.private[field],value)
  await api('webhook.disable',{webhook:id})
 }
 // Approval publishes its actual field; merely asking or rejecting sends nothing.
 const approved=await register(['name','legalName'],['legalName']),beforeApproval=deliveries.length
 const change=await h.api('self.request',fx.staff.employee.cookie,{kind:'legalName',legalName:'synthetic-willow-15207'})
 await api('webhook.run',{});assert.equal(deliveries.length,beforeApproval)
 await api('self.decide',{change:change.id,decision:'approve',comment:'synthetic-willow-15208'})
 await api('webhook.run',{})
 assert.equal(deliveries.length,beforeApproval+1,'Approved native legal-name change emits')
 assert.equal(JSON.parse(deliveries.at(-1).body).data.legalName,'synthetic-willow-15207')
 await api('webhook.disable',{webhook:approved})
 // Future typed values have a recorded notification and a distinct effective notification.
 const definition=await api('customField.define',{definition:{key:'synthetic_webhook_number',label:'Synthetic number',classification:'general',type:'number',validation:{min:'0',max:'100'},required:false,employeeRead:true,managerRead:true,effectiveFrom:day(-10)}})
 const typed=await register(['customFields','recordTables'],['customFields','recordTables'])
 const start=deliveries.length
 await api('customField.write',{person,effectiveFrom:day(6),values:{synthetic_webhook_number:'17.5'}})
 const row=await api('recordRow.write',{person,table:'education',effectiveFrom:day(6),values:{institution:'synthetic-willow-15209',credential:'synthetic-willow-15210'}})
 await api('webhook.run',{})
 assert.equal(deliveries.length,start+2,'Both typed sources notify when recorded')
 const recorded=deliveries.slice(start).map(item=>JSON.parse(item.body))
 assert.equal(recorded[0].data.customFields.fields.find(item=>item.key==='synthetic_webhook_number').value,null)
 assert.equal(recorded[1].data.recordTables.tables.find(item=>item.key==='education').rows.length,0)
 await tick(5);assert.equal(deliveries.length,start+2,'Neither typed source fires early')
 await tick(6)
 assert.equal(deliveries.length,start+4,'Both typed sources notify when effective')
 const effective=deliveries.slice(start+2).map(item=>JSON.parse(item.body))
 for(const body of effective) {
  assert.equal(body.data.customFields.fields.find(item=>item.key==='synthetic_webhook_number').value,'17.5')
  assert.equal(body.data.recordTables.tables.find(item=>item.key==='education').rows.find(item=>item.id===row.id).values.institution,'synthetic-willow-15209')
 }
 assert.equal(new Set(deliveries.slice(start).map(item=>item.id)).size,4,'Each source and boundary has its own durable identity')
 await tick(7);assert.equal(deliveries.length,start+4,'Effective typed events do not repeat')
 // Native approval of typed and table requests is also a publication source.
 const typedProposal=await h.api('custom.propose',fx.staff.hr.cookie,{person,field:definition.id,effectiveFrom:day(0),value:'19'})
 await api('self.decide',{change:typedProposal.id,decision:'approve',comment:'synthetic-willow-15211'})
 const tableLevel=await api('level.apply',{review:(await api('level.preview',{kind:'level',name:'synthetic-willow-15216',permissions:['people.manage']})).id})
 const tableKey=await api('apiKey.issue',{name:'synthetic-willow-15217',level:tableLevel.id,writeScopes:['tables.approval'],expiresAt:new Date(Date.now()+30*86400000).toISOString()})
 const tableResponse=await fetch(h.origin+'/api/willow/v1/table-changes',{method:'POST',headers:{authorization:'Bearer '+tableKey.token,'content-type':'application/json'},body:JSON.stringify({person,table:'education',effectiveFrom:day(0),values:{institution:'synthetic-willow-15212',credential:'synthetic-willow-15213'}})})
 assert.equal(tableResponse.status,200)
 const tableProposal=(await tableResponse.json()).data
 await api('self.decide',{change:tableProposal.id,decision:'approve',comment:'synthetic-willow-15214'})
 await api('webhook.run',{})
 assert.equal(deliveries.length,start+6,'Both approved typed sources emit')
 assert.equal(JSON.parse(deliveries.at(-2).body).data.customFields.fields.find(item=>item.key==='synthetic_webhook_number').value,'19')
 assert.equal(JSON.parse(deliveries.at(-1).body).data.recordTables.tables.find(item=>item.key==='education').rows.some(item=>item.values.institution==='synthetic-willow-15212'),true)
 await api('webhook.disable',{webhook:typed})
 // Rehire is independent of employee creation and has both future boundaries.
 const lifecycle=await register(['status'],['status'],['employee.rehired']),startRehire=deliveries.length
 await api('joiner.start',{person:former.person,template:fx.templates.joiner,startDate:day(8),employmentType:'part_time',jobTitle:'synthetic-willow-15215',scheduleId:fx.schedule})
 await api('webhook.run',{})
 assert.deepEqual(deliveries.slice(startRehire).map(item=>[JSON.parse(item.body).type,JSON.parse(item.body).data.id]),[['employee.rehired',former.person]])
 await tick(7);assert.equal(deliveries.length,startRehire+1,'Rehire cannot fire early')
 await tick(8);assert.equal(deliveries.length,startRehire+2)
 assert.notEqual(deliveries[startRehire].id,deliveries[startRehire+1].id)
 await tick(9);assert.equal(deliveries.length,startRehire+2,'Rehire effective delivery is unique')
 await api('webhook.disable',{webhook:lifecycle})
 console.log('API-003 sources: PASS — independently monitored personal fields, approved native sources, typed recorded and effective boundaries, future rehire')
}

async function webhookBrowserProof(h,owner,hr,id,action) {
 const path='/app/settings/webhooks?webhook='+id
 for(const cookie of [hr]) {
  assert.equal((await h.raw(path,{cookie})).status,403,'HR cannot inspect owner webhook configuration')
  await h.api('webhook.disable',cookie,{webhook:id},403)
 }
 const response=await h.raw(path,{cookie:owner})
 assert.equal(response.status,200)
 assert.ok(!(await response.text()).includes('secret_cipher'))
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')return
 const {pathToFileURL}=await import('node:url')
 const {evidenceDirectory}=await import('./evidence.mjs')
 const {chromium}=await import(pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href)
 const browser=await chromium.launch({headless:true,...(process.env.WILLOW_CHROMIUM_PATH?{executablePath:process.env.WILLOW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(owner.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  const page=await context.newPage()
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000})
   assert.equal((await page.goto(h.origin+path)).status(),200)
   await page.evaluate(()=>document.fonts.ready)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Webhook controls fit '+width)
   const tip=page.getByRole('tooltip',{name:'Your tasks'}),bell=page.locator('.bell')
   await bell.hover();await page.waitForTimeout(150);assert.equal(await tip.isVisible(),false)
   await tip.waitFor({state:'visible'});await page.mouse.move(0,0);await bell.focus();assert.equal(await tip.isVisible(),true)
   if(action==='consent')assert.equal(await page.locator('form').filter({has:page.locator('input[name=webhook][value="'+id+'"]')}).getByRole('button',{name:'Activate webhook'}).count(),1)
   if(action==='replay') {await page.getByText('Delivery paused; owner review required',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Replay delivery'}).count(),1)}
   if(action==='stop')assert.equal(await page.getByRole('button',{name:'Stop delivery'}).count(),1)
   await page.screenshot({path:evidenceDirectory+'/API-003-'+id+'-'+action+'-'+width+'.png',fullPage:true})
  }
  const targetForm=page.locator('form').filter({has:page.locator('input[name=webhook][value="'+id+'"]')})
  if(action==='consent')await targetForm.getByRole('checkbox',{name:'I approve sending these permitted fields and events to this destination.'}).check()
  await (action==='replay'?page:targetForm).getByRole('button',{name:action==='consent'?'Activate webhook':action==='replay'?'Replay delivery':'Stop delivery'}).click()
  await page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
  assert.ok(new URL(page.url()).searchParams.has('notice'),page.url())
  assert.equal(await page.locator('form').filter({has:page.locator('input[name=webhook][value="'+id+'"]')}).getByRole('button',{name:action==='stop'?'Activate webhook':'Stop delivery'}).count(),1)
  await context.close()
 } finally {await browser.close()}
 console.log('API-003 browser: PASS — '+action+' native form and tooltip at 1440 and 390')
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
  const fx=await fixture(h,owner)
  await webhookProof(h,owner,fx,deliveries,receiver)
  await signatureWebhookProof(h,owner,fx,deliveries,receiver)
 } finally {await h.close()}
}
