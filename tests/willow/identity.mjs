import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { harness } from './harness.mjs'
import { publishTemplate } from './publish-template.mjs'
import { oktaEdge } from './okta-edge.mjs'
import { liveOkta } from './okta-live.mjs'
import { evidenceDirectory } from './evidence.mjs'

const live = process.env.WILLOW_OKTA_LIVE === '1' ? await liveOkta() : null
const edge = oktaEdge(), run = randomBytes(6).toString('hex')
const h = await harness({bindings:live?.bindings ?? {OKTA_ORG_URL:'https://synthetic-willow-900.okta.com',OKTA_API_TOKEN:'synthetic-willow-901'},provider:live?.fetch ?? edge.fetch})
let browser
try {
 assert.equal((await h.raw('/auth/bootstrap',{body:{token:h.vars.SETUP_TOKEN,displayName:'Willow Owner'}})).status,303)
 const owner=await h.signIn(h.vars.OWNER_EMAIL)
 await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
 const api=(path,body,status)=>h.api(path,owner,body,status)
 await api('employer.configure',{name:'Willow identity trial',timezone:'America/New_York',country:'US',currency:'USD'})
 const anchor=(await api('me')).today
 const day=offset=>new Date(Date.parse(anchor+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10)
 const schedule=(await api('schedule.create',{name:'Weekdays',mon:'8',tue:'8',wed:'8',thu:'8',fri:'8'})).id
 const department=(await api('department.create',{name:'Customer operations'})).id
 const templateBody=(kind,extra={})=>({name:`Reviewed ${kind}`,kind,taskTitle:['Verify Okta account','Confirm dependent work'],taskAssignee:['it','hr'],taskSystem:['Okta connected',''],taskEvidence:['yes','no'],taskDueDays:['0','0'],taskRules:[{dependencies:[],conditions:{}},{dependencies:[1],conditions:{}}],...extra})
 const templates={}
 for(const kind of ['joiner','mover','leaver'])templates[kind]=(await publishTemplate(h,owner,templateBody(kind))).id
 const join=async(email,startDate=day(-90),person)=>api('joiner.start',{template:templates.joiner,...(person?{person}:{}),legalName:'Maya Chen',workEmail:email,startDate,employmentType:'full_time',jobTitle:'Support specialist',departmentId:department,scheduleId:schedule,payBasis:'salary',payAmount:'60000'})
 const groupA=live?await live.group(`synthetic-willow-${run}-sales`):'synthetic-willow-903'
 const groupB=live?await live.group(`synthetic-willow-${run}-support`):'synthetic-willow-904'
 if(!live){edge.groups.set(groupA,'Sales');edge.groups.set(groupB,'Customer support')}
 const email=`synthetic-willow-${run}@example.test`, joined=await join(email)
 const account=live?await live.account(email):'synthetic-willow-905'
 if(!live)edge.account(account,email)
 const member=(await api('access.give',{person:joined.person})).id
 const employee=await h.signIn(email,{requested:true})
 for(const path of ['okta.configure','okta.link','okta.preview','okta.apply','okta.observe'])await h.api(path,employee,{},403)
 await api('okta.configure',{enabled:true,reason:'Reviewed sandbox identity work',consent:true})
 await api('okta.link',{person:joined.person,account})
 await api('okta.link',{person:joined.person,account},409)
 const tasks=async id=>(await api(`cases/${id}`)).tasks
 const first=(await tasks(joined.case))[0]
 await api('task.complete',{task:first.id,evidence:'Manually claimed'},409)
 await api('task.complete',{task:(await tasks(joined.case))[1].id},409)
 let review=await api('okta.preview',{task:first.id,groups:[groupA]})
 assert.equal(review.plan.person,joined.person)
 assert.equal(review.plan.date,day(-90))
 assert.equal(review.plan.add[0].id,groupA)
 const screen=async (name,approve)=>{
  if(process.env.WILLOW_IDENTITY_BROWSER!=='1')return false
  browser??=await(await import(process.env.WILLOW_PLAYWRIGHT_PATH||'@playwright/test')).chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(owner.split('; ').map(value=>({name:value.slice(0,value.indexOf('=')),value:value.slice(value.indexOf('=')+1),url:h.origin})))
  const page=await context.newPage()
  try {for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/connections');await page.evaluate(()=>document.fonts.ready)
   for(const selector of ['#okta-provisioning details'])for(const element of await page.locator(selector).all())await element.evaluate(el=>el.open=true)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Connected account work fits the viewport')
   const bell=page.getByRole('link',{name:'Open your task list'});await bell.focus();assert.equal(await page.locator('#tasks-tooltip').evaluate(el=>getComputedStyle(el).visibility),'visible')
   await page.getByRole('searchbox').focus();await bell.hover();await page.waitForTimeout(350);assert.equal(await page.locator('#tasks-tooltip').evaluate(el=>getComputedStyle(el).visibility),'visible')
   await page.locator('#okta-provisioning').screenshot({path:`${evidenceDirectory}/okta-${name}-${width}.png`})
  }
  if(approve) {
   const section=page.locator(`[data-okta-review="${approve}"]`)
   await section.getByRole('button',{name:'Approve and execute reviewed changes'}).click()
   await page.waitForURL(url=>url.pathname==='/app/connections')
   assert.ok((await api('connections')).provisioning.reviews.some(row=>row.id===approve&&row.status==='verified'),'The real approval form reaches the verified end state')
  }
  return !!approve
  }finally{await context.close()}
 }
 const approvedInBrowser=await screen('review',review.id)
 let result=approvedInBrowser ? (await api('connections')).provisioning.reviews.find(row=>row.id===review.id) : await api('okta.apply',{review:review.id})
 assert.equal(result.status,'verified');assert.equal(result.observed.status,'ACTIVE')
 assert.deepEqual(result.observed.groups.filter(g=>g.managed).map(g=>g.id),[groupA])
 await api('okta.apply',{review:review.id},409)
 const verifySession=live?await live.session(account,email):async()=>assert.equal(edge.users.get(account).session,false)
 if(!live)edge.users.get(account).session=true
 await api('task.complete',{task:(await tasks(joined.case))[1].id})
 await api('case.complete',{case:joined.case})
 const mover=await api('mover.schedule',{period:joined.period,template:templates.mover,effectiveFrom:day(-60),jobTitle:'Support lead',departmentId:department,scheduleId:schedule,payBasis:'salary',payAmount:'65000',reason:'Department transfer'})
 const moveTask=(await tasks(mover.case))[0]
 review=await api('okta.preview',{task:moveTask.id,groups:[groupB]})
 assert.deepEqual(review.plan.remove.map(g=>g.id),[groupA])
 assert.deepEqual(review.plan.add.map(g=>g.id),[groupB])
 result=await api('okta.apply',{review:review.id})
 assert.equal(result.observed.profile.title,'Support lead')
 assert.deepEqual(result.observed.groups.filter(g=>g.managed).map(g=>g.id),[groupB])
 await api('task.complete',{task:(await tasks(mover.case))[1].id});await api('case.complete',{case:mover.case})
 // A future hire cannot execute early; the date is deliberately remote from
 // the employer's current date, without asserting a date boundary.
 const futureEmail=`synthetic-willow-${run}-future@example.test`,future=await join(futureEmail,day(30))
 const futureAccount=live?await live.account(futureEmail):'synthetic-willow-906'
 if(!live)edge.account(futureAccount,futureEmail)
 await api('okta.link',{person:future.person,account:futureAccount})
 const futureReview=await api('okta.preview',{task:(await tasks(future.case))[0].id,groups:[]})
 await api('okta.apply',{review:futureReview.id},409)
 const leaving=await api('leaver.start',{period:joined.period,template:templates.leaver,endDate:day(-30),reason:'Sandbox departure'})
 const leaveTask=(await tasks(leaving.case))[0]
 review=await api('okta.preview',{task:leaveTask.id,groups:[]})
 await screen('departure')
 result=await api('okta.apply',{review:review.id})
 assert.equal(result.observed.status,'SUSPENDED');assert.equal(result.observed.groups.filter(g=>g.managed).length,0)
 await verifySession()
 await api('task.complete',{task:(await tasks(leaving.case))[1].id});await api('case.complete',{case:leaving.case})
 const rehired=await join(email,day(-20),joined.person)
 assert.equal(rehired.person,joined.person)
 assert.equal((await tasks(rehired.case))[0].status,'open')
 review=await api('okta.preview',{task:(await tasks(rehired.case))[0].id,groups:[]})
 result=await api('okta.apply',{review:review.id})
 assert.equal(result.observed.status,'ACTIVE');assert.equal(result.observed.groups.filter(g=>g.managed).length,0)
 await screen('verified')
 if(!live) {
  const fault=await api('leaver.start',{period:rehired.period,template:templates.leaver,endDate:day(-10),reason:'Failure trial'})
  const task=(await tasks(fault.case))[0]
  const failed=await api('okta.preview',{task:task.id,groups:[]})
  edge.failNext=true
  await api('okta.apply',{review:failed.id},502)
  await api('task.complete',{task:task.id,evidence:'Provider said no'},409)
  await api('case.complete',{case:fault.case},409)
  await api('okta.apply',{review:failed.id},409)
  const unresolved=await api('okta.observe',{review:failed.id})
  assert.equal(unresolved.status,'uncertain')
  assert.ok((await tasks(fault.case))[0].failure)
  await screen('exception')
  await api('okta.exception.close',{review:failed.id,reason:'Provider observed; prepare a new explicitly reviewed attempt'})
  assert.equal((await tasks(fault.case))[0].status,'open')
  edge.users.get(account).apps=[{id:'synthetic-willow-907',label:'Payroll portal'}]
  const assigned=await api('okta.preview',{task:task.id,groups:[]})
  assert.equal((await api('okta.apply',{review:assigned.id},409)).error,'okta_readback_pending')
  assert.equal((await tasks(fault.case))[0].status,'open','An application link prevents a removed-access claim')
  await api('case.complete',{case:fault.case},409)
  await api('okta.exception.close',{review:assigned.id,reason:'Application owner confirmed removal; inspect a fresh provider image'})
  edge.users.get(account).apps=[]
  const recovery=await api('okta.preview',{task:task.id,groups:[]})
  assert.equal((await api('okta.apply',{review:recovery.id})).status,'verified')
  const stale=await api('okta.preview',{task:(await tasks(future.case))[0].id,groups:[]})
  await api('okta.configure',{enabled:false,reason:'Withdrawal trial'})
  await api('okta.apply',{review:stale.id},409)
 }
 assert.equal((await h.api('me',employee)).id,member)
 const publicState=JSON.stringify(await api('connections'))
 assert.ok(!publicState.includes(h.vars.OKTA_API_TOKEN))
 assert.ok(!h.output().includes(h.vars.OKTA_API_TOKEN))
 console.log(`IDENTITY-001 reviewed Okta join, move, leave, session revocation and rehire: PASS (${live?'held sandbox':'provider edge'})`)
} finally {if(browser)await browser.close();await h.close();if(live)await live.close()}
