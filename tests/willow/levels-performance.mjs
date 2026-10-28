async function tooltipProof(page) {
   const bell=page.getByRole('link',{name:'Open your task list',exact:true})
   await page.mouse.move(0,0)
   await page.getByRole('searchbox',{name:'Find a person',exact:true}).focus()
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.bell [role="tooltip"]')).opacity==='0')
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
 assert.deepEqual(preview.performanceFields.filter(f=>f.levelView).map(f=>f.field).sort(),['goals','reviews'])
 assert.equal(preview.performanceFields.find(f=>f.field==='engagement').levelView,false)
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
 await reviewModeProof(h,owner,cookie,s,plan,level.id,inside,outside,today,day,join)
 await engagementThemeProof(h,owner,cookie,s,plan,level.id,inside,outside,survey.id,today,day,join)
 await trainingModeProof(h,owner,cookie,s,inside,outside,day,join)
 console.log(`ROLE-008 read slice: PASS — ${urls.length} public doors, explicit released-review and goal View, exact scope, real private inputs, HR notes and anonymous comments, named withholding, bundle parity, independent revocation and no write or work grant`)
}

async function performanceReadBrowserProof(h,owner,cookie,member,plan,level,cycle,goal,person) {
 if(process.env.WILLOW_PERFORMANCE_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,executablePath:process.env.WILLOW_CHROMIUM_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
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
 const mode=async value=>apply({...plan,level,approvals:['self:goal'],performanceFields:{self:{},others:{reviews:'view',goals:value}}})
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
 assert.ok((await api('levels')).levels.find(l=>l.id===level).approvals.includes('self:goal'))
 assert.equal((await write(`self-changes/${proposed.id}`)).kind,'goal')
 assert.equal((await write(`self-changes/${proposed.id}`)).mayDecide,false,'Holding goal decisions never permits deciding your own proposal')
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
 const outsideLocation=await api('location.create',{name:'synthetic-willow-10045 outside goal scope',timezone:'UTC'})
 const mover=await api('mover.schedule',{period:inside.period,effectiveFrom:today,locationId:outsideLocation.id,reason:'Move outside goal level scope'})
 assert.equal((await api(`people/${inside.person}`)).current.location.id,outsideLocation.id)
 assert.ok((await api(`preview?member=${s.invited.member}&person=${inside.person}`)).performanceFields.every(field=>!field.levelView))
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
 console.log('ROLE-008 goal modes: PASS — native scoped Edit, immutable HR-approved creation/check-ins/completion, exact current sources, selected reviewer routing and revocation, no self approval, moved, revoked or ended refusal and no provider handoff')
}

async function goalModeBrowserProof(h,owner,cookie,hrCookie,plan,level,member,person,day) {
 if(process.env.WILLOW_PERFORMANCE_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,executablePath:process.env.WILLOW_CHROMIUM_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
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
   await submit(admin,editor.locator('form'),'Review level');await capture(admin,'approval-review',width)
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

async function engagementThemeProof(h,owner,cookie,s,plan,level,inside,outside,anonymous,today,day,join) {
 const api=(path,body,status)=>h.api(path,owner,body,status),read=(path,body,status)=>h.api(path,cookie,body,status)
 const apply=async value=>api('level.apply',{review:(await api('level.preview',value)).id})
 const insideMember=await api('access.give',{person:inside.person}),outsideMember=await api('access.give',{person:outside.person})
 const insideCookie=await h.signIn('synthetic-willow-10002@example.com',{requested:true})
 const extraMembers=[]
 for(let i=0;i<4;i++) {
  const person=await join('synthetic-willow-'+(10400+i),{locationId:plan.scope.dimensions.location[0]})
  const member=await api('access.give',{person:person.person});await h.signIn('synthetic-willow-'+(10400+i)+'@example.com',{requested:true})
  extraMembers.push({...person,member:member.id})
 }
 const create=async(member,name,extras=[])=>api('survey.create',{name,kind:'pulse',mode:'named',deliveryDate:today,dueDate:day(7),members:[member,...extras],questions:[{key:'comment',label:'Named feedback',type:'text'}]})
 await h.signIn('synthetic-willow-10003@example.com',{requested:true})
 const named=await create(insideMember.id,'synthetic-willow-10060 scoped named survey',extraMembers.map(m=>m.member))
 const small=await create(insideMember.id,'synthetic-willow-10410 small named survey',extraMembers.slice(0,3).map(m=>m.member))
 const external=await create(outsideMember.id,'synthetic-willow-10061 outside survey')
 await h.api('survey.respond',insideCookie,{survey:named.id,answers:{comment:'synthetic-willow-10062 confidential named response'}})
 const publish=async(survey,theme)=>api('survey.plan',{survey,theme,plan:'synthetic-willow-10063 published action',ownerMember:s.hr.member,dueDate:day(10)})
 await publish(small.id,'synthetic-willow-10411 small cohort theme')
 const action=await publish(named.id,'synthetic-willow-10064 scoped published theme')
 await publish(external.id,'synthetic-willow-10065 outside theme')
 await publish(anonymous,'synthetic-willow-10066 anonymous published theme')
 const scoped={...plan,level,permissions:[],approvals:[],performanceFields:{self:{},others:{engagement:'view'}}}
 await api('level.preview',{...scoped,performanceFields:{others:{engagement:'edit'}}},400)
 await api('level.preview',{...scoped,performanceFields:{others:{engagement:'approval'}}},400)
 const review=await api('level.preview',scoped)
 assert.equal(review.impact.find(m=>m.member===s.invited.member).afterPerformance[0].fields.others.engagement,'view')
 await api('level.apply',{review:review.id})
 await read(`surveys/${small.id}/results`,undefined,403)
 assert.ok(!(await read('surveys')).items.some(item=>item.id===small.id),'An additional theme level never admits a cohort below five')
 const result=await read(`surveys/${named.id}/results`)
 assert.equal(result.access,'themes')
 assert.equal(result.plans[0].id,action.id)
 for(const key of ['aggregate','comparisons','namedAnswers','comments','members'])assert.ok(!Object.hasOwn(result,key),key+' is never selected for theme readers')
 assert.equal((await read(`surveys/${named.id}`)).survey.own,null)
 assert.equal((await read(`surveys/${named.id}`)).mayRespond,false)
 assert.ok((await read('surveys')).items.some(item=>item.id===named.id&&item.mayReadResults))
 assert.ok(!(await read('surveys')).items.some(item=>item.id===external.id))
 await read(`surveys/${external.id}`,undefined,404)
 await read(`surveys/${external.id}/results`,undefined,403)
 await read(`surveys/${anonymous}/results`,undefined,403)
 await read(`surveys/${named.id}/results?member=${insideMember.id}`,undefined,400)
 await read('survey.plan',{survey:named.id,theme:'View is not Edit',plan:'No publication',ownerMember:s.invited.member,dueDate:day(10)},403)
 await read('survey.plan.complete',{plan:action.id,evidence:'View is not ownership'},403)
 await read('survey.comment.hide',{answer:'unknown',reason:'View is not HR'},403)
 // A fixed nonrespondent stays in the scope check.
 const nonrespondent=await api('mover.schedule',{period:extraMembers[0].period,effectiveFrom:today,locationId:(await api('location.create',{name:'synthetic-willow-10412 moved nonrespondent',timezone:'UTC'})).id,reason:'Nonrespondent moves outside cohort reach'})
 await read(`surveys/${named.id}/results`,undefined,403)
 await api('terms.cancel',{terms:nonrespondent.terms,reason:'Restore nonrespondent scope'})
 assert.equal((await read(`surveys/${named.id}/results`)).access,'themes')
 // Scope is evaluated over the whole cohort, even a member who has answered.
 const location=await api('location.create',{name:'synthetic-willow-10067 moved survey subject',timezone:'UTC'})
 const moved=await api('mover.schedule',{period:inside.period,effectiveFrom:today,locationId:location.id,reason:'Move fixed survey cohort outside read scope'})
 await read(`surveys/${named.id}/results`,undefined,403)
 assert.ok(!(await read('surveys')).items.some(item=>item.id===named.id))
 await api('terms.cancel',{terms:moved.terms,reason:'Restore scoped survey proof'})
 assert.equal((await read(`surveys/${named.id}/results`)).access,'themes')
 // Everyone reach permits the anonymous survey's published themes only. Own
 // participation is still visible only to the same invited recipient.
 await apply({...scoped,scope:{kind:'everyone'},performanceFields:{self:{engagement:'view'},others:{engagement:'view'}}})
 assert.equal((await read(`surveys/${anonymous}/results`)).access,'themes')
 const pending=await api('survey.create',{name:'synthetic-willow-10068 pending anonymous survey',kind:'pulse',mode:'anonymous',deliveryDate:today,dueDate:day(7),members:[s.invited,s.managera,s.managerb,s.employee,s.payroll].map(m=>m.member),questions:[{key:'score',label:'Score',type:'score'}]})
 const work=(await read('work')).items.filter(item=>item.source.startsWith(`survey:${pending.id}:`))
 assert.deepEqual(work.map(item=>item.source),[`survey:${pending.id}:${s.invited.member}`],'Whole-cohort themes never expose another recipient’s anonymous participation or reminders')
 assert.ok(!(await read('work')).items.some(item=>item.source===`survey-review:${pending.id}`),'Theme View grants no HR result-review work')
 assert.deepEqual((await read(`surveys/${anonymous}`)).survey.own,{answered:true,declined:false})
 const secret=['synthetic-willow-10062','synthetic-willow-10020']
 for(const survey of [named.id,anonymous])for(const url of [`/api/willow/surveys/${survey}`,`/api/willow/surveys/${survey}/results`,`/app/surveys/${survey}`,`/app/surveys/${survey}/results`,`/app/surveys/${survey}.csv`]) {
  const response=await h.raw(url,{cookie});assert.equal(response.status,200,url)
  const text=await response.text();for(const value of secret)assert.ok(!text.includes(value),'Theme access never discloses named answers or anonymous comments through '+url)
 }
 const before=JSON.stringify((await api(`surveys/${anonymous}/results`)).aggregate)
 await apply({...scoped,performanceFields:{self:{},others:{}}})
 for(const survey of [named.id,anonymous]) {
  await read(`surveys/${survey}/results`,undefined,403)
  for(const url of [`/app/surveys/${survey}/results`,`/app/surveys/${survey}.csv`])assert.equal((await h.raw(url,{cookie})).status,403)
 }
 assert.equal((await read(`surveys/${anonymous}`)).survey.own.answered,true,'Field revocation preserves recipient-only participation')
 assert.equal(JSON.stringify((await api(`surveys/${anonymous}/results`)).aggregate),before,'Theme reads and revocation preserve native protected aggregates')
 assert.equal((await api(`surveys/${anonymous}/results`)).comments.length,5,'Native HR comment authority is retained')
 await engagementThemeBrowserProof(h,owner,cookie,scoped,named.id)
 await apply({...scoped,performanceFields:{self:{},others:{}}})
 console.log('ROLE-008 engagement themes: PASS — fixed-cohort scope, real named and anonymous response exclusions, page, JSON and CSV parity, current transfers and same-session revocation; no publication, ownership or HR-comment rights')
}

async function engagementThemeBrowserProof(h,owner,cookie,plan,survey) {
 if(process.env.WILLOW_PERFORMANCE_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,executablePath:process.env.WILLOW_CHROMIUM_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const contexts=[]
 const pageFor=async cookie=>{const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context);await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})));return context.newPage()}
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const submit=async(page,form,name)=>{const action=await form.getAttribute('action');const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname===action&&r.request().method()==='POST'),page.waitForNavigation({waitUntil:'load'}),form.getByRole('button',{name,exact:true}).click()]);assert.equal(response.status(),303);assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())}
 const capture=async(page,name,width)=>{await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${evidenceDirectory}/ROLE-008-engagement-${name}-${width}.png`,fullPage:true})}
 try {
  const admin=await pageFor(owner),reader=await pageFor(cookie)
  for(const width of [1440,390]) {
   for(const page of [admin,reader])await page.setViewportSize({width,height:1000})
   await admin.goto(h.origin+'/app/access')
   const editor=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:new RegExp('^'+plan.name+' ·')})}).first()
   await editor.locator('summary').click();await editor.getByLabel('Performance about others: Published engagement themes',{exact:true}).selectOption('view')
   await tooltipProof(admin);await capture(admin,'configure',width)
   await submit(admin,editor.locator('form'),'Review level');await capture(admin,'review',width)
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await reader.goto(h.origin+'/app/surveys');await tooltipProof(reader);await capture(reader,'list',width)
   await reader.getByRole('link',{name:'synthetic-willow-10060 scoped named survey',exact:true}).click()
   await reader.getByRole('link',{name:'Read protected results and themes',exact:true}).click()
   assert.ok((await reader.locator('main').textContent()).includes('synthetic-willow-10064'))
   for(const secret of ['synthetic-willow-10062','Named responses','Anonymous words'])assert.ok(!(await reader.locator('main').textContent()).includes(secret))
   await tooltipProof(reader);await capture(reader,'published-themes',width)
   const [download]=await Promise.all([reader.waitForEvent('download'),reader.getByRole('link',{name:'Download permitted results CSV',exact:true}).click()])
   const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk)
   const text=Buffer.concat(chunks).toString();assert.ok(text.includes('synthetic-willow-10064'));assert.ok(!text.includes('synthetic-willow-10062'))
   await api('level.apply',{review:(await api('level.preview',{...plan,performanceFields:{self:{},others:{}}})).id})
   assert.equal((await reader.goto(h.origin+`/app/surveys/${survey}/results`)).status(),403)
   await reader.goto(h.origin+'/app/surveys');assert.equal(await reader.getByRole('link',{name:'synthetic-willow-10060 scoped named survey',exact:true}).count(),0);await tooltipProof(reader);await capture(reader,'revoked',width)
  }
 } finally {for(const context of contexts)await context.close();await browser.close()}
}

async function reviewModeProof(h,owner,cookie,s,plan,level,inside,outside,today,day,join) {
 const api=(path,body,status)=>h.api(path,owner,body,status),write=(path,body,status)=>h.api(path,cookie,body,status),hr=(path,body,status)=>h.api(path,s.hr.cookie,body,status)
 const apply=async value=>api('level.apply',{review:(await api('level.preview',value)).id})
 const mode=async value=>apply({...plan,level,approvals:[],performanceFields:{self:{reviews:value},others:{reviews:value}}})
 const cycle=await api('performance.cycle',{name:'synthetic-willow-10100 review corrections',dueDate:day(20),people:[inside.person,outside.person,s.employee.person],questions:{self:['Outcome'],peer:['Collaboration'],manager:['Development']}})
 const release=async(person,summary)=>api('performance.release',{cycle:cycle.id,person,summary,rating:'Human rating'})
 await api('performance.note',{cycle:cycle.id,person:inside.person,note:'synthetic-willow-10122 confidential calibration',rating:'Private'})
 const feedback=await api('performance.assign',{cycle:cycle.id,person:inside.person,member:s.employee.member,role:'peer',dueDate:day(10)})
 await h.api('performance.respond',s.employee.cookie,{assignment:feedback.id,answers:['synthetic-willow-10123 confidential feedback']})
 const first=await release(inside.person,'synthetic-willow-10101 original release')
 const out=await release(outside.person,'synthetic-willow-10102 outside release')
 const latest=async()=>{const d=await api(`performance/${cycle.id}`);return d.summaries.filter(r=>r.person_id===inside.person).at(-1)}
 const correct=(review,summary)=>({review,summary,rating:'Corrected human rating'})
 await mode('view')
 await write('performance.correct',correct(first.id,'View cannot write'),403)
 await mode('edit')
 await write('performance.correct',correct(out.id,'Outside cannot write'),403)
 await write('performance.correct',correct('unknown-review','Cannot invent release'),404)
 await write('performance.release',{cycle:cycle.id,person:inside.person,summary:'No initial release authority',rating:'No'},403)
 const immediate=await write('performance.correct',correct(first.id,'synthetic-willow-10103 immediate correction'))
 assert.equal((await latest()).id,immediate.id)
 assert.equal((await latest()).created_by,s.invited.member)
 assert.ok((await api(`performance/${cycle.id}`)).summaries.some(r=>r.id===first.id&&r.summary==='synthetic-willow-10101 original release'))
 await write('performance.correct',correct(first.id,'Stale version'),409)
 await mode('approval')
 const pending=await write('performance.correct',correct(immediate.id,'synthetic-willow-10104 approved correction'))
 assert.equal(pending.status,'pending');assert.equal((await latest()).id,immediate.id)
 const request=await write(`self-changes/${pending.id}`)
 assert.equal(request.before.summary,'synthetic-willow-10103 immediate correction')
 assert.equal(request.after.summary,'synthetic-willow-10104 approved correction')
 assert.equal(request.mayDecide,false)
 const bundle=await h.raw('/app/exports/employees.zip?scope=organization&fields=name&person='+inside.person+'&history=reviews',{cookie})
 assert.equal(bundle.status,200)
 const bundleText=[...readZip(Buffer.from(await bundle.arrayBuffer())).values()].map(bytes=>bytes.toString()).join('\n')
 assert.ok(bundleText.includes('synthetic-willow-10104 approved correction'),'The requester exports their exact pending correction with review history')
 for(const value of ['synthetic-willow-10122','synthetic-willow-10123'])assert.ok(!bundleText.includes(value),'Review editing adds no confidential feedback or calibration')

 await write('self.decide',{change:pending.id,decision:'approve',comment:'No self approval'},403)
 await h.api(`self-changes/${pending.id}`,s.employee.cookie,undefined,404)
 assert.ok((await hr('work')).items.some(w=>w.source===`self-change:${pending.id}`))
 await hr('self.decide',{change:pending.id,decision:'approve',comment:'Reviewed exact correction'})
 assert.equal((await latest()).summary,'synthetic-willow-10104 approved correction')
 assert.equal((await write(`self-changes/${pending.id}`)).reconciliation,null)
 assert.ok(!(await api('self-exceptions')).some(r=>r.id===pending.id))
 await api('self.reconcile',{change:pending.id,reference:'No provider handoff'},409)
 await hr('self.decide',{change:pending.id,decision:'approve',comment:'No replay'},409)
 const stale=await write('performance.correct',correct((await latest()).id,'synthetic-willow-10105 stale proposal'))
 await release(inside.person,'synthetic-willow-10106 intervening HR release')
 await hr('self.decide',{change:stale.id,decision:'approve',comment:'Changed source'},409)
 await hr('self.decide',{change:stale.id,decision:'reject',comment:'Recreate from current release'})
 const revoked=await write('performance.correct',correct((await latest()).id,'synthetic-willow-10107 revoked proposal'))
 await mode('none')
 await write(`self-changes/${revoked.id}`,undefined,404)
 await hr('self.decide',{change:revoked.id,decision:'approve',comment:'Mode revoked'},403)
 await hr('self.decide',{change:revoked.id,decision:'reject',comment:'Revoked request retained'})
 await mode('approval')
 const moved=await write('performance.correct',correct((await latest()).id,'synthetic-willow-10108 moved proposal'))
 const destination=await api('location.create',{name:'synthetic-willow-10109 outside correction scope',timezone:'UTC'})
 const transfer=await api('mover.schedule',{period:inside.period,effectiveFrom:today,locationId:destination.id,reason:'Move beyond correction authority'})
 await hr('self.decide',{change:moved.id,decision:'approve',comment:'Scope moved'},403)
 await hr('self.decide',{change:moved.id,decision:'reject',comment:'Outside scope'})
 await api('terms.cancel',{terms:transfer.terms,reason:'Restore correction scope'})
 const withheld=await write('performance.correct',correct((await latest()).id,'synthetic-willow-10110 withheld proposal'))
 await api('performance.withhold',{summary:(await latest()).id,manager:s.invited.member,reason:'Named withholding blocks correction'})
 await write(`self-changes/${withheld.id}`,undefined,404)
 await hr('self.decide',{change:withheld.id,decision:'approve',comment:'Source withheld'},404)
 await hr('self.decide',{change:withheld.id,decision:'reject',comment:'Withheld source'})
 await release(inside.person,'synthetic-willow-10111 new released version')
 const ended=await join('synthetic-willow-10112')
 const invitation=await api('access.give',{person:ended.person}),endedCookie=await h.signIn('synthetic-willow-10112@example.com',{requested:true})
 await apply({kind:'assignment',member:invitation.id,levels:[level]})
 const endedRequest=await h.api('performance.correct',endedCookie,correct((await latest()).id,'synthetic-willow-10113 ended request'))
 await api('access.end',{person:ended.person})
 await hr('self.decide',{change:endedRequest.id,decision:'approve',comment:'Ended requester'},403)
 await hr('self.decide',{change:endedRequest.id,decision:'reject',comment:'Access ended'})
 // Self modes are independently selected; being a recipient grants no editing.
 const selfRelease=await release(s.employee.person,'synthetic-willow-10114 self release')
 await h.api('performance.correct',s.employee.cookie,correct(selfRelease.id,'Recipient has no edit'),403)
 const selfLevel=await apply({kind:'level',name:'synthetic-willow-10115 self corrections',permissions:[],performanceFields:{self:{reviews:'approval'},others:{}}})
 await apply({kind:'assignment',member:s.employee.member,levels:[selfLevel.id]})
 const selfRequest=await h.api('performance.correct',s.employee.cookie,correct(selfRelease.id,'synthetic-willow-10116 self proposed correction'))
 await hr('self.decide',{change:selfRequest.id,decision:'approve',comment:'Independent HR review'})
 await apply({kind:'level',level:selfLevel.id,name:'synthetic-willow-10115 self corrections',permissions:[],performanceFields:{self:{reviews:'edit'},others:{}}})
 const selfLatest=(await h.api(`performance/${cycle.id}`,s.employee.cookie)).summaries.filter(r=>r.person_id===s.employee.person).at(-1)
 await h.api('performance.correct',s.employee.cookie,correct(selfLatest.id,'synthetic-willow-10117 explicit self edit'))
 await apply({kind:'assignment',member:s.employee.member,levels:[]})
 const race=await write('performance.correct',correct((await latest()).id,'synthetic-willow-10124 concurrent approval'))
 const raced=await Promise.all([1,2].map(()=>h.raw('/api/willow/self.decide',{cookie:s.hr.cookie,body:{change:race.id,decision:'approve',comment:'One exact approval'}})))
 assert.deepEqual(raced.map(r=>r.status).sort(),[200,409])
 for(const response of raced)await response.arrayBuffer()
 assert.equal((await api(`performance/${cycle.id}`)).summaries.filter(r=>r.summary==='synthetic-willow-10124 concurrent approval').length,1)
 const text=JSON.stringify(await api(`performance/${cycle.id}`))
 for(const value of ['10105','10107','10108','10110','10113'])assert.ok(!text.includes('synthetic-willow-'+value))
 await reviewModeBrowserProof(h,owner,cookie,s.hr.cookie,plan,level,cycle.id,inside.person)
 await mode('view')
 const permitted=await write(`performance/${cycle.id}`)
 const download=await h.raw(`/app/performance/${cycle.id}.json`,{cookie})
 assert.deepEqual(await download.json(),permitted)
 assert.deepEqual(permitted.reviewActions,[])
 await mode('none')
 await write(`performance/${cycle.id}`,undefined,404)
 const audit=await api('audit')
 assert.ok(audit.some(e=>e.action==='performance.summary.correct'&&e.actor===s.invited.member&&e.detail.includes(pending.id)))
 console.log('ROLE-008 review modes: PASS — immutable corrections, exact independent HR approval, self modes, current scope, source, withholding, revocation and ended-access fences')
}

async function reviewModeBrowserProof(h,owner,cookie,hrCookie,plan,level,cycle,person) {
 if(process.env.WILLOW_PERFORMANCE_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,executablePath:process.env.WILLOW_CHROMIUM_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']}),contexts=[]
 const pageFor=async cookie=>{const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context);await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})));return context.newPage()}
 const submit=async(page,form,name)=>{const action=await form.getAttribute('action');const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname===action&&r.request().method()==='POST'),page.waitForNavigation({waitUntil:'load'}),form.getByRole('button',{name,exact:true}).click()]);assert.equal(response.status(),303);assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())}
 const capture=async(page,name,width)=>{await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${evidenceDirectory}/ROLE-008-review-${name}-${width}.png`,fullPage:true})}
 try {
  const admin=await pageFor(owner),writer=await pageFor(cookie),hr=await pageFor(hrCookie)
  for(const width of [1440,390]) {
   for(const page of [admin,writer,hr])await page.setViewportSize({width,height:1000})
   for(const mode of ['edit','approval']) {
    await admin.goto(h.origin+'/app/access')
    const editor=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:new RegExp('^'+plan.name+' ·')})}).first()
    await editor.locator('summary').click();await editor.getByLabel('Performance about others: Released reviews',{exact:true}).selectOption(mode)
    await tooltipProof(admin);await capture(admin,mode+'-level',width)
    await submit(admin,editor.locator('form'),'Review level');await capture(admin,mode+'-impact',width)
    await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
    await writer.goto(h.origin+`/app/performance/${cycle}`)
    const correct=writer.locator('form[action="/app/do/performance.correct"]').last()
    await correct.locator('..').locator('summary').click()
    const value=`synthetic-willow-10120-${mode}-${width}`
    await correct.getByLabel('Corrected summary',{exact:true}).fill(value)
    await correct.getByLabel('Human rating',{exact:true}).fill('Human corrected rating')
    await tooltipProof(writer);await capture(writer,mode+'-form',width)
    await submit(writer,correct,mode==='edit'?'Release correction':'Request review correction')
    if(mode==='approval') {
     const pending=(await h.api('self-changes',cookie)).find(r=>r.kind==='review'&&r.after.summary===value)
     assert.equal(pending.status,'pending')
     assert.ok(!(await h.api(`performance/${cycle}`,cookie)).summaries.some(r=>r.summary===value))
     await writer.goto(h.origin+`/app/self-changes/${pending.id}`);assert.equal(await writer.getByRole('button',{name:'Record decision',exact:true}).count(),0)
     await tooltipProof(writer);await capture(writer,'pending',width)
     await hr.goto(h.origin+`/app/self-changes/${pending.id}`)
     const decision=hr.locator('form[action="/app/do/self.decide"]')
     await decision.getByLabel('Decision',{exact:true}).selectOption('approve');await decision.getByLabel('Comment',{exact:true}).fill('Reviewed exact summary and rating')
     await tooltipProof(hr);await capture(hr,'hr-decision',width);await submit(hr,decision,'Record decision')
    }
    await writer.goto(h.origin+`/app/performance/${cycle}`);assert.ok((await writer.locator('body').textContent()).includes(value));await capture(writer,mode+'-released',width)
   }
  }
 } finally {for(const context of contexts)await context.close();await browser.close()}
}

export async function reviewMigrationProof() {
 const {harness}=await import('./harness.mjs')
 const person='synthetic-willow-10201',requester='synthetic-willow-10202'
 const oldRequests=['pending','approved','rejected'].map((status,index)=>({id:`synthetic-willow-${10210+index}`,status,before:{legalName:person},after:{legalName:`synthetic-willow-${10220+index}`}}))
 const sql=value=>"'"+String(value).replaceAll("'","''")+"'"
 const fixture=[
  `INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES('synthetic-willow-10200','synthetic-willow-10200@example.test','synthetic-willow-10200','owner','active',0);`,
  `INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at) VALUES(1,'synthetic-willow-10200',0);`,
  `INSERT INTO wl_employer(singleton,name,timezone,country,currency,updated_at) VALUES(1,'synthetic-willow-10203','UTC','AU','AUD',0);`,
  `INSERT INTO wl_people(id,legal_name,work_email,revision,created_at,updated_at) VALUES('${person}','${person}','${requester}@example.test','synthetic-willow-10204',0,0);`,
  `INSERT INTO wl_person_private(person_id) VALUES('${person}');`,
  `INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES('${requester}','${requester}@example.test','${requester}','member','active',0);`,
  `INSERT INTO wl_members(id,email,name,person_id,status,created_at) VALUES('${requester}','${requester}@example.test','${requester}','${person}','active',0);`,
  `INSERT INTO wl_levels(id,name) VALUES('synthetic-willow-10205','synthetic-willow-10205');`,
  `INSERT INTO wl_member_levels(member_id,level_id) VALUES('${requester}','synthetic-willow-10205');`,
  `INSERT INTO wl_level_performance_fields(level_id,relation,field,mode) VALUES('synthetic-willow-10205','others','reviews','view');`,
  ...oldRequests.flatMap(row=>[
   `INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,requested_by,requested_at,due_date) VALUES('${row.id}','${person}','legalName',NULL,${sql(JSON.stringify(row.before))},${sql(JSON.stringify(row.after))},'synthetic-willow-10204','${requester}',0,'2099-01-01');`,
   ...row.status==='pending'?[]:[`INSERT INTO wl_self_decisions VALUES('${row.id}','${row.status}','synthetic-willow-10200',1,'synthetic-willow-10230 retained decision');`],
   ...row.status==='approved'?[`INSERT INTO wl_self_reconciliation VALUES('${row.id}','synthetic-willow-10231 retained handoff','synthetic-willow-10200',2);`]:[],
  ]),
 ].join('\n')
 const h=await harness({bindings:{OWNER_EMAIL:'synthetic-willow-10200@example.test'},upgrade:{before:'0074_review_corrections.sql',sql:fixture,snapshot:'SELECT id FROM wl_self_changes ORDER BY id'}})
 try {
  assert.equal(h.upgradeSnapshot.length,3)
  const owner=await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
  const changes=await h.api('self-changes',owner)
  for(const prior of oldRequests) {
   const current=changes.find(row=>row.id===prior.id)
   assert.ok(current);assert.equal(current.status,prior.status)
   assert.deepEqual(current.before,prior.before);assert.deepEqual(current.after,prior.after)
   if(prior.status!=='pending')assert.equal(current.decision.comment,'synthetic-willow-10230 retained decision')
   if(prior.status==='approved')assert.equal(current.reconciliation.reference,'synthetic-willow-10231 retained handoff')
  }
  const reader=await h.signIn(`${requester}@example.test`)
  const review=await h.api('performance.cycle',owner,{name:'synthetic-willow-10240',people:[person],dueDate:'2099-01-01',questions:{self:['Outcome'],peer:['Collaboration'],manager:['Development']}})
  const summary=await h.api('performance.release',owner,{cycle:review.id,person,summary:'synthetic-willow-10241 retained read',rating:'Human rating'})
  assert.ok((await h.api(`performance/${review.id}`,reader)).summaries.some(row=>row.id===summary.id))
  await h.api('performance.correct',reader,{review:summary.id,summary:'No new write grant',rating:'Unapproved'},403)
  await h.api('self.decide',owner,{change:oldRequests[0].id,decision:'approve',comment:'Apply preserved pending request'})
  assert.equal((await h.api(`people/${person}`,owner)).legalName,oldRequests[0].after.legalName)
  await h.api('self.decide',owner,{change:oldRequests[0].id,decision:'approve',comment:'No duplicate application'},409)
  console.log('ROLE-008 migration: PASS — persisted pending requests remain actionable, decisions and handoffs survive, existing performance authority is unchanged')
 } finally {await h.close()}
}

export async function trainingModeProof(h,owner,cookie,s,inside,outside,day,join) {
 const api=(path,body,status)=>h.api(path,owner,body,status),write=(path,body,status)=>h.api(path,cookie,body,status),hr=(path,body,status)=>h.api(path,s.hr.cookie,body,status)
 const apply=async value=>api('level.apply',{review:(await api('level.preview',value)).id})
 const location=await api('location.create',{name:'synthetic-willow-10300 training scope',timezone:'UTC'})
 const person=await join('synthetic-willow-10301',{locationId:location.id})
 const course=await api('training.course',{title:'synthetic-willow-10302 reviewed course',selfCompletion:true})
 const closedCourse=await api('training.course',{title:'synthetic-willow-10303 verified completion only',selfCompletion:false})
 const fields=(value)=>({trainingAssignments:value,trainingCompletions:value,trainingCertifications:value})
 const plan={kind:'level',name:'synthetic-willow-10304 Training',permissions:[],scope:{kind:'group',dimensions:{location:[location.id]}},performanceFields:{self:{},others:fields('view')}}
 const level=await apply(plan)
 const set=async(value,self={})=>apply({...plan,level:level.id,performanceFields:{self,others:typeof value==='string'?fields(value):value}})
 await apply({kind:'assignment',member:s.invited.member,levels:[level.id]})
 const assignment={person:person.person,course:course.id,dueDate:day(30)}
 await write('training.course',{title:'Cannot define a course',selfCompletion:true},403)
 await write('training.assign',assignment,403)
 assert.deepEqual((await write('training')).assignments,[])
 await set('edit')
 await write('training.assign',{...assignment,person:outside.person},403)
 const immediate=await write('training.assign',assignment)
 assert.ok((await hr('work')).items.some(item=>item.source===`training:${immediate.id}`))
 await write('training.complete',{assignment:immediate.id,evidence:'synthetic-willow-10305 observed completion',certificate:'synthetic-willow-10306 reviewed certificate'})
 await write('training.complete',{assignment:immediate.id,evidence:'No duplicate completion'},409)
 let records=await write('training')
 assert.deepEqual(records.assignments.map(r=>r.id),[immediate.id])
 assert.equal(records.assignments[0].person,person.person)
 assert.equal(records.assignments[0].course,course.id)
 assert.equal(records.assignments[0].assignment.dueDate,day(30))
 assert.equal(records.assignments[0].completion.evidence,'synthetic-willow-10305 observed completion')
 assert.ok(!(await hr('work')).items.some(item=>item.source===`training:${immediate.id}`))
 assert.equal(records.assignments[0].certification.evidence,'synthetic-willow-10306 reviewed certificate')
 assert.deepEqual(records.connection,{provider:'TalentLMS',connected:false,state:'Not connected'})
 await set({trainingAssignments:'view'})
 records=await write('training')
 assert.equal(records.assignments[0].completion,null);assert.equal(records.assignments[0].certification,null)
 const withoutCertificate=await api('training.assign',assignment)
 assert.ok((await api('training')).assignments.some(row=>row.id===withoutCertificate.id&&row.completion===null))
 await set({trainingCertifications:'view'})
 records=await write('training')
 assert.equal(records.assignments[0].assignment,null);assert.equal(records.assignments[0].completion,null)
 assert.equal(records.assignments[0].certification.evidence,'synthetic-willow-10306 reviewed certificate')
 assert.deepEqual(records.assignments.map(row=>row.id),[immediate.id],'Certification View reveals no incomplete enrollment')
 await set({trainingCompletions:'view'})
 records=await write('training')
 assert.deepEqual(records.assignments.map(row=>row.id),[immediate.id],'Completion View reveals no incomplete enrollment')
 assert.equal(records.assignments[0].assignment,null);assert.equal(records.assignments[0].certification,null)
 await set('approval')
 const pending=await write('training.assign',assignment)
 assert.equal(pending.status,'pending')
 assert.ok((await hr('work')).items.some(item=>item.source===`self-change:${pending.id}`))
 assert.ok(!(await write('training')).assignments.some(r=>r.id===pending.assignment))
 assert.deepEqual((await write('training')).requests.find(r=>r.id===pending.id).payload,assignment)
 assert.equal((await write('training')).requests.find(r=>r.id===pending.id).personName,'synthetic-willow-10301')
 assert.equal((await write('training')).requests.find(r=>r.id===pending.id).courseTitle,'synthetic-willow-10302 reviewed course')
 await write('self.decide',{change:pending.id,decision:'approve',comment:'No self approval'},403)
 const proposal=await write(`self-changes/${pending.id}`)
 assert.equal(proposal.kind,'training')
 assert.equal(proposal.trainingCourse,'synthetic-willow-10302 reviewed course')
 assert.equal(proposal.before,null)
 assert.deepEqual(proposal.after.payload,assignment)
 assert.equal(proposal.owner,'Approver')
 assert.match(proposal.dueDate,/^\d{4}-\d{2}-\d{2}$/)
 await h.api(`self-changes/${pending.id}`,s.managerb.cookie,undefined,404)
 await hr('self.decide',{change:pending.id,decision:'approve',comment:'Reviewed exact assignment'})
 const decided=await write(`self-changes/${pending.id}`)
 assert.equal(decided.status,'approved')
 assert.equal(decided.decision.by,s.hr.member)
 assert.equal(decided.decision.comment,'Reviewed exact assignment')
 assert.deepEqual(decided.after,proposal.after)
 assert.equal(decided.reconciliation,null,'Manual training has no external handoff')
 assert.ok(!(await hr('self-exceptions')).some(row=>row.id===pending.id))
 await hr('self.reconcile',{change:pending.id,reference:'No provider action was performed'},409)
 await hr('self.decide',{change:pending.id,decision:'approve',comment:'Cannot replay the exact decision'},409)
 assert.ok(!(await hr('work')).items.some(item=>item.source===`self-change:${pending.id}`||item.source===`self-exception:${pending.id}`))

 const completion=await write('training.complete',{assignment:pending.assignment,evidence:'synthetic-willow-10307 pending completion',certificate:'synthetic-willow-10308 pending certificate'})
 assert.equal((await write('training')).assignments.find(r=>r.id===pending.assignment).completion,null)
 const completionProposal=await write(`self-changes/${completion.id}`)
 assert.deepEqual(completionProposal.before,{assignment:pending.assignment,course:course.id,dueDate:assignment.dueDate})
 assert.equal(completionProposal.after.payload.evidence,'synthetic-willow-10307 pending completion')
 assert.equal(completionProposal.after.payload.certificate,'synthetic-willow-10308 pending certificate')
 const approvalWork=(await hr('work')).items.find(item=>item.source===`self-change:${completion.id}`)
 assert.ok(approvalWork)
 await api('work.schedule',{source:approvalWork.source,revision:approvalWork.revision,owner:s.hr.member,substitute:'',dueDate:day(0),nextAction:'Review the exact training proposal'})
 await api('work.policy',{offsets:'0',quietStart:20,quietEnd:8,defaultDays:1})
 await api('connections.notices',{enabled:true})
 const tick=()=>h.raw(`/cdn-cgi/local/scheduled?time=${Date.parse(day(0)+'T09:00:00Z')}&cron=${encodeURIComponent('*/15 * * * *')}&format=json`)
 for(let count=0;count<2;count++){const response=await tick();assert.equal(response.status,200);await response.arrayBuffer()}
 const notified=(await hr('work')).items.find(item=>item.source===approvalWork.source)
 assert.deepEqual(notified.deliveries.map(row=>[row.recipient,row.status]),[[s.hr.member,'accepted']],'Shared approval reminder is delivered once to its current HR owner')
 const notices=JSON.stringify(h.businessMail())
 for(const value of ['synthetic-willow-10307 pending completion','synthetic-willow-10308 pending certificate'])assert.ok(!notices.includes(value),'Fixed training notices carry no evidence')


 const races=await Promise.all([1,2].map(()=>h.raw('/api/willow/self.decide',{cookie:s.hr.cookie,body:{change:completion.id,decision:'approve',comment:'One immutable completion'}})))
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);for(const r of races)await r.arrayBuffer()
 assert.equal((await write('training')).assignments.find(r=>r.id===pending.assignment).completion.evidence,'synthetic-willow-10307 pending completion')
 assert.ok(!(await hr('work')).items.some(item=>item.source===approvalWork.source))
 const countAfterDecision=h.businessMail().length,finishedTick=await tick();assert.equal(finishedTick.status,200);await finishedTick.arrayBuffer()
 assert.equal(h.businessMail().length,countAfterDecision,'A decided training approval sends no later reminder')

 const waiveAssignment=await api('training.assign',assignment)
 const waive=await write('training.waive',{assignment:waiveAssignment.id,evidence:'synthetic-willow-10309 approved waiver'})
 assert.equal((await write('training')).assignments.find(r=>r.id===waiveAssignment.id).completion,null)
 await hr('training.decide',{request:waive.id,decision:'approve',reason:'Reviewed waiver'})
 assert.equal((await hr(`self-changes/${waive.id}`)).status,'approved','The compatibility door consumes the shared decision')
 assert.equal((await write('training')).assignments.find(r=>r.id===waiveAssignment.id).completion.outcome,'waived')
 const staleAssignment=await api('training.assign',assignment)
 const stale=await write('training.complete',{assignment:staleAssignment.id,evidence:'Cannot replace an intervening outcome'})
 await api('training.waive',{assignment:staleAssignment.id,evidence:'Intervening HR waiver'})
 await hr('self.decide',{change:stale.id,decision:'approve',comment:'Source changed'},409)
 assert.equal((await hr(`self-changes/${stale.id}`)).status,'pending')
 await hr('self.decide',{change:stale.id,decision:'reject',comment:'Recreate from the current state'})
 assert.equal((await hr(`self-changes/${stale.id}`)).status,'rejected')
 assert.equal((await write('training')).assignments.find(row=>row.id===staleAssignment.id).completion.outcome,'waived')
 const revoke=await write('training.assign',assignment)
 await set('none')
 assert.deepEqual((await write('training')).assignments,[])
 assert.deepEqual((await write('training')).requests,[])
 await write(`self-changes/${revoke.id}`,undefined,404)
 assert.ok(!(await write('self-changes')).some(row=>row.id===revoke.id))
 await hr('self.decide',{change:revoke.id,decision:'approve',comment:'Rights revoked'},403)
 await hr('self.decide',{change:revoke.id,decision:'reject',comment:'Requester no longer authorized'})
 await set('approval')
 const moved=await write('training.assign',assignment)
 const transfer=await api('mover.schedule',{period:person.period,effectiveFrom:day(0),locationId:(await api('location.create',{name:'synthetic-willow-10310 outside training scope',timezone:'UTC'})).id,reason:'Move outside training scope'})
 assert.deepEqual((await write('training')).assignments,[])
 await hr('self.decide',{change:moved.id,decision:'approve',comment:'Scope changed'},403)
 await hr('self.decide',{change:moved.id,decision:'reject',comment:'Outside scope'})
 await api('terms.cancel',{terms:transfer.terms,reason:'Restore training scope'})
 const selfPerson=await join('synthetic-willow-10311')
 const member=await api('access.give',{person:selfPerson.person})
 let selfCookie=await h.signIn('synthetic-willow-10311@example.com',{requested:true})
 const selfLevel=await apply({kind:'level',name:'synthetic-willow-10312 self training',permissions:[],performanceFields:{self:fields('edit'),others:{}}})
 await apply({kind:'assignment',member:member.id,levels:[selfLevel.id]})
 const own=await api('training.assign',{...assignment,person:selfPerson.person})
 await h.api('training.assign',selfCookie,{...assignment,person:selfPerson.person},403)
 await h.api('training.waive',selfCookie,{assignment:own.id,evidence:'Cannot waive own requirement'},403)
 await h.api('training.complete',selfCookie,{assignment:own.id,evidence:'Cannot self issue a certificate',certificate:'synthetic-willow-10313'},403)
 await h.api('training.complete',selfCookie,{assignment:own.id,evidence:'synthetic-willow-10314 self acknowledgment'})
 const denied=await api('training.assign',{...assignment,person:selfPerson.person,course:closedCourse.id})
 await h.api('training.complete',selfCookie,{assignment:denied.id,evidence:'Course forbids self completion'},403)
 const outsideAssignment=await api('training.assign',{...assignment,person:outside.person})
 await write('training.complete',{assignment:outsideAssignment.id,evidence:'Scoped recorder cannot complete an out-of-scope assignment'},403)
 await api('training.complete',{assignment:outsideAssignment.id,evidence:'synthetic-willow-10319 outside completion',certificate:'synthetic-willow-10325 outside certificate'})
 const scopedRecords=await write('training')
 assert.ok(scopedRecords.assignments.length>0)
 assert.ok(scopedRecords.assignments.every(row=>row.person===person.person),'Existing out-of-scope completions and certificates stay absent')
 await h.api('training.complete',selfCookie,{assignment:outsideAssignment.id,evidence:'No other-person rights'},403)
 await apply({kind:'level',level:selfLevel.id,name:'synthetic-willow-10312 self training',permissions:[],performanceFields:{self:{trainingAssignments:'view',trainingCompletions:'approval'},others:{}}})
 const selfPendingAssignment=await api('training.assign',{...assignment,person:selfPerson.person})
 const selfPending=await h.api('training.complete',selfCookie,{assignment:selfPendingAssignment.id,evidence:'synthetic-willow-10316 self approval request'})
 assert.equal(selfPending.status,'pending')
 await api('member.permissions',{member:member.id,permissions:['people.manage']})
 selfCookie=await h.signIn('synthetic-willow-10311@example.com')
 await h.api('training.decide',selfCookie,{request:selfPending.id,decision:'approve',reason:'Cannot approve own request even after becoming HR'},403)
 await hr('self.decide',{change:selfPending.id,decision:'approve',comment:'Independent approval of the subject acknowledgment'})
 assert.equal((await h.api('training',selfCookie)).assignments.find(r=>r.id===selfPendingAssignment.id).completion.evidence,'synthetic-willow-10316 self approval request')
 await set({trainingAssignments:'edit',trainingCompletions:'edit',trainingCertifications:'approval'})
 const certificationAssignment=await write('training.assign',assignment)
 const certificationRequest=await write('training.complete',{assignment:certificationAssignment.id,evidence:'synthetic-willow-10317 exact completion',certificate:'synthetic-willow-10318 independent certificate approval'})
 assert.equal(certificationRequest.status,'pending','The certificate mode independently requires approval')
 assert.equal((await write('training')).assignments.find(r=>r.id===certificationAssignment.id).completion,null)
 await hr('self.decide',{change:certificationRequest.id,decision:'approve',comment:'Reviewed certificate independently'})
 assert.equal((await write('training')).assignments.find(r=>r.id===certificationAssignment.id).certification.evidence,'synthetic-willow-10318 independent certificate approval')
 await set('edit')
 const waiver=await write('training.assign',assignment)
 await write('training.waive',{assignment:waiver.id,evidence:'synthetic-willow-10315 immediate waiver'})
 assert.equal((await write('training')).assignments.find(r=>r.id===waiver.id).completion.outcome,'waived')
 // A certificate grant in another scope cannot combine with this scope's completion authority.
 await set({trainingAssignments:'edit',trainingCompletions:'edit'})
 const otherLocation=await api('location.create',{name:'synthetic-willow-10326 separate certification scope',timezone:'UTC'})
 const separate=await apply({kind:'level',name:'synthetic-willow-10327 separate certificates',permissions:[],scope:{kind:'group',dimensions:{location:[otherLocation.id]}},performanceFields:{self:{},others:{trainingCertifications:'edit'}}})
 await apply({kind:'assignment',member:s.invited.member,levels:[level.id,separate.id]})
 const mixed=await write('training.assign',assignment)
 await write('training.complete',{assignment:mixed.id,evidence:'No cross-scope certification',certificate:'synthetic-willow-10328'},403)
 await write('training.complete',{assignment:mixed.id,evidence:'synthetic-willow-10329 permitted completion'})
 assert.equal((await write('training')).assignments.find(row=>row.id===mixed.id).completion.evidence,'synthetic-willow-10329 permitted completion')
 await apply({kind:'assignment',member:s.invited.member,levels:[level.id]})
 await set('edit')
 await trainingBrowserProof(h,owner,cookie,s.hr.cookie,plan,level.id,assignment)
 await set('view')
 const html=await h.raw('/app/training',{cookie});assert.equal(html.status,200)
 const body=await html.text();assert.ok(body.includes('synthetic-willow-10306 reviewed certificate'));assert.ok(!body.includes('synthetic-willow-10314 self acknowledgment'))
 await api('access.end',{person:selfPerson.person})
 await h.api('training.complete',selfCookie,{assignment:denied.id,evidence:'Ended session'},401)
 assert.equal((await api('training')).assignments.find(r=>r.id===own.id).completion.evidence,'synthetic-willow-10314 self acknowledgment')
 for(const reader of [owner,cookie,s.hr.cookie]) {
  const context=JSON.stringify(await h.api(`context/${person.person}`,reader))
  for(const value of ['synthetic-willow-10305 observed completion','synthetic-willow-10306 reviewed certificate','synthetic-willow-10307 pending completion'])assert.ok(!context.includes(value),'Training evidence stays out of agent context')
 }

 await set('none')
 assert.deepEqual((await write('training')).assignments,[])
 const audit=await api('audit')
 assert.ok(audit.some(e=>e.action==='training.complete'&&e.actor===s.invited.member))
 assert.ok(audit.some(e=>e.action==='selfChange.decide'&&e.actor===s.hr.member))
 console.log('ROLE-009 native modes: PASS — exact scoped assignments, completions, certifications, independent approval, stale and concurrent refusal, self-course restrictions, immediate revocation, retained exit history and disconnected TalentLMS')
}

async function trainingBrowserProof(h,owner,cookie,hrCookie,plan,level,assignment) {
 if(process.env.WILLOW_PERFORMANCE_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,executablePath:process.env.WILLOW_CHROMIUM_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']}),contexts=[]
 const pageFor=async cookie=>{const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context);await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})));return context.newPage()}
 const submit=async(page,form,name)=>{const action=await form.getAttribute('action');const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname===action&&r.request().method()==='POST'),page.waitForNavigation({waitUntil:'load'}),form.getByRole('button',{name,exact:true}).click()]);assert.equal(response.status(),303);assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())}
 const capture=async(page,name,width)=>{await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await tooltipProof(page);await page.screenshot({path:`${evidenceDirectory}/ROLE-009-${name}-${width}.png`,fullPage:true})}
 try {
  const admin=await pageFor(owner),writer=await pageFor(cookie),reviewer=await pageFor(hrCookie)
  for(const width of [1440,390]) {
   for(const page of [admin,writer,reviewer])await page.setViewportSize({width,height:1000})
   await admin.goto(h.origin+'/app/settings/training')
   const courseForm=admin.locator('form[action="/app/do/training.course"]')
   await courseForm.getByLabel('Course title',{exact:true}).fill(`synthetic-willow-10320 course ${width}`)
   await courseForm.getByLabel('Allow self completion',{exact:true}).check()
   await capture(admin,'course-settings',width);await submit(admin,courseForm,'Add course')
   await admin.goto(h.origin+'/app/access')
   const editor=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:new RegExp('^'+plan.name+' ·')})}).first()
   await editor.locator('summary').click()
   for(const label of ['Training assignments','Training completions','Training certifications'])await editor.getByLabel('Performance about others: '+label,{exact:true}).selectOption('approval')
   await capture(admin,'level-form',width);await submit(admin,editor.locator('form'),'Review level');await capture(admin,'level-impact',width)
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await writer.goto(h.origin+'/app/training');await writer.locator('summary').filter({hasText:/^Assign training$/}).click()
   const assign=writer.locator('form[action="/app/do/training.assign"]')
   await assign.getByLabel('Person',{exact:true}).selectOption(assignment.person)
   await assign.getByLabel('Course',{exact:true}).selectOption(assignment.course)
   await assign.getByLabel('Due date',{exact:true}).fill(assignment.dueDate)
   await capture(writer,'assign',width);await submit(writer,assign,'Assign training');await capture(writer,'pending',width)
   const request=(await h.api('training',cookie)).requests.filter(r=>r.operation==='assign'&&r.status==='pending').at(-1)
   assert.ok(request)
   assert.ok(!(await h.api('training',cookie)).assignments.some(r=>r.id===request.assignment))
   await reviewer.goto(h.origin+'/app/self-changes/'+request.id)
   const decision=reviewer.locator('form[action="/app/do/self.decide"]')
   await decision.getByLabel('Comment',{exact:true}).fill('Reviewed native training assignment')
   await capture(reviewer,'decision',width);await submit(reviewer,decision,'Record decision')
   await writer.goto(h.origin+'/app/training');await capture(writer,'records',width)
   const complete=writer.locator('form[action="/app/do/training.complete"]').filter({has:writer.locator(`input[name="assignment"][value="${request.assignment}"]`)})
   const completionEvidence=`synthetic-willow-10321 completed ${width}`,certificateEvidence=`synthetic-willow-10322 certified ${width}`
   await complete.getByLabel('Completion evidence',{exact:true}).fill(completionEvidence)
   await complete.getByLabel('Certification evidence (optional)',{exact:true}).fill(certificateEvidence)
   await capture(writer,'completion-form',width);await submit(writer,complete,'Request completion')
   const completion=(await h.api('training',cookie)).requests.find(r=>r.status==='pending'&&r.payload.evidence===completionEvidence)
   assert.ok(completion);assert.equal((await h.api('training',cookie)).assignments.find(r=>r.id===request.assignment).completion,null)
   await reviewer.goto(h.origin+'/app/self-changes/'+completion.id)
   const approve=reviewer.locator('form[action="/app/do/self.decide"]')
   await approve.getByLabel('Comment',{exact:true}).fill('Reviewed completion and certification evidence')
   await capture(reviewer,'completion-decision',width);await submit(reviewer,approve,'Record decision');await capture(reviewer,'decision-history',width)
   await writer.goto(h.origin+'/app/training');assert.ok((await writer.locator('main').textContent()).includes(certificateEvidence));await capture(writer,'completed-certificate',width)
   const waiverAssignment=await h.api('training.assign',owner,assignment)
   await writer.goto(h.origin+'/app/training')
   const waiver=writer.locator('form[action="/app/do/training.waive"]').filter({has:writer.locator(`input[name="assignment"][value="${waiverAssignment.id}"]`)})
   await waiver.locator('..').locator('summary').click()
   await waiver.getByLabel('Waiver reason',{exact:true}).fill(`synthetic-willow-10323 waiver ${width}`)
   await capture(writer,'waiver-form',width);await submit(writer,waiver,'Request waiver')
   await h.api('level.apply',owner,{review:(await h.api('level.preview',owner,{...plan,level,performanceFields:{self:{},others:{trainingAssignments:'edit',trainingCompletions:'edit',trainingCertifications:'edit'}}})).id})
   const direct=await h.api('training.assign',owner,assignment)
   await writer.goto(h.origin+'/app/training')
   const directForm=writer.locator('form[action="/app/do/training.complete"]').filter({has:writer.locator(`input[name="assignment"][value="${direct.id}"]`)})
   await directForm.getByLabel('Completion evidence',{exact:true}).fill(`synthetic-willow-10324 direct completion ${width}`)
   await capture(writer,'immediate-completion-form',width);await submit(writer,directForm,'Record completion')
   assert.equal((await h.api('training',cookie)).assignments.find(r=>r.id===direct.id).completion.evidence,`synthetic-willow-10324 direct completion ${width}`)
   await capture(writer,'immediate-completion',width)
   await h.api('level.apply',owner,{review:(await h.api('level.preview',owner,{...plan,level,performanceFields:{self:{},others:{trainingCertifications:'view'}}})).id})
   await writer.goto(h.origin+'/app/training');assert.equal(await writer.locator('form[action="/app/do/training.complete"]').count(),0);assert.ok(!(await writer.locator('main').textContent()).includes(completionEvidence));await capture(writer,'certification-view',width)
   await h.api('level.apply',owner,{review:(await h.api('level.preview',owner,{...plan,level,performanceFields:{self:{},others:{}}})).id})
   await writer.goto(h.origin+'/app/training');assert.equal(await writer.locator('form[action="/app/do/training.complete"]').count(),0);assert.ok(!(await writer.locator('main').textContent()).includes(certificateEvidence));await capture(writer,'revoked',width)
  }
 } finally {for(const context of contexts)await context.close();await browser.close()}
}

export async function trainingMigrationProof() {
 const {harness}=await import('./harness.mjs')
 const id=n=>`synthetic-willow-${10400+n}`,mail=n=>[id(n),'example.test'].join('@')
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'"
 const rows=['pending','approved','rejected'].map((status,n)=>({id:id(10+n),target:id(20+n),status,payload:{person:id(1),course:id(3),dueDate:'2099-01-01'}}))
 const fixture=[
  `INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(${quote(id(0))},${quote(mail(0))},${quote(id(0))},'owner','active',0);`,
  `INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at) VALUES(1,${quote(id(0))},0);`,
  `INSERT INTO wl_employer(singleton,name,timezone,country,currency,updated_at) VALUES(1,${quote(id(4))},'UTC','AU','AUD',0);`,
  `INSERT INTO wl_people(id,legal_name,revision,created_at,updated_at) VALUES(${quote(id(1))},${quote(id(1))},${quote(id(5))},0,0);`,
  `INSERT INTO wl_person_private(person_id) VALUES(${quote(id(1))});`,
  `INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(${quote(id(2))},${quote(mail(2))},${quote(id(2))},'member','active',0);`,
  `INSERT INTO wl_members(id,email,name,status,created_at) VALUES(${quote(id(2))},${quote(mail(2))},${quote(id(2))},'active',0);`,
  `INSERT INTO wl_permissions(member_id,permission,granted_by,granted_at) VALUES(${quote(id(2))},'people.manage',${quote(id(0))},0);`,
  `INSERT INTO wl_training_courses VALUES(${quote(id(3))},${quote(id(3))},1,${quote(id(0))},0);`,
  `INSERT INTO wl_members(id,email,name,status,created_at) VALUES(${quote(id(0))},${quote(mail(0))},${quote(id(0))},'active',0);`,
  `INSERT INTO wl_work_schedule VALUES(${quote('training-request:'+rows[0].id)},${quote(id(0))},NULL,'2099-01-01','Retained training follow-up',${quote(id(40))},${quote(id(0))},2);`,
  `INSERT INTO wl_work_history(source,at,actor,kind,detail) VALUES(${quote('training-request:'+rows[0].id)},1,${quote(id(0))},'schedule.changed','{}');`,
  `INSERT INTO wl_work_deliveries(id,source,schedule_revision,policy_revision,step,recipient,status,created_at) VALUES(${quote(id(41))},${quote('training-request:'+rows[0].id)},${quote(id(40))},${quote(id(42))},0,${quote(id(0))},'accepted',1);`,
  ...rows.flatMap(row=>[
   `INSERT INTO wl_training_requests VALUES(${quote(row.id)},${quote(id(1))},'assign',${quote(row.target)},${quote(JSON.stringify(row.payload))},'new',${quote(id(2))},0);`,
   ...row.status==='pending'?[]:[`INSERT INTO wl_training_decisions VALUES(${quote(row.id)},${quote(row.status)},${quote(id(0))},1,'Retained exact decision');`],
   ...row.status==='approved'?[`INSERT INTO wl_training_assignments VALUES(${quote(row.target)},${quote(id(1))},${quote(id(3))},'2099-01-01',${quote(id(2))},1);`]:[],
  ]),
  `INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,requested_by,requested_at,due_date) VALUES(${quote(id(31))},${quote(id(1))},'recordRow','retained-row','null','{"table":"table-certifications"}','new',${quote(id(2))},0,'2099-01-01');`,
  `INSERT INTO wl_self_changes(id,person_id,kind,before_json,after_json,source_revision,requested_by,requested_at,due_date) VALUES(${quote(id(30))},${quote(id(1))},'legalName','{}','{}',${quote(id(5))},${quote(id(2))},0,'2099-01-01');`,
  `INSERT INTO wl_self_decisions VALUES(${quote(id(30))},'approved',${quote(id(0))},1,'Retained personal decision');`,
  `INSERT INTO wl_self_reconciliation VALUES(${quote(id(30))},'Retained handoff',${quote(id(0))},2);`,
 ].join('\n')
 const h=await harness({scheduled:true,bindings:{OWNER_EMAIL:mail(0)},upgrade:{before:'0099_training_self_changes.sql',sql:fixture,snapshot:'SELECT id FROM wl_training_requests ORDER BY id'}})
 try {
  assert.equal(h.upgradeSnapshot.length,3)
  const owner=await h.signIn(mail(0))
  await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
  for(const prior of rows) {
   const current=await h.api(`self-changes/${prior.id}`,owner)
   assert.equal(current.status,prior.status);assert.equal(current.kind,'training')
   assert.deepEqual(current.after.payload,prior.payload)
   assert.equal(current.after.target,prior.target)
   if(prior.status!=='pending')assert.equal(current.decision.comment,'Retained exact decision')
   assert.equal(current.reconciliation,null)
  }
  await h.api('self.decide',owner,{change:id(31),decision:'reject',comment:'Retain prior record-table request'});
  const personal=await h.api(`self-changes/${id(30)}`,owner)
  assert.equal(personal.decision.comment,'Retained personal decision')
  assert.equal(personal.reconciliation.reference,'Retained handoff')
  const workKey='self-change:'+rows[0].id
  const pendingWork=(await h.api('work',owner)).items.find(row=>row.source===workKey)
  assert.ok(pendingWork)
  assert.equal(pendingWork.owner,id(0))
  assert.equal(pendingWork.dueDate,'2099-01-01')
  assert.equal(pendingWork.nextAction,'Retained training follow-up')
  assert.equal(pendingWork.revision,id(40))
  assert.ok(pendingWork.history.some(row=>row.kind==='schedule.changed'))
  assert.deepEqual(pendingWork.deliveries.map(row=>[row.id,row.recipient,row.status]),[[id(41),id(0),'accepted']])
  await h.api('work.policy',owner,{offsets:'0',quietStart:20,quietEnd:8,defaultDays:1})
  await h.api('connections.notices',owner,{enabled:true})
  const tick=await h.raw(`/cdn-cgi/local/scheduled?time=${Date.parse('2099-01-01T09:00:00Z')}&cron=${encodeURIComponent('*/15 * * * *')}&format=json`)
  assert.equal(tick.status,200);await tick.arrayBuffer()
  assert.equal((await h.api('work',owner)).items.find(row=>row.source===workKey).deliveries.length,1,'The old reminder claim prevents a new send after migration')
  await h.api('self.decide',owner,{change:rows[0].id,decision:'approve',comment:'Approve migrated exact assignment'})
  assert.ok(!(await h.api('work',owner)).items.some(row=>row.source===workKey))

  assert.deepEqual((await h.api('training',owner)).assignments.map(row=>row.id).sort(),[rows[0].target,rows[1].target].sort())
  await h.api('training.decide',owner,{request:rows[0].id,decision:'approve',reason:'Compatibility cannot replay'},409)
  await h.api('self.decide',owner,{change:rows[2].id,decision:'approve',comment:'Rejected history stays closed'},409)
  assert.ok(!(await h.api('self-exceptions',owner)).some(row=>rows.some(prior=>prior.id===row.id)))
  console.log('ROLE-009 migration: PASS — pending training remains actionable once, prior decisions and personal handoffs survive, work owners and schedules and reminder claims survive, no invented downstream work')
 } finally {await h.close()}
}

