// Versioned transport proof uses a real Worker and the schema served to integrators.
import assert from 'node:assert/strict'
import Ajv from 'ajv/dist/2020.js'
import { day } from './regression-fixture.mjs'

export async function apiRosterProof(h,owner,fx) {
 await nativeRequestUpgradeProof()
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const apply=async plan=>api('level.apply',{review:(await api('level.preview',plan)).id})
 const location=await api('location.create',{name:'synthetic-willow-14000',timezone:'UTC'})
 const near=await fx.join('synthetic-willow-14001',{locationId:location.id,phone:'synthetic-willow-14002',payAmount:'93456.78'})
 const second=await fx.join('synthetic-willow-14003',{locationId:location.id})
 const far=await fx.join('synthetic-willow-14004')
 const distant=await fx.join('synthetic-willow-14028')
 await fx.account(near.period)
 const account=await fx.account(second.period)
 const request=await api('leave.request',{account,startDate:day(2),endDate:day(2),reason:'synthetic-willow-14020'})
 const category=await api('category.create',{name:'synthetic-willow-14021'})
 const file={filename:'synthetic-willow-14022.txt',base64:Buffer.from('synthetic-willow-14023').toString('base64')}
 const document=await api('document.add',{person:second.person,category:category.id,title:'synthetic-willow-14024',file})
 const outsideDocument=await api('document.add',{person:distant.person,category:category.id,title:'synthetic-willow-14025',file})
 // Populate every native field type and table history before validating the published transport.
 const typed=[['text',{maxLength:80},'synthetic-willow-14030'],['number',{min:'0',max:'100'},'12.34567890123456789'],['date',{},day(-1)],['boolean',{},false],['select',{options:[{value:'one',label:'synthetic-willow-14031'}]},'one']]
 const customValues={}
 for(const [index,[type,validation,value]] of typed.entries()) {
  const field='synthetic_willow_'+(14030+index)
  await api('customField.define',{definition:{key:field,label:field,classification:'general',type,validation,effectiveFrom:day(-30),required:false,employeeRead:false,managerRead:false,retired:false}})
  customValues[field]=value
 }
 const privateField='synthetic_willow_14040'
 await api('customField.define',{definition:{key:privateField,label:privateField,classification:'hr',type:'text',validation:{maxLength:80},effectiveFrom:day(-30),required:false,employeeRead:false,managerRead:false,retired:false}})
 await api('customField.write',{person:second.person,effectiveFrom:day(-10),values:{...customValues,[privateField]:'synthetic-willow-14041'}})
 await api('customField.write',{person:second.person,effectiveFrom:day(-2),values:{synthetic_willow_14030:'synthetic-willow-14042'}})
 const columns=typed.map(([type,validation],index)=>({key:'col_'+index,label:'synthetic-willow-'+(14050+index),type,validation,required:false}))
 const table=await api('recordTable.define',{key:'synthetic_willow_14050',classification:'general',label:'synthetic-willow-14050',columns})
 const tableValues=Object.fromEntries(typed.map(([, ,value],index)=>['col_'+index,value]))
 const tableRow=await api('recordRow.write',{person:second.person,table:table.id,effectiveFrom:day(-10),values:tableValues})
 await api('recordRow.write',{person:second.person,table:table.id,row:tableRow.id,effectiveFrom:day(-2),remove:true})
 await api('recordRow.write',{person:second.person,table:table.id,effectiveFrom:day(-1),values:tableValues})
 await api('recordRow.write',{person:distant.person,table:table.id,values:{...tableValues,col_0:'synthetic-willow-14055'}})
 const plan={kind:'level',name:'synthetic-willow-14005',permissions:['people.manage','leave.manage'],documentCategories:{self:{},others:{[category.id]:'view'}},scope:{kind:'group',dimensions:{location:[location.id]}}}
 const level=await apply(plan)
 const key=await api('apiKey.issue',{name:'synthetic-willow-14006',level:level.id,expiresAt:new Date(Date.now()+86400000).toISOString()})
 const specResponse=await h.raw('/api/willow/v1/openapi.json')
 assert.equal(specResponse.status,200)
 const spec=await specResponse.json(),ajv=new Ajv({strict:false,allErrors:true})
 const validators=new Map()
 const check=(schema,data)=>{
  if(!validators.has(schema))validators.set(schema,ajv.compile({...schema,components:spec.components}))
  const validate=validators.get(schema)
  assert.ok(validate(data),JSON.stringify(validate.errors))
 }
 const get=async(path,status=200,token=key.token)=>{
  const response=await fetch(h.origin+'/api/willow/v1/'+path,{headers:{authorization:'Bearer '+token}})
  assert.equal(response.status,status,path)
  const body=await response.json()
  const template=Object.keys(spec.paths).find(pattern=>new RegExp('^'+pattern.replaceAll('{id}','[^/]+').replaceAll('{key}','[^/]+')+'$').test('/'+path.split('?')[0]))
  const schema=spec.paths[template]?.get.responses[String(status)]?.content['application/json'].schema
  assert.ok(schema,'Every exercised response is published')
  check(schema,body)
  return body
 }
 const fields='name,workEmail,status,current,employment,private,pay,documents,leave,customFields,recordTables'
 const query='employees?fields='+fields+'&limit=1'
 let page=await get(query),rows=[...page.data]
 assert.ok(page.nextCursor)
 assert.equal(page.syncCursor,null)
 const firstCursor=page.nextCursor
 while(page.nextCursor) { page=await get(query+'&cursor='+encodeURIComponent(page.nextCursor));rows.push(...page.data) }
 assert.deepEqual(new Set(rows.map(row=>row.id)),new Set([near.person,second.person]))
 assert.equal(rows.length,2,'A page traversal returns each person once')
 for(const row of rows) {
  assert.equal(row.private,undefined);assert.equal(row.pay,undefined)
  assert.ok(row.withheld.includes('private')&&row.withheld.includes('pay'))
 }
 assert.ok(!JSON.stringify(rows).includes('93456.78')&&!JSON.stringify(rows).includes('synthetic-willow-14002'))
 assert.ok(page.syncCursor)
 const sync=page.syncCursor
 assert.equal((await get(query+'&changedSince='+encodeURIComponent(sync))).data.length,0)
 await get(query+'&cursor='+encodeURIComponent(firstCursor.slice(0,-4)+'xxxx'),400)
 const other=await api('apiKey.issue',{name:'synthetic-willow-14007',level:level.id,expiresAt:new Date(Date.now()+86400000).toISOString()})
 await get(query+'&cursor='+encodeURIComponent(firstCursor),400,other.token)
 await get('employees?limit=0',400)
 await get('employees?fields=synthetic-willow-14008',400)
 await get('employees?secret=1',400)
 await get('employees/'+far.person,404)
 await get('employees/'+near.person+'?fields='+fields)
 // Hire and transfer in after a completed baseline; changed records are unique across pages.
 const hired=await fx.join('synthetic-willow-14009',{locationId:location.id})
 const farView=await api('people/'+far.person)
 await api('mover.schedule',{period:far.period,revision:farView.employment[0].revision,effectiveFrom:day(0),locationId:location.id,reason:'synthetic-willow-14010'})
 await get(query+'&cursor='+encodeURIComponent(firstCursor),409)
 page=await get(query+'&changedSince='+encodeURIComponent(sync));const changed=[...page.data]
 while(page.nextCursor) { page=await get(query+'&cursor='+encodeURIComponent(page.nextCursor));changed.push(...page.data) }
 assert.deepEqual(new Set(changed.map(row=>row.id)),new Set([hired.person,far.person]))
 assert.equal(changed.length,2)
 assert.equal((await get(query+'&changedSince='+encodeURIComponent(page.syncCursor))).data.length,0)
 // A narrower current population demands cache replacement, without revealing a removed identity.
 const away=await api('location.create',{name:'synthetic-willow-14018',timezone:'UTC'})
 const nearView=await api('people/'+near.person)
 await api('mover.schedule',{period:near.period,revision:nearView.employment[0].revision,effectiveFrom:day(0),locationId:away.id,reason:'synthetic-willow-14011'})
 const reset=await get(query+'&changedSince='+encodeURIComponent(page.syncCursor))
 assert.equal(reset.resetRequired,true)
 assert.ok(!JSON.stringify(reset.data).includes(near.person))
 for(const path of ['organization','custom-fields','tables','balances','requests','calendar','documents','access-level', ['tables','education'].join('/')])await get(path)
 const customMetadata=await get('custom-fields')
 assert.equal(customMetadata.data.filter(field=>Object.hasOwn(customValues,field.key)).length,5)
 assert.ok(!JSON.stringify(customMetadata).includes(privateField))
 const populated=(await get('employees/'+second.person+'?fields=customFields,recordTables')).data
 assert.equal(populated.customFields.fields.length,5)
 for(const field of populated.customFields.fields)assert.equal(field.value,field.key==='synthetic_willow_14030'?'synthetic-willow-14042':customValues[field.key])
 assert.equal(populated.customFields.fields.find(field=>field.key==='synthetic_willow_14030').history.length,2)
 assert.ok(!JSON.stringify(populated).includes('synthetic-willow-14041'))
 const projected=populated.recordTables.tables.find(item=>item.id===table.id)
 assert.deepEqual(projected.rows[0].values,tableValues)
 assert.equal(projected.formerRows[0].history.length,2)
 const tableReport=await get('tables/'+table.key)
 assert.deepEqual(tableReport.data.rows.map(row=>row.personId),[second.person])
 assert.deepEqual(tableReport.data.rows[0].values,tableValues)
 assert.ok(!JSON.stringify(tableReport).includes('synthetic-willow-14055'))
 const historical=(await get('employees/'+second.person+'?fields=customFields,recordTables&asOf='+day(-5))).data
 assert.equal(historical.customFields.fields.find(field=>field.key==='synthetic_willow_14030').value,customValues.synthetic_willow_14030)
 assert.equal(historical.recordTables.tables.find(item=>item.id===table.id).rows[0].id,tableRow.id)
 assert.ok((await get('balances')).data.some(row=>row.id===account&&Number.isInteger(row.balanceMinutes)))
 assert.ok((await get('requests')).data.some(row=>row.id===request.id))
 assert.ok((await get('calendar')).data.some(row=>row.personId===second.person&&row.startDate===day(2)))
 assert.deepEqual((await get('documents')).data.map(row=>row.id),[document.id])
 const downloaded=await fetch(h.origin+'/api/willow/v1/documents/'+document.version+'/download',{headers:{authorization:'Bearer '+key.token}})
 assert.equal(downloaded.status,200)
 assert.equal(await downloaded.text(),'synthetic-willow-14023')
 await get('documents/'+outsideDocument.version+'/download',404)
 const payLevel=await apply({kind:'level',name:'synthetic-willow-14026',permissions:['pay.read'],scope:{kind:'group',dimensions:{location:[location.id]}}})
 const payKey=await api('apiKey.issue',{name:'synthetic-willow-14027',level:payLevel.id,expiresAt:new Date(Date.now()+86400000).toISOString()})
 const paid=await get('employees/'+second.person+'?fields=employment,pay',200,payKey.token)
 assert.equal(paid.data.pay,true)
 assert.ok(paid.data.employment.some(period=>period.terms.some(term=>term.pay?.amountCents===8123456)))

 // Optional job and compensation scopes submit native, effective-dated human approval requests.
 const {publishTemplate}=await import('./publish-template.mjs')
 const mover=await publishTemplate(h,owner,{name:'synthetic-willow-14500',kind:'mover',taskTitle:['synthetic-willow-14501'],taskAssignee:['hr'],taskDueDays:['0']})
 for(const requestType of ['job','compensation'])await api('change.chain',{requestType,template:mover.id,stepRole:['hr'],stepMinIncrease:[''],stepLocations:['']})
 const writeLevel=await apply({kind:'level',name:'synthetic-willow-14502',permissions:[],scope:{kind:'group',dimensions:{location:[location.id]}},jobFields:{self:{},others:{jobTitle:'edit',fte:'approval'}},compensationFields:{self:{},others:{pay:'edit'}},leaveFields:{self:{},others:{requests:'view',policies:'view'}},reports:['builtin-headcount']})
 const issueWrite=(writeScopes,credentialType='key')=>api('apiKey.issue',{name:'synthetic-willow-14503',level:writeLevel.id,writeScopes,credentialType,expiresAt:new Date(Date.now()+86400000).toISOString(),...(credentialType==='oauth_client'?{redirectUri:'https://partner.example.test/callback'}:{})})
 const write=async(token,body,status=200)=>{
  const response=await fetch(h.origin+'/api/willow/v1/employment-changes',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)})
  assert.equal(response.status,status,'native employment approval transport: '+await response.clone().text())
  assert.ok(response.headers.has('RateLimit-Limit'))
  const result=await response.json();check(spec.paths['/employment-changes'].post.responses[String(status)].content['application/json'].schema,result);return result.data
 }
 const requestBody={person:second.person,effectiveFrom:day(4),reason:'synthetic-willow-14504',jobTitle:'synthetic-willow-14505'}
 const readOnly=await issueWrite([]),jobOnly=await issueWrite(['job.approval']),payOnly=await issueWrite(['compensation.approval'])
 await write(readOnly.token,requestBody,403)
 await write(payOnly.token,requestBody,403)
 await write(jobOnly.token,{...requestBody,payBasis:'salary',payAmount:'90000.01'},403)
 await write(jobOnly.token,{...requestBody,person:distant.person},404)
 await write(jobOnly.token,{...requestBody,departmentId:location.id},403)
 await write(jobOnly.token,{...requestBody,effectiveFrom:'2026-99-99'},400)
 await write(jobOnly.token,{...requestBody,decision:'approve'},400)
 const jobPending=await write(jobOnly.token,requestBody)
 const queued=(await h.api('change-requests',fx.staff.hr.cookie)).requests.find(row=>row.id===jobPending.id)
 assert.ok(queued);assert.equal(queued.requestedBy,'synthetic-willow-14503')
 const jobDetail=await h.api('change-requests/'+jobPending.id,fx.staff.hr.cookie)
 assert.equal(jobDetail.requestedBy.id,'credential:'+jobOnly.id)
 assert.ok(!(await api('people/'+second.person)).employment[0].terms.some(term=>term.jobTitle===requestBody.jobTitle))
 await apiBrowserProof(h,owner,fx.staff.hr.cookie,jobPending.id,'/app/changes/'+jobPending.id,writeLevel.id)
 await h.api('change.decide',fx.staff.hr.cookie,{request:jobPending.id,revision:String(jobDetail.revision),state:jobDetail.state,decision:'approve',comment:'synthetic-willow-14506'})
 assert.equal((await api('people/'+second.person+'?asOf='+day(4))).current.jobTitle,requestBody.jobTitle)
 // Both OAuth grants retain exactly the same non-person scope, validation and approval route.
 for(const grant of ['client_credentials','authorization_code']) {
  const client=await issueWrite(['job.approval','compensation.approval'],'oauth_client')
  const verifier='synthetic-willow-14507-'.repeat(3),{createHash}=await import('node:crypto')
  const authorization=grant==='authorization_code'?await api('oauth.authorize',{client:client.id,redirectUri:client.redirectUri,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',state:'synthetic-willow-14508',reason:'synthetic-willow-14509'}):null
  const body={grant_type:grant,...(authorization?{code:new URL(authorization.redirectUri).searchParams.get('code'),redirect_uri:client.redirectUri,code_verifier:verifier}:{})}
  const exchanged=await fetch(h.origin+'/api/willow/oauth/token',{method:'POST',headers:{authorization:'Basic '+Buffer.from(client.id+':'+client.token).toString('base64'),'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)})
  assert.equal(exchanged.status,200);const token=(await exchanged.json()).access_token
  for(const route of ['employees','employees/'+second.person,'organization','custom-fields','tables',['tables','education'].join('/'),'balances','requests','calendar','documents','access-level'])await get(route,200,token)
  for(const route of ['people','people/'+second.person,'organization','custom-fields','record-tables',['record-tables','education'].join('/'),'policies','leave/'+request.id,'builtin-reports',['builtin-reports','builtin-headcount'].join('/')]) {
   const read=await fetch(h.origin+'/api/willow/'+route,{headers:{authorization:'Bearer '+token,cookie:owner}})
   assert.equal(read.status,200,route);assert.ok(read.headers.has('RateLimit-Limit'))
   const projection=await read.text();assert.ok(!projection.includes(distant.person)&&!projection.includes('synthetic-willow-14041'))
  }
  for(const route of ['/app/people','/api/willow/me','/api/willow/settings','/api/willow/levels','/api/willow/eeo/people']) {
   const denied=await fetch(h.origin+route,{headers:{authorization:'Bearer '+token,cookie:owner},redirect:'manual'})
   assert.equal(denied.status,403);assert.ok(denied.headers.has('RateLimit-Limit'));await denied.arrayBuffer()
  }
  const effectiveFrom=day(grant==='client_credentials'?5:6),amount=grant==='client_credentials'?'90000.01':'91000.02'
  const change=await write(token,{person:second.person,effectiveFrom,reason:'synthetic-willow-14510',payBasis:'salary',payAmount:amount,jobTitle:'synthetic-willow-14511'})
  const detail=await h.api('change-requests/'+change.id,fx.staff.hr.cookie)
  assert.equal(detail.requestedBy.id,'credential:'+client.id)
  const denied=await fetch(h.origin+'/api/willow/change.decide',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({request:change.id,decision:'approve'})})
  assert.equal(denied.status,403)
  await h.api('change.decide',fx.staff.hr.cookie,{request:change.id,revision:String(detail.revision),state:detail.state,decision:'approve',comment:'synthetic-willow-14512'})
  const after=(await api('people/'+second.person+'?asOf='+effectiveFrom)).employment.flatMap(period=>period.terms).find(term=>term.effectiveFrom===effectiveFrom)
  assert.equal(after.pay.amountCents,Math.round(Number(amount)*100));assert.equal(after.jobTitle,'synthetic-willow-14511')
 }
 const stoppedJob=await write(jobOnly.token,{...requestBody,effectiveFrom:day(7),jobTitle:'synthetic-willow-14513'})
 const stoppedDetail=await h.api('change-requests/'+stoppedJob.id,fx.staff.hr.cookie)
 await api('apiKey.revoke',{credential:jobOnly.id})
 await h.api('change.decide',fx.staff.hr.cookie,{request:stoppedJob.id,revision:String(stoppedDetail.revision),state:stoppedDetail.state,decision:'approve',comment:'synthetic-willow-14514'},401)
 assert.ok(!(await api('people/'+second.person)).employment.flatMap(period=>period.terms).some(term=>term.jobTitle==='synthetic-willow-14513'))
 const writeAudit=await api('audit');assert.ok(writeAudit.some(row=>row.action==='change.request'&&row.actor==='credential:'+jobOnly.id))
 for(const credential of [readOnly,jobOnly,payOnly])assert.ok(!JSON.stringify(writeAudit).includes(credential.token))
 console.log('API-001 native write scopes: PASS — key and both OAuth grants, exact field and population ceilings, native validation, human approval and effective dating, no credential decisions, revoked requester refusal and secret-free audit')

 // One broader native family: dated leave reservation and human approval.
 const leaveLevel=await apply({kind:'level',name:'synthetic-willow-14800',permissions:[],scope:{kind:'group',dimensions:{location:[location.id]}},leaveFields:{self:{},others:{requests:'edit',balances:'view',ledger:'view',calendar:'view'}}})
 const leaveIssue=(scopes,credentialType='key')=>api('apiKey.issue',{name:'synthetic-willow-14801',level:leaveLevel.id,writeScopes:scopes,credentialType,expiresAt:new Date(Date.now()+86400000).toISOString(),...(credentialType==='oauth_client'?{redirectUri:'https://partner.example.test/callback'}:{})})
 const leaveWrite=async(token,body,status=200)=>{
  const response=await fetch(h.origin+'/api/willow/v1/requests',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)})
  assert.equal(response.status,status,await response.clone().text())
  assert.ok(response.headers.has('RateLimit-Limit'))
  const result=await response.json();check(spec.paths['/requests'].post.responses[String(status)].content['application/json'].schema,result);return result.data
 }
 const half=await api('schedule.create',{name:'synthetic-willow-14802',mon:'4',tue:'4',wed:'4',thu:'4',fri:'4',sat:'4',sun:'4'})
 const employment=(await api('people/'+second.person)).employment.find(row=>row.id===second.period)
 await api('mover.schedule',{period:second.period,revision:employment.revision,effectiveFrom:'2099-01-01',scheduleId:half.id,reason:'synthetic-willow-14803'})
 const readonlyLeave=await leaveIssue([]),leaveKey=await leaveIssue(['leave.approval'])
 const leaveBody={account,startDate:'2098-12-31',endDate:'2099-01-01',reason:'synthetic-willow-14804'}
 await leaveWrite(readonlyLeave.token,leaveBody,403)
 await leaveWrite(leaveKey.token,{...leaveBody,startDate:'2099-99-99'},400)
 await leaveWrite(leaveKey.token,{...leaveBody,decision:'approve'},400)
 const outsideAccount=await fx.account(distant.period)
 await leaveWrite(leaveKey.token,{...leaveBody,account:outsideAccount},404)
 const nativeQuote=await api('quote?account='+account+'&startDate=2098-12-31&endDate=2099-01-01')
 const leavePending=await leaveWrite(leaveKey.token,leaveBody)
 assert.equal(leavePending.minutes,720)
 assert.equal(leavePending.minutes,nativeQuote.minutes)
 assert.ok((await h.api('approvals',fx.staff.hr.cookie)).some(row=>row.id===leavePending.id))
 const pendingLeave=await api('leave/'+leavePending.id)
 assert.equal(pendingLeave.status,'pending')
 assert.deepEqual(pendingLeave.calculation.days.map(row=>row.minutes),[480,240])
 assert.deepEqual(pendingLeave.ledger.map(row=>[row.kind,row.minutes,row.effective_date]),[['reservation',-720,'2098-12-31']])
 await leaveWrite(leaveKey.token,leaveBody,409)
 await leaveWrite(leaveKey.token,{account,startDate:'2099-01-02',endDate:'2099-12-31'},409)
 const cannotDecide=await fetch(h.origin+'/api/willow/leave.decide',{method:'POST',headers:{authorization:'Bearer '+leaveKey.token,'content-type':'application/json',cookie:owner},body:JSON.stringify({request:leavePending.id,decision:'approve'})})
 assert.equal(cannotDecide.status,403);await cannotDecide.arrayBuffer()
 await apiBrowserProof(h,owner,fx.staff.hr.cookie,leavePending.id,'/app/leave/'+leavePending.id,leaveLevel.id,'leave.approval')
 await h.api('leave.decide',fx.staff.hr.cookie,{request:leavePending.id,decision:'approve'})
 const approvedLeave=await api('leave/'+leavePending.id)
 assert.equal(approvedLeave.status,'approved')
 assert.deepEqual(approvedLeave.ledger.filter(row=>row.kind==='use').map(row=>[row.minutes,row.effective_date]),[[-720,'2098-12-31']])
 for(const [index,grant] of ['client_credentials','authorization_code'].entries()) {
  const client=await leaveIssue(['leave.approval'],'oauth_client')
  const verifier='synthetic-willow-14805-'.repeat(3),{createHash}=await import('node:crypto')
  const authorization=grant==='authorization_code'?await api('oauth.authorize',{client:client.id,redirectUri:client.redirectUri,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',state:'synthetic-willow-14806',reason:'synthetic-willow-14807'}):null
  const exchanged=await fetch(h.origin+'/api/willow/oauth/token',{method:'POST',headers:{authorization:'Basic '+Buffer.from(client.id+':'+client.token).toString('base64'),'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:grant,...(authorization?{code:new URL(authorization.redirectUri).searchParams.get('code'),redirect_uri:client.redirectUri,code_verifier:verifier}:{})})})
  assert.equal(exchanged.status,200);const token=(await exchanged.json()).access_token
  const submitted=await leaveWrite(token,{account,startDate:'2099-01-0'+(index+3),endDate:'2099-01-0'+(index+3)})
  assert.equal(submitted.minutes,240)
  await h.api('leave.decide',fx.staff.hr.cookie,{request:submitted.id,decision:'approve'})
 }
 const stoppedLeave=await leaveWrite(leaveKey.token,{account,startDate:'2099-01-05',endDate:'2099-01-05'})
 await api('apiKey.revoke',{credential:leaveKey.id})
 await h.api('leave.decide',fx.staff.hr.cookie,{request:stoppedLeave.id,decision:'approve'},401)
 assert.equal((await api('leave/'+stoppedLeave.id)).status,'pending')
 await h.api('leave.decide',fx.staff.hr.cookie,{request:stoppedLeave.id,decision:'decline'})
 assert.ok((await api('audit')).some(row=>row.action==='leave.request'&&row.actor==='credential:'+leaveKey.id))
 console.log('API-002 leave writes: PASS — explicit scopes, bounded population, dated native schedules and ledger, human approval, both OAuth grants and revoked-requester refusal')

 // An opted-in key proposes exactly one native personal field; it never changes records directly.
 const approvalLevel=await apply({kind:'level',name:'synthetic-willow-14012',permissions:[],otherFields:{phone:'approval'},scope:{kind:'group',dimensions:{location:[location.id]}}})
 const approvalKey=await api('apiKey.issue',{name:'synthetic-willow-14013',level:approvalLevel.id,writeScopes:['personal.approval'],expiresAt:new Date(Date.now()+86400000).toISOString()})
 const propose=async(token,body,status=200)=>{
  const response=await fetch(h.origin+'/api/willow/v1/changes',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)})
  assert.equal(response.status,status)
  const result=await response.json()
  check(spec.paths['/changes'].post.responses[String(status)].content['application/json'].schema,result)
  return result
 }
 const body={person:second.person,field:'phone',value:'synthetic-willow-14014'}
 await propose(key.token,body,403)
 await propose(approvalKey.token,{...body,value:'x'.repeat(401)},400)
 await propose(approvalKey.token,{...body,person:near.person},404)
 await propose(approvalKey.token,{...body,field:'date_of_birth',value:'2026-99-99'},403)
 const pending=(await propose(approvalKey.token,body)).data
 await apiBrowserProof(h,owner,fx.staff.hr.cookie,pending.id)
 const queue=await h.api('self-changes',fx.staff.hr.cookie)
 assert.ok(queue.some(row=>row.id===pending.id&&row.status==='pending'&&row.requestedBy==='credential:'+approvalKey.id))
 assert.notEqual((await api('people/'+second.person)).private.phone,body.value)
 await h.api('self.decide',fx.staff.hr.cookie,{change:pending.id,decision:'approve',comment:'synthetic-willow-14015'})
 assert.equal((await api('people/'+second.person)).private.phone,body.value)
 const stopped=(await propose(approvalKey.token,{...body,value:'synthetic-willow-14016'})).data
 await api('apiKey.revoke',{credential:approvalKey.id})
 await h.api('self.decide',fx.staff.hr.cookie,{change:stopped.id,decision:'approve',comment:'synthetic-willow-14017'},401)
 assert.equal((await api('people/'+second.person)).private.phone,body.value)
 await api('apiKey.revoke',{credential:key.id})
 await get('employees',401)
 console.log('API-002 versioned reads: PASS — published schemas, exact level fields and scope, full cursor traversal, unique hire and transfer increments, tamper and cross-key refusal, stale pages, scope-loss reset and immediate revocation')
}

async function apiBrowserProof(h,owner,hr,pending,changePath,writeLevel,writeScope='job.approval') {
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')return
 const {pathToFileURL}=await import('node:url')
 const {evidenceDirectory}=await import('./evidence.mjs')
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try {
  for(const [cookie,path,state] of [[owner,'/app/api-credentials','credentials'],[hr,changePath??'/app/self-changes/'+pending,changePath?(changePath.startsWith('/app/leave/')?'pending-leave-approval':'pending-employment-approval'):'pending-approval']]) {
   const context=await browser.newContext({ignoreHTTPSErrors:true})
   await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
   const page=await context.newPage()
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000})
    assert.equal((await page.goto(h.origin+path)).status(),200)
    if(writeLevel&&state==='credentials') {
     const form=page.locator('form[action="/app/do/apiKey.issue"]')
     await form.locator('[name="name"]').fill('synthetic-willow-14520-'+width)
     await form.locator('[name="level"]').selectOption(writeLevel)
     await form.locator('[name="writeScopes"]').selectOption(JSON.stringify([writeScope]))
     await form.getByRole('button',{name:'Issue credential'}).click()
     assert.ok(await page.locator('#issued-api-token').textContent())
     const issued=(await h.api('api-credentials',owner)).find(row=>row.name==='synthetic-willow-14520-'+width)
     assert.deepEqual(issued.writeScopes,[writeScope])
     await h.api('apiKey.revoke',owner,{credential:issued.id})
     await page.goto(h.origin+path)
    }
    await page.evaluate(()=>document.fonts.ready)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),state+' fits '+width)
    const bell=page.locator('.bell'),tip=page.getByRole('tooltip',{name:'Your tasks'})
    await bell.hover()
    await page.waitForTimeout(150)
    assert.equal(await tip.isVisible(),false,'Hover hint waits approximately 300 ms')
    await tip.waitFor({state:'visible'})
    await page.mouse.move(0,0)
    await bell.focus()
    assert.equal(await tip.isVisible(),true,'Keyboard focus shows the hint immediately')
    await page.screenshot({path:evidenceDirectory+'/API-002-'+state+'-'+width+'.png',fullPage:true})
   }
   await context.close()
  }
 }finally {await browser.close()}
 console.log('API-002 browser: PASS — credentials and native pending approval, icon hint delay and focus at 1440 and 390')
}

async function nativeRequestUpgradeProof() {
 const {harness}=await import('./harness.mjs')
 const prefix='synthetic-willow-146',person=prefix+'01',member=prefix+'02',period=prefix+'03',template=prefix+'04',chain=prefix+'05',term=prefix+'06'
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'"
 const plan={effectiveFrom:'2099-01-01',reason:prefix+'07',fields:{jobTitle:prefix+'08'},pay:null}
 const base={periodType:'full_time',periodRevision:prefix+'09',termId:term,payBasis:'unknown',payCents:null,newPayBasis:null,newPayCents:null,currency:'USD'}
 const steps=[{role:'hr',member:null,note:null}]
 const sql=[
  `INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES('${member}','${member}@example.test','${member}','owner','active',0);`,
  `INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at) VALUES(1,'${member}',0);`,
  `INSERT INTO wl_employer(singleton,name,timezone,country,currency,updated_at) VALUES(1,'${prefix}10','UTC','US','USD',0);`,
  `INSERT INTO wl_people(id,legal_name,revision,created_at,updated_at) VALUES('${person}','${person}','${prefix}11',0,0);`,
  `INSERT INTO wl_person_private(person_id) VALUES('${person}');`,
  `INSERT INTO wl_members(id,email,name,status,created_at) VALUES('${member}','${member}@example.test','${member}','active',0);`,
  `INSERT INTO wl_periods(id,person_id,start_date,employment_type,revision,created_at) VALUES('${period}','${person}','2020-01-01','full_time','${prefix}09',0);`,
  `INSERT INTO wl_terms(id,period_id,effective_from,job_title,reason,recorded_by,recorded_at) VALUES('${term}','${period}','2020-01-01','${prefix}12','${prefix}13','${member}',0);`,
  `INSERT INTO wl_templates(id,family_id,version,kind,name,required_fields,status,created_by,created_at) VALUES('${template}','${template}',1,'mover','${template}','[]','active','${member}',0);`,
  `INSERT INTO wl_change_chains(id,request_type,steps_json,template_id,recorded_by,recorded_at) VALUES('${chain}','job',${quote(JSON.stringify(steps))},'${template}','${member}',0);`,
  ...['pending','approved','declined'].flatMap((status,index)=>[
   `INSERT INTO wl_change_requests(id,person_id,period_id,request_type,requested_by,requested_at,status,revision,chain_id,steps_json,step,plan_json,base_json,state,updated_at) VALUES('${prefix}${20+index}','${person}','${period}','job','${member}',0,'${status}',1,'${chain}',${quote(JSON.stringify(steps))},0,${quote(JSON.stringify(plan))},${quote(JSON.stringify(base))},'${prefix}${30+index}',0);`,
   `INSERT INTO wl_change_events(id,request_id,revision,step,kind,actor,comment,at) VALUES('${prefix}${40+index}','${prefix}${20+index}',1,NULL,'submitted','${member}','${prefix}50',0);`,
  ]),
 ].join('\n')
 const h=await harness({bindings:{OWNER_EMAIL:member+'@example.test'},upgrade:{before:'0081_credential_change_requests.sql',sql,snapshot:'SELECT id,status,state,plan_json,base_json FROM wl_change_requests ORDER BY id'}})
 try {
  assert.equal(h.upgradeSnapshot.length,3)
  const owner=await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
  const list=(await h.api('change-requests',owner)).requests
  for(const [index,status] of ['pending','approved','declined'].entries()) {
   const id=prefix+(20+index),row=list.find(row=>row.id===id)
   assert.equal(row.status,status)
   const detail=await h.api('change-requests/'+id,owner)
   assert.equal(detail.effectiveFrom,plan.effectiveFrom);assert.equal(detail.reason,plan.reason);assert.equal(detail.history[0].comment,prefix+'50')
  }
  const detail=await h.api('change-requests/'+prefix+'20',owner)
  assert.equal(detail.state,prefix+'30')
  assert.equal(detail.requestedBy.id,member)
  assert.equal((await h.api('change-requests/'+prefix+'21',owner)).status,'approved')
  console.log('API-001 request migration: PASS — populated pending and final requests retain native visibility, exact state, human requester identity and event history')
 }finally{await h.close()}
}
