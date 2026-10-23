async function tooltipProof(page) {
   const bell=page.getByRole('link',{name:'Open your task list',exact:true})
   await page.evaluate(()=>{const link=document.querySelector('.bell');window.__tip=null;link.addEventListener('mouseenter',()=>{const start=performance.now();const sample=()=>{if(Number(getComputedStyle(link.querySelector('[role="tooltip"]')).opacity)>.5)window.__tip=performance.now()-start;else requestAnimationFrame(sample)};requestAnimationFrame(sample)},{once:true})})
   await bell.hover();await page.waitForFunction(()=>window.__tip!==null)
   assert.ok(await page.evaluate(()=>window.__tip>=250&&window.__tip<1500),'Tooltip appears after approximately 300ms hover')
   await page.mouse.move(0,0)
   await page.getByRole('searchbox',{name:'Find a person',exact:true}).focus();await page.keyboard.press('Tab')
   assert.equal(await bell.evaluate(el=>el.matches(':focus-visible')),true)
   assert.equal(await bell.locator('[role="tooltip"]').evaluate(el=>getComputedStyle(el).opacity),'1','Keyboard focus shows the tooltip immediately')
  }

// ROLE-008 extends the existing PERFORM-001 public-door journey.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { API_DOORS, PAGE_DOORS } from '../../src/willow/doors.ts'
import { readZip } from './export-reader.mjs'
import { evidenceDirectory } from './evidence.mjs'

export async function performanceLevelProof(h, owner, {staff:s,join,today,day}) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const apply=async plan=>api('level.apply',{review:(await api('level.preview',plan)).id})
 const cookie=await h.signIn('invited@example.com',{requested:true})
 const read=(path,body,status)=>h.api(path,cookie,body,status)
 const location=await api('location.create',{name:'synthetic-willow-10001',timezone:'UTC'})
 const inside=await join('synthetic-willow-10002',{locationId:location.id}),outside=await join('synthetic-willow-10003')
 const questions={self:['synthetic-willow-10004'],peer:['synthetic-willow-10005'],manager:['synthetic-willow-10006']}
 const cycle=await api('performance.cycle',{name:'synthetic-willow-10007',dueDate:day(10),people:[inside.person,outside.person],questions})
 const pending=await api('performance.cycle',{name:'synthetic-willow-10008',dueDate:day(10),people:[inside.person],questions})
 const input=await api('performance.assign',{cycle:cycle.id,person:inside.person,member:s.employee.member,role:'peer',dueDate:day(10)})
 await h.api('performance.respond',s.employee.cookie,{assignment:input.id,answers:['synthetic-willow-10009 confidential peer input']})
 await api('performance.note',{cycle:cycle.id,person:inside.person,note:'synthetic-willow-10010 private HR note',rating:'Private calibration'})
 const unreleased=await api('performance.assign',{cycle:pending.id,person:inside.person,member:s.employee.member,role:'peer',dueDate:day(10)})
 await h.api('performance.respond',s.employee.cookie,{assignment:unreleased.id,answers:['synthetic-willow-10011 unreleased review']})
 const released=await api('performance.release',{cycle:cycle.id,person:inside.person,summary:'synthetic-willow-10012 released review',rating:'Human decision'})
 await api('performance.release',{cycle:cycle.id,person:outside.person,summary:'synthetic-willow-10013 outside review',rating:'Human decision'})
 const withheld=await api('performance.release',{cycle:cycle.id,person:inside.person,summary:'synthetic-willow-10014 named withholding',rating:'Human decision'})
 await api('performance.withhold',{summary:withheld.id,manager:s.invited.member,reason:'synthetic-willow-10015 private withholding reason'})
 const goal=await api('goal.create',{person:inside.person,title:'synthetic-willow-10016 scoped goal',milestones:['Reviewed milestone'],dueDate:day(20),development:false})
 await api('goal.checkin',{goal:goal.id,progress:25,note:'synthetic-willow-10017 shared check-in'})
 await api('goal.create',{person:outside.person,title:'synthetic-willow-10018 outside goal',milestones:[],dueDate:day(20),development:false})
 // The comments really exist and are released to HR; a View level still gets none.
 const cohort=[{...s.invited,cookie},s.managera,s.managerb,s.employee,s.payroll]
 const survey=await api('survey.create',{name:'synthetic-willow-10019',kind:'pulse',mode:'anonymous',deliveryDate:today,dueDate:day(7),members:cohort.map(m=>m.member),questions:[{key:'score',label:'Score',type:'score'},{key:'comment',label:'Optional comment',type:'text',optional:true}]})
 for(const member of cohort) await h.api('survey.respond',member.cookie,{survey:survey.id,answers:{score:8,comment:'synthetic-willow-10020 anonymous comment'}})
 assert.equal((await api(`surveys/${survey.id}/results`)).comments.length,5)
 const plan={kind:'level',name:'synthetic-willow-10021 Performance View',permissions:['reports.read'],scope:{kind:'group',dimensions:{location:[location.id]}},performanceFields:{self:{},others:{reviews:'view',goals:'view'}}}
 const level=await apply(plan)
 await read(`performance/${cycle.id}`,undefined,404)
 await api('level.preview',{...plan,name:'synthetic-willow-10022',performanceFields:{others:{goals:'reveal'}}},400)
 const assignment=await api('level.preview',{kind:'assignment',member:s.invited.member,levels:[level.id]})
 assert.equal(assignment.impact[0].afterPerformance[0].fields.others.reviews,'view')
 await api('level.apply',{review:assignment.id})
 const detail=await read(`performance/${cycle.id}`)
 assert.deepEqual(detail.summaries.map(r=>r.id),[released.id])
 for(const key of ['inputs','notes','assignments','subjects','members','withholdings','recipients','appeals','acknowledgments']) assert.deepEqual(detail[key],[],key+' remains under its native authority')
 assert.deepEqual(detail.cycle.questions,{})
 assert.equal(detail.summaries[0].mayAcknowledge,false)
 await read(`performance/${pending.id}`,undefined,404)
 assert.equal((await read('goals')).goals.find(g=>g.id===goal.id).mayCheckin,false)
 await read('goal.checkin',{goal:goal.id,progress:50,note:'View is not Edit'},404)
 await read('goal.create',{person:inside.person,title:'View is not Edit',milestones:[],dueDate:day(20)},404)
 await read('performance.release',{cycle:cycle.id,person:inside.person,summary:'View is not release authority',rating:'Unapproved'},403)
 await read('performance.ack',{summary:released.id},404)
 await read(`surveys/${survey.id}/results`,undefined,403)
 const preview=await api(`preview?member=${s.invited.member}&person=${inside.person}`)
 assert.ok(preview.performanceFields.every(f=>f.levelView))
 const forbidden=['synthetic-willow-10009','synthetic-willow-10010','synthetic-willow-10011','synthetic-willow-10013','synthetic-willow-10014','synthetic-willow-10015','synthetic-willow-10018','synthetic-willow-10020']
 const pathsFor=(pattern,name)=>{
  const path=pattern.replace(/^\^|\$$/g,'').replace(/\\\./g,'.')
  if(name==='preview')return [`preview?member=${s.invited.member}&person=${inside.person}`]
  if(name==='quote')return ['quote?account=unknown-account&startDate='+today+'&endDate='+today]
  if(['employeeCsv','employeeXlsx','employeeBundle'].includes(name))return [path+'?scope=organization&fields=name&person='+inside.person+(name==='employeeBundle'?'&history=goals,reviews':'')]
  const values={person:[inside.person,outside.person],context:[inside.person,outside.person],performanceCycle:[cycle.id,pending.id],performanceFile:[cycle.id,pending.id],survey:[survey.id],surveyResults:[survey.id],surveyCsv:[survey.id]}
  return path.includes('([\\w-]+)')?(values[name]??['unknown-record']).map(id=>path.replace('([\\w-]+)',id)):[path]
 }
 const urls=[...API_DOORS.flatMap(([p,n])=>pathsFor(p,n).map(path=>'/api/willow/'+path)),...PAGE_DOORS.flatMap(([p,n])=>pathsFor(p,n))]
 const bodyText=async response=>{
  const bytes=Buffer.from(await response.arrayBuffer()),type=response.headers.get('content-type')??''
  return type.includes('zip')||type.includes('spreadsheetml')?[...readZip(bytes).values()].map(b=>b.toString()).join('\n'):bytes.toString()
 }
 const crawl=async revoked=>{
  for(const url of urls) {
   const response=await h.raw(url,{cookie});assert.ok(response.status<500,url)
   const text=await bodyText(response)
   for(const value of [...forbidden,...revoked?['synthetic-willow-10012','synthetic-willow-10016','synthetic-willow-10017']:[]]) assert.ok(!text.includes(value),`Performance projection leaks ${value} through ${url}`)
  }
 }
 await crawl(false)
 const bundle='/app/exports/employees.zip?scope=organization&fields=name&person='+inside.person+'&history=goals,reviews'
 const exported=await h.raw(bundle,{cookie});assert.equal(exported.status,200)
 const exportedText=await bodyText(exported)
 for(const value of ['synthetic-willow-10012','synthetic-willow-10016','synthetic-willow-10017']) assert.ok(exportedText.includes(value),'Permitted performance history is included in the real bundle')
 await apply({...plan,level:level.id,performanceFields:{self:{},others:{reviews:'view'}}})
 assert.ok(!(await read('goals')).goals.some(g=>g.id===goal.id),'Goal revocation does not revoke independent released-review View')
 assert.equal((await read(`performance/${cycle.id}`)).summaries.length,1)
 await apply({...plan,level:level.id,performanceFields:{self:{},others:{}}})
 await crawl(true)
 const audit=await api('audit')
 const ownerId=(await api('me')).id
 assert.ok(audit.some(e=>e.action==='level.level'&&e.actor===ownerId))
 await performanceReadBrowserProof(h,owner,cookie,s.invited.member,plan,level.id,cycle.id,goal.id,inside.person)
 await goalModeProof(h,owner,cookie,s,plan,level.id,inside,outside,today,day,join)
 console.log(`ROLE-008 read slice: PASS — ${urls.length} public doors, explicit released-review and goal View, exact scope, real private inputs/HR notes/anonymous comments, named withholding, bundle parity, independent revocation and no write/work grant`)
}

async function performanceReadBrowserProof(h,owner,cookie,member,plan,level,cycle,goal,person) {
 if(process.env.WILLOW_PERFORMANCE_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const contexts=[]
 const pageFor=async cookie=>{const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context);await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})));return context.newPage()}
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const apply=async value=>api('level.apply',{review:(await api('level.preview',value)).id})
 try {
  const admin=await pageFor(owner),reader=await pageFor(cookie)
  const capture=async(page,name,width)=>{await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${evidenceDirectory}/ROLE-008-${name}-${width}.png`,fullPage:true})}
  for(const width of [1440,390]) {
   for(const p of [admin,reader])await p.setViewportSize({width,height:1000})
   await apply({...plan,level,performanceFields:{self:{},others:{}}})
   await admin.goto(h.origin+'/app/access')
   const edit=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:new RegExp('^'+plan.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' ·')})}).first()
   await edit.locator('summary').click()
   for(const label of ['Released reviews','Goals and check-ins'])await edit.getByLabel('Performance about others: '+label,{exact:true}).selectOption('view')
   await tooltipProof(admin);await capture(admin,'level-form',width)
   await edit.getByRole('button',{name:'Review level',exact:true}).click();await admin.waitForURL(url=>url.searchParams.has('levelReview'))
   await capture(admin,'review',width)
   await admin.locator('form[action="/app/do/level.apply"]').getByRole('button',{name:'Apply reviewed change',exact:true}).click()
   await admin.waitForURL(url=>url.searchParams.has('notice'));assert.ok(!new URL(admin.url()).searchParams.has('error'))
   await reader.goto(h.origin+`/app/performance/${cycle}`)
   assert.ok((await reader.locator('body').textContent()).includes('synthetic-willow-10012'))
   assert.equal(await reader.getByRole('button',{name:'Acknowledge result',exact:true}).count(),0)
   assert.ok(!(await reader.locator('body').textContent()).includes('synthetic-willow-10010'))
   await tooltipProof(reader);await capture(reader,'released-only',width)
   const [download]=await Promise.all([reader.waitForEvent('download'),reader.getByRole('link',{name:'Download permitted cycle history (JSON)',exact:true}).click()]);assert.equal(await download.failure(),null)
   await reader.goto(h.origin+'/app/goals');assert.ok((await reader.locator('body').textContent()).includes('synthetic-willow-10016'))
   assert.equal(await reader.getByRole('button',{name:'Record check-in',exact:true}).count(),0)
   await tooltipProof(reader);await capture(reader,'goals-view',width)
   await apply({...plan,level,performanceFields:{self:{},others:{}}})
   assert.equal((await reader.goto(h.origin+`/app/performance/${cycle}`)).status(),404)
   await capture(reader,'revoked',width)
  }
 } finally {for(const c of contexts)await c.close();await browser.close()}
}

async function goalModeProof(h,owner,cookie,s,plan,level,inside,outside,today,day,join) {
 const api=(path,body,status)=>h.api(path,owner,body,status),write=(path,body,status)=>h.api(path,cookie,body,status),hr=(path,body,status)=>h.api(path,s.hr.cookie,body,status)
 const apply=async value=>api('level.apply',{review:(await api('level.preview',value)).id})
 const mode=async value=>apply({...plan,level,performanceFields:{self:{},others:{reviews:'view',goals:value}}})
 const goalInput=title=>({person:inside.person,title,milestones:['Reviewed milestone'],dueDate:day(20),development:true,owner:s.invited.member})
 await mode('edit')
 const immediate=await write('goal.create',goalInput('synthetic-willow-10030 immediate goal'))
 const checkin=await write('goal.checkin',{goal:immediate.id,progress:30,note:'synthetic-willow-10031 immediate check-in'})
 assert.ok(checkin.checkin)
 assert.equal((await write('goals')).goals.find(g=>g.id===immediate.id).checkins[0].author,s.invited.member)
 assert.ok((await write('work')).items.some(w=>w.source===`development:${immediate.id}`),'A named goal owner has current authorized work')
 await write('goal.complete',{goal:immediate.id,evidence:'synthetic-willow-10032 completion'})
 await write('goal.complete',{goal:immediate.id,evidence:'No duplicate completion'},409)
 await write('goal.create',{...goalInput('Out of scope'),person:outside.person},404)
 const owned=await write('goal.create',goalInput('synthetic-willow-10044 owned work'))
 await mode('approval')
 const proposed=await write('goal.create',goalInput('synthetic-willow-10033 approval goal'))
 assert.equal(proposed.status,'pending')
 assert.ok(!(await write('goals')).goals.some(g=>g.id===proposed.goal))
 assert.equal((await write(`self-changes/${proposed.id}`)).kind,'goal')
 await write('self.decide',{change:proposed.id,decision:'approve',comment:'Cannot approve own request'},403)
 assert.ok((await hr('work')).items.some(w=>w.source===`self-change:${proposed.id}`))
 await hr('self.decide',{change:proposed.id,decision:'approve',comment:'Human reviewed the exact proposed goal'})
 assert.ok((await write('goals')).goals.some(g=>g.id===proposed.goal))
 assert.ok(!(await api('self-exceptions')).some(e=>e.id===proposed.id),'An approved goal creates no provider handoff')
 assert.ok(!(await hr('work')).items.some(w=>w.source===`self-exception:${proposed.id}`))
 await api('self.reconcile',{change:proposed.id,reference:'Not a provider outcome'},409)
 const pendingCheckin=await write('goal.checkin',{goal:proposed.goal,progress:50,note:'synthetic-willow-10034 pending check-in'})
 assert.deepEqual((await write('goals')).goals.find(g=>g.id===proposed.goal).checkins,[])
 await hr('self.decide',{change:pendingCheckin.id,decision:'approve',comment:'Reviewed check-in'})
 assert.ok((await write('goals')).goals.find(g=>g.id===proposed.goal).checkins.some(c=>c.note.includes('synthetic-willow-10034')))
 const completion=await write('goal.complete',{goal:proposed.goal,evidence:'synthetic-willow-10035 pending evidence'})
 assert.equal((await write('goals')).goals.find(g=>g.id===proposed.goal).completion,null)
 assert.ok((await write('work')).items.some(w=>w.source===`development:${proposed.goal}`))
 await hr('self.decide',{change:completion.id,decision:'approve',comment:'Reviewed completion evidence'})
 assert.equal((await write('goals')).goals.find(g=>g.id===proposed.goal).completion.evidence,'synthetic-willow-10035 pending evidence')
 assert.ok(!(await write('work')).items.some(w=>w.source===`development:${proposed.goal}`))
 // A changed source, a revoked mode and a moved-out person cannot publish.
 const native=await api('goal.create',{person:inside.person,title:'synthetic-willow-10036',milestones:[],dueDate:day(30),development:false})
 const stale=await write('goal.checkin',{goal:native.id,progress:60,note:'synthetic-willow-10037 stale request'})
 await api('goal.checkin',{goal:native.id,progress:10,note:'A later native check-in'})
 await hr('self.decide',{change:stale.id,decision:'approve',comment:'Stale source is refused'},409)
 await hr('self.decide',{change:stale.id,decision:'reject',comment:'Recreate against current goal state'})
 const revoked=await write('goal.checkin',{goal:native.id,progress:60,note:'synthetic-willow-10038 revoked request'})
 await mode('none')
 assert.ok(!(await write('work')).items.some(w=>w.source===`development:${owned.id}`),'Revoked goal authority removes owner work')
 assert.notEqual((await api('work')).items.find(w=>w.source===`development:${owned.id}`).effectiveOwner,s.invited.member,'Revoked owner work is reassigned to current authority')
 await hr('self.decide',{change:revoked.id,decision:'approve',comment:'Revoked authority is refused'},404)
 await write(`self-changes/${revoked.id}`,undefined,404)
 await hr('self.decide',{change:revoked.id,decision:'reject',comment:'Current HR can still reject'})
 await mode('approval')
 const moved=await write('goal.checkin',{goal:native.id,progress:60,note:'synthetic-willow-10039 moved request'})
 const mover=await api('mover.schedule',{period:inside.period,effectiveFrom:today,locationId:null,reason:'Move outside goal level scope'})
 await hr('self.decide',{change:moved.id,decision:'approve',comment:'Current scope is refused'},404)
 await hr('self.decide',{change:moved.id,decision:'reject',comment:'Outside current scope'})
 await api('terms.cancel',{terms:mover.terms,reason:'Restore goal proof scope'})
 // A read plus an approval selection permits decisions, never goal editing.
 const delegatePlan={kind:'level',name:'synthetic-willow-10040 goal reviewer',permissions:[],approvals:['self:goal'],scope:plan.scope,performanceFields:{self:{},others:{goals:'view'}}}
 const delegate=await apply(delegatePlan)
 const prior=(await api('levels')).assignments.filter(a=>a.member_id===s.payroll.member).map(a=>a.level_id)
 await apply({kind:'assignment',member:s.payroll.member,levels:[...prior,delegate.id]})
 const delegated=(path,body,status)=>h.api(path,s.payroll.cookie,body,status)
 const decision=await write('goal.checkin',{goal:native.id,progress:20,note:'synthetic-willow-10041 selected reviewer'})
 assert.equal((await delegated(`self-changes/${decision.id}`)).mayDecide,true)
 await delegated('goal.checkin',{goal:native.id,progress:20,note:'A decision selection is not Edit'},404)
 const review=await api('level.preview',{...delegatePlan,level:delegate.id,approvals:[]})
 assert.ok(JSON.stringify(review.approvalImpact).includes(decision.id))
 await api('level.apply',{review:review.id})
 await delegated(`self-changes/${decision.id}`,undefined,404)
 await delegated('self.decide',{change:decision.id,decision:'approve',comment:'Selection revoked'},403)
 await apply({...delegatePlan,level:delegate.id})
 await delegated('self.decide',{change:decision.id,decision:'approve',comment:'Current selected reviewer decides'})
 await apply({kind:'assignment',member:s.payroll.member,levels:prior})
 // Ending the requester cannot leave a proposal able to publish later.
 const ended=await join('synthetic-willow-10042')
 const invitation=await api('access.give',{person:ended.person}),endedCookie=await h.signIn('synthetic-willow-10042@example.com',{requested:true})
 await apply({kind:'assignment',member:invitation.id,levels:[level]})
 const endedProposal=await h.api('goal.checkin',endedCookie,{goal:native.id,progress:50,note:'synthetic-willow-10043 ended requester'})
 await api('access.end',{person:ended.person})
 await hr('self.decide',{change:endedProposal.id,decision:'approve',comment:'Ended requester is refused'},403)
 await hr('self.decide',{change:endedProposal.id,decision:'reject',comment:'Ended request retained and rejected'})
 const current=JSON.stringify((await api('goals')).goals.find(g=>g.id===native.id))
 for(const value of ['synthetic-willow-10037','synthetic-willow-10038','synthetic-willow-10039','synthetic-willow-10043'])assert.ok(!current.includes(value))
 await goalModeBrowserProof(h,owner,cookie,s.hr.cookie,plan,level,s.invited.member,inside.person,day)
 await mode('none')
 console.log('ROLE-008 goal modes: PASS — native scoped Edit, immutable HR-approved creation/check-ins/completion, exact current sources, selected reviewer routing/revocation, no self approval, moved/revoked/ended refusal and no provider handoff')
}

async function goalModeBrowserProof(h,owner,cookie,hrCookie,plan,level,member,person,day) {
 if(process.env.WILLOW_PERFORMANCE_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const contexts=[]
 const pageFor=async cookie=>{const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context);await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})));return context.newPage()}
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const submit=async(page,form,name)=>{const action=await form.getAttribute('action');const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname===action&&r.request().method()==='POST'),page.waitForNavigation({waitUntil:'load'}),form.getByRole('button',{name,exact:true}).click()]);assert.equal(response.status(),303);assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())}
 const capture=async(page,name,width)=>{await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${evidenceDirectory}/ROLE-008-goal-${name}-${width}.png`,fullPage:true})}
 try {
  const admin=await pageFor(owner),writer=await pageFor(cookie),hr=await pageFor(hrCookie)
  for(const width of [1440,390]) {
   for(const page of [admin,writer,hr])await page.setViewportSize({width,height:1000})
   await admin.goto(h.origin+'/app/access')
   const editor=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:new RegExp('^'+plan.name+' ·')})}).first()
   await editor.locator('summary').click();await editor.getByLabel('Performance about others: Goals and check-ins',{exact:true}).selectOption('approval')
   await submit(admin,editor,'Review level');await capture(admin,'approval-review',width)
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await writer.goto(h.origin+'/app/goals')
   const create=writer.locator('form[action="/app/do/goal.create"]');await create.locator('..').locator('summary').click()
   const title=`synthetic-willow-10050-${width}`
   await create.getByLabel('Person',{exact:true}).selectOption(person);await create.getByLabel('Goal title',{exact:true}).fill(title);await create.getByLabel('Milestone',{exact:true}).fill('Reviewed human milestone');await create.getByLabel('Due date',{exact:true}).fill(day(20));await create.getByLabel('Owner',{exact:true}).selectOption(member);await create.getByLabel('Development action',{exact:true}).check()
   await tooltipProof(writer);await capture(writer,'request-form',width);await submit(writer,create,'Create goal')
   const pending=(await h.api('self-changes',cookie)).find(r=>r.kind==='goal'&&r.after.payload.title===title)
   assert.equal(pending.status,'pending')
   await writer.goto(h.origin+`/app/self-changes/${pending.id}`);assert.equal(await writer.getByRole('button',{name:'Record decision',exact:true}).count(),0);await tooltipProof(writer);await capture(writer,'pending',width)
   await hr.goto(h.origin+`/app/self-changes/${pending.id}`);const decision=hr.locator('form[action="/app/do/self.decide"]');await decision.getByLabel('Decision',{exact:true}).selectOption('approve');await decision.getByLabel('Comment',{exact:true}).fill('Reviewed the exact goal and named owner');await tooltipProof(hr);await capture(hr,'hr-review',width);await submit(hr,decision,'Record decision')
   await writer.goto(h.origin+'/app/goals');const card=writer.locator('section.card').filter({has:writer.getByRole('heading',{name:title,exact:true})});await card.getByRole('button',{name:'Request development completion',exact:true}).waitFor();await capture(writer,'approved',width)
   const complete=card.locator('form[action="/app/do/goal.complete"]');await complete.getByLabel('Completion evidence',{exact:true}).fill(`synthetic-willow-10051-${width}`);await submit(writer,complete,'Request development completion')
   const completion=(await h.api('self-changes',cookie)).find(r=>r.kind==='goal'&&r.status==='pending'&&r.after.payload.evidence===`synthetic-willow-10051-${width}`)
   await hr.goto(h.origin+`/app/self-changes/${completion.id}`);const approve=hr.locator('form[action="/app/do/self.decide"]');await approve.getByLabel('Decision',{exact:true}).selectOption('approve');await approve.getByLabel('Comment',{exact:true}).fill('Reviewed the recorded completion evidence');await submit(hr,approve,'Record decision')
   await writer.goto(h.origin+'/app/goals');assert.ok((await writer.locator('body').textContent()).includes(`synthetic-willow-10051-${width}`));await capture(writer,'completed',width)
  }
 } finally {for(const context of contexts)await context.close();await browser.close()}
}
