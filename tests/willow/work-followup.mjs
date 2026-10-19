// FLOW-002: real Worker, storage, scheduler, pages and forms; mail alone is a network-edge fake.
import assert from 'node:assert/strict'
import { publishTemplate } from './publish-template.mjs'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as pathJoin } from 'node:path'
import { pathToFileURL } from 'node:url'
import { harness, file } from './harness.mjs'
import { genericColumns } from './phase2-fixtures.mjs'
import { fixture, today, day } from './regression-fixture.mjs'

const directory=await mkdtemp(pathJoin(tmpdir(),'willow-followup-'))
let h,browser,mail='accepted',model='failed'
const messages=[]
const provider=async request=>{
 if(new URL(request.url).hostname==='api.sendgrid.com') {
  const body=await request.json()
  if(body.subject==='Willow: assigned work needs attention') {messages.push(body);return new Response(null,{status:mail==='accepted'?202:503})}
  return new Response(null,{status:202})
 }
 if(new URL(request.url).hostname==='models.example.test') {
  if(model==='failed')return new Response(null,{status:503})
  const requestBody=await request.json(),context=JSON.parse(requestBody.messages[1].content)
  return Response.json({choices:[{message:{content:JSON.stringify({source:{id:context.id,version:context.version},items:context.tasks.map(t=>({position:t.position,text:'Review the required task and its evidence.'}))})}}]})
 }
 throw new Error('Unexpected network edge')
}
const at=(date,hour)=>Date.parse(`${date}T${String(hour).padStart(2,'0')}:00:00Z`)
const tick=async(date,hour=9)=>{
 const response=await h.raw(`/cdn-cgi/local/scheduled?time=${at(date,hour)}&cron=${encodeURIComponent('*/15 * * * *')}&format=json`)
 assert.equal(response.status,200,await response.text())
}
const browserProof=async(cookie,path,name,use)=>{
 if(process.env.WILLOW_WORK_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 browser??=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true})
 await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:h.origin})))
 const output=process.env.WILLOW_EVIDENCE_DIR
 assert.ok(output,'Browser evidence lives outside the checkout')
 await mkdir(output,{recursive:true})
 try {
  const page=await context.newPage()
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});await page.goto(h.origin+path)
   if(use)await use(page,width)
   await page.evaluate(()=>document.fonts.ready)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page fits viewport')
   await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true})
  }
 } finally {await context.close()}
}
try {
 h=await harness({scheduled:true,persistTo:directory,provider})
 assert.equal((await h.raw('/auth/bootstrap',{body:{token:h.vars.SETUP_TOKEN,displayName:'Olive Owner'}})).status,303)
 const owner=await h.signIn(h.vars.OWNER_EMAIL)
 await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
 const f=await fixture(h,owner),s=f.staff
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const list=(cookie=owner)=>h.api('work',cookie)
 const item=async key=>(await list()).items.find(w=>w.source===key)
 const schedule=async(key,extra={})=>{
  const w=await item(key)
  return api('work.schedule',{source:key,revision:w.revision,owner:s.hr.member,substitute:(await api('me')).id,dueDate:today,nextAction:'Review the checklist and record evidence',...extra})
 }
 const template=await publishTemplate(h, owner,{kind:'joiner',name:'New hire follow-up',requiredFields:['address'],taskTitle:['Prepare equipment return evidence'],taskAssignee:['hr'],taskDueDays:['0'],taskEvidence:['yes']})
 const person=await f.join('Avery Brooks',{template:template.id,workEmail:'avery@example.com',startDate:today})
 const task=(await api(`cases/${person.case}`)).tasks[0],key=`task:${task.id}`
 assert.ok((await list()).items.some(w=>w.source===`information:${person.case}`),'Required information has owned work')
 await schedule(key)
 await tick(today)
 assert.equal((await item(key)).deliveries.length,0,'No unapproved reminders')
 await h.api('work.policy',s.employee.cookie,{offsets:'0, 2',quietStart:20,quietEnd:8,defaultDays:1},403)
 await api('work.policy',{offsets:'0, 2',quietStart:20,quietEnd:8,defaultDays:1})
 await api('connections.notices',{enabled:true})
 await tick(today,22)
 assert.equal((await item(key)).deliveries.length,0,'Quiet hours defer the due step')
 await tick(today)
 assert.deepEqual((await item(key)).deliveries.map(d=>[d.step,d.recipient,d.status]),[[0,s.hr.member,'accepted']])
 await tick(today)
 assert.equal((await item(key)).deliveries.length,1,'Repeated ticks do not send again')
 const vars={...h.vars},port=Number(new URL(h.origin).port)
 await h.close();h=await harness({scheduled:true,persistTo:directory,provider,port,bindings:vars})
 await tick(today)
 assert.equal((await item(key)).deliveries.length,1,'A real Worker restart retains the claim')
 // Approved absence changes the accountable owner, without changing any business-action permission.
 const hrAccount=await f.account(s.hr.period)
 const absence=await h.api('leave.request',s.hr.cookie,{account:hrAccount,startDate:day(1),endDate:day(3)})
 await api('leave.decide',{request:absence.id,decision:'approve'})
 await tick(day(2))
 const covered=await item(key)
 assert.deepEqual(covered.deliveries.map(d=>d.recipient),[s.hr.member,(await api('me')).id])
 assert.ok(covered.history.some(e=>e.kind==='coverage.escalated'))
 assert.equal((await api(`cases/${person.case}`)).tasks[0].status,'open','Reminders do not finish work')
 // Visibility is checked again after scheduling and after a member leaves.
 const employeeMember=await api('access.give',{person:person.person})
 await api('work.schedule',{source:key,revision:covered.revision,owner:employeeMember.id,dueDate:today,nextAction:'Unauthorized recipient'},403)
 const other=await f.join('Noah Williams',{workEmail:'noah@example.com'})
 const t2=(await api(`cases/${other.case}`)).tasks[0],key2=`task:${t2.id}`
 await schedule(key2,{owner:s.hr.member,substitute:'',dueDate:today})
 await api('member.permissions',{member:s.hr.member,permissions:[]})
 await tick(day(2))
 assert.equal((await item(key2)).deliveries.length,0,'Revoked recipient receives no reminder')
 await api('member.permissions',{member:s.hr.member,permissions:['people.manage','people.private','documents.private','leave.manage']})
 await api('member.permissions',{member:s.ended.member,permissions:['people.manage']})
 await schedule(key2,{owner:s.ended.member,substitute:'',dueDate:today})
 await api('access.end',{person:s.ended.person})
 await tick(day(2))
 assert.equal((await item(key2)).deliveries.length,0,'Ended recipient receives no reminder')
 assert.equal((await item(key2)).coverage,'blocked')
 // Rescheduling records history, updates the actual task date and fences stale edits.
 await schedule(key,{dueDate:day(10),substitute:''})
 const revised=await item(key),oldRevision=revised.revision
 assert.equal((await api(`cases/${person.case}`)).tasks[0].dueDate,day(10))
 await tick(day(4));assert.equal((await item(key)).deliveries.length,2,'Old deadline no longer fires')
 await schedule(key,{dueDate:today,substitute:''})
 await api('work.schedule',{source:key,revision:oldRevision,owner:s.hr.member,dueDate:today,nextAction:'Stale edit'},409)
 mail='failed'
 await tick(today)
 assert.ok((await item(key)).deliveries.some(d=>d.status==='uncertain'),'Provider uncertainty stays uncertain')
 const afterFailure=(await item(key)).deliveries.length
 mail='accepted';await tick(today)
 assert.equal((await item(key)).deliveries.length,afterFailure,'An uncertain attempt is never blindly resent')
 assert.equal((await api(`cases/${person.case}`)).tasks[0].status,'open')
 const changes=(await item(key)).history.filter(e=>e.kind==='schedule.changed').map(e=>JSON.parse(e.detail))
 assert.ok(changes.length>=3)
 assert.ok(changes.some(c=>c.before.dueDate===day(10) && c.after.dueDate===today),'Deadline before/after survives rescheduling')
 for(const m of messages) {
  const value=JSON.stringify(m)
  for(const restricted of ['Avery','PRIVATE-','Prepare equipment','81234','Review the checklist','address'])assert.ok(!value.includes(restricted),'Mail has no restricted value or free text')
 }
 // Current approval, receipt and payroll sources all participate in the same mechanism.
 await h.setBindings({MODELS_ENDPOINT:'https://models.example.test/v1/chat/completions',MODELS_KEY:'test-followup-model-key'})
 await api('connections.model',{model:'test-model'})
 const failedDraft=await api('model.draft',{template:template.id})
 assert.ok((await list()).items.some(w=>w.source===`model-failure:${failedDraft.id}`))
 model='accepted'
 const draft=await api('model.draft',{template:template.id})
 assert.ok((await list()).items.some(w=>w.source===`model:${draft.id}`))
 assert.ok(!(await list()).items.some(w=>w.source===`model-failure:${failedDraft.id}`))
 await api('model.decide',{proposal:draft.id,decision:'decline'})
 assert.ok(!(await list()).items.some(w=>w.source===`model:${draft.id}`))
 const request=await h.api('leave.request',s.employee.cookie,{account:s.employee.account,startDate:day(8),endDate:day(8)})
 assert.ok((await list()).items.some(w=>w.source===`leave:${request.id}`))
 const proposal=await api('proposal.create',{kind:'mover',summary:'Review a title change',agent:'HR assistant',plan:{period:s.employee.period,effectiveFrom:day(14),jobTitle:'Customer Support Lead',reason:'Role review'}})
 assert.ok((await list()).items.some(w=>w.source===`proposal:${proposal.id}`))
 await api('proposal.decide',{proposal:proposal.id,decision:'decline'})
 assert.ok(!(await list()).items.some(w=>w.source===`proposal:${proposal.id}`))
 const policy=await api('policy.write',{name:'Draft review',summary:'Employer-reviewed policy',accrualWeeks:'2',negativeLimitHours:'0'})
 assert.ok((await list()).items.some(w=>w.source===`policy:${policy.id}`))
 // A separately approved policy supplies a real opening-balance review.
 await api('policy.approve',{version:policy.id})
 const balance=await api('account.open',{period:s.managerb.period,policy:policy.policy,cutoverDate:today,openingHours:'0',note:'Cutover'})
 assert.ok((await list()).items.some(w=>w.source===`opening:${balance.id}`))
 const category=await api('category.create',{name:'Policy receipts',subjectReads:true,acknowledgement:true})
 const doc=await api('document.add',{person:s.employee.person,category:category.id,title:'Handbook receipt',file:file('handbook.txt','HAND-BOOK')})
 assert.ok((await list(s.employee.cookie)).items.some(w=>w.source===`receipt:${doc.version}`))
 const unmatched=await f.join('Mia Chen',{workEmail:'mia@example.com',payrollId:''})
 const batch=await api('payroll.draft',{periodStart:today,periodEnd:day(30)})
 assert.ok((await list()).items.some(w=>w.source===`payroll-exception:${batch.id}`))
 assert.ok(!(await list(s.managera.cookie)).items.some(w=>w.kind==='payroll-exception'))
 await api('payroll.discard',{batch:batch.id})
 await api('period.payroll',{period:unmatched.period,payrollId:'PAY-MIA'})
 await api('payroll.layout',{format:'generic',columns:genericColumns})
 const clean=await api('payroll.draft',{periodStart:today,periodEnd:day(30)})
 const preview=await api('payroll.preview',{batch:clean.id})
 await api('payroll.export',{batch:clean.id,previewRevision:preview.previewRevision})
 assert.ok((await list()).items.some(w=>w.source===`payroll-receipt:${clean.id}`))
 await api('payroll.acknowledge',{batch:clean.id,reference:'PROVIDER-RECEIPT-19'})
 assert.ok(!(await list()).items.some(w=>w.source===`payroll-receipt:${clean.id}`))
 // Browser uses the home entry point, policy form and scheduling form at both widths.
 await browserProof(owner,'/app','FLOW-002-home',async(page,width)=>{
  await page.screenshot({path:`${process.env.WILLOW_EVIDENCE_DIR}/FLOW-002-home-entry-${width}.png`,fullPage:true})
  await page.getByRole('link',{name:'Your tasks',exact:true}).click();await page.waitForURL('**/app/tasks')
 })
 await browserProof(owner,'/app/tasks','FLOW-002-work',async(page,width)=>{
  await page.getByText('Approve reminder policy',{exact:true}).click()
  await page.getByLabel('Cadence (days from deadline, comma separated)',{exact:true}).fill('0, 2')
  await page.locator('form[action="/app/do/work.policy"]').screenshot({path:`${process.env.WILLOW_EVIDENCE_DIR}/FLOW-002-policy-form-${width}.png`})
  await page.getByRole('button',{name:'Approve cadence',exact:true}).click()
  await page.getByText('Schedule and cover',{exact:true}).first().click()
  const form=page.locator('form[action="/app/do/work.schedule"]').first()
  await form.getByLabel('Next action',{exact:true}).fill('Confirm the equipment handoff with its owner')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Open scheduling form fits viewport')
  await form.screenshot({path:`${process.env.WILLOW_EVIDENCE_DIR}/FLOW-002-schedule-form-${width}.png`})
  await form.getByRole('button',{name:'Save follow-up',exact:true}).click()
  const row=page.locator('tr').filter({has:page.locator(`input[name="source"][value="${key}"]`)})
  await row.getByText(/^History and delivery/).click()
  await row.screenshot({path:`${process.env.WILLOW_EVIDENCE_DIR}/FLOW-002-history-${width}.png`})
  assert.ok(await page.getByText('Confirm the equipment handoff with its owner',{exact:true}).count())
 })
 await browserProof(s.employee.cookie,'/app/tasks','FLOW-002-employee')
 // Completion cancels all remaining cadence steps, across another restart/tick.
 await api('task.complete',{task:task.id,evidence:'Equipment checked by HR'})
 assert.equal(await item(key),undefined)
 const attemptsBefore=(await api('audit')).filter(e=>e.action==='work.reminder' && e.subject===key).length
 await tick(day(30));await tick(day(30))
 assert.equal((await api('audit')).filter(e=>e.action==='work.reminder' && e.subject===key).length,attemptsBefore,'No later reminder after completion')
 assert.equal(await item(key),undefined)
 await h.api('work.run',s.employee.cookie,{},403)
 assert.ok((await api('audit')).some(e=>e.action==='work.schedule' && e.subject===key))
 console.log('FLOW-002: PASS — cadence, quiet hours, durable restart, coverage, revocation, reschedule, delivery failures, current work sources and completion')
} finally {await browser?.close();await h?.close();await rm(directory,{recursive:true,force:true})}
