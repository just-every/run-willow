// Versioned transport proof uses a real Worker and the schema served to integrators.
import assert from 'node:assert/strict'
import Ajv from 'ajv/dist/2020.js'
import { day } from './regression-fixture.mjs'

export async function apiRosterProof(h,owner,fx) {
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
 const plan={kind:'level',name:'synthetic-willow-14005',permissions:['people.manage','leave.manage'],documentCategories:{self:{},others:{[category.id]:'view'}},scope:{kind:'group',dimensions:{location:[location.id]}}}
 const level=await apply(plan)
 const key=await api('apiKey.issue',{name:'synthetic-willow-14006',level:level.id,expiresAt:new Date(Date.now()+86400000).toISOString()})
 const specResponse=await h.raw('/api/willow/v1/openapi.json')
 assert.equal(specResponse.status,200)
 const spec=await specResponse.json(),ajv=new Ajv({strict:false,allErrors:true})
 assert.equal(spec.openapi,'3.1.0')
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

async function apiBrowserProof(h,owner,hr,pending) {
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')return
 const {pathToFileURL}=await import('node:url')
 const {evidenceDirectory}=await import('./evidence.mjs')
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try {
  for(const [cookie,path,state] of [[owner,'/app/api-credentials','credentials'],[hr,'/app/self-changes/'+pending,'pending-approval']]) {
   const context=await browser.newContext({ignoreHTTPSErrors:true})
   await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
   const page=await context.newPage()
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000})
    assert.equal((await page.goto(h.origin+path)).status(),200)
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
