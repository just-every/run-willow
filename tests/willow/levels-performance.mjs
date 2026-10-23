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
 await api('level.preview',{...plan,name:'synthetic-willow-10022',performanceFields:{others:{goals:'edit'}}},400)
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
  const tooltip=async page=>{
   const bell=page.getByRole('link',{name:'Open your task list',exact:true})
   await page.evaluate(()=>{const link=document.querySelector('.bell');window.__tip=null;link.addEventListener('mouseenter',()=>{const start=performance.now();const sample=()=>{if(Number(getComputedStyle(link.querySelector('[role="tooltip"]')).opacity)>.5)window.__tip=performance.now()-start;else requestAnimationFrame(sample)};requestAnimationFrame(sample)},{once:true})})
   await bell.hover();await page.waitForFunction(()=>window.__tip!==null)
   assert.ok(await page.evaluate(()=>window.__tip>=250&&window.__tip<1500),'Tooltip appears after approximately 300ms hover')
   await page.mouse.move(0,0)
   await page.getByRole('searchbox',{name:'Find a person',exact:true}).focus();await page.keyboard.press('Tab')
   assert.equal(await bell.evaluate(el=>el.matches(':focus-visible')),true)
   assert.equal(await bell.locator('[role="tooltip"]').evaluate(el=>getComputedStyle(el).opacity),'1','Keyboard focus shows the tooltip immediately')
  }
  for(const width of [1440,390]) {
   for(const p of [admin,reader])await p.setViewportSize({width,height:1000})
   await apply({...plan,level,performanceFields:{self:{},others:{}}})
   await admin.goto(h.origin+'/app/access')
   const edit=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:new RegExp('^'+plan.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' ·')})}).first()
   await edit.locator('summary').click()
   for(const label of ['Released reviews','Goals and check-ins'])await edit.getByLabel('Performance about others: '+label,{exact:true}).selectOption('view')
   await tooltip(admin);await capture(admin,'level-form',width)
   await edit.getByRole('button',{name:'Review level',exact:true}).click();await admin.waitForURL(url=>url.searchParams.has('levelReview'))
   await capture(admin,'review',width)
   await admin.locator('form[action="/app/do/level.apply"]').getByRole('button',{name:'Apply reviewed change',exact:true}).click()
   await admin.waitForURL(url=>url.searchParams.has('notice'));assert.ok(!new URL(admin.url()).searchParams.has('error'))
   await reader.goto(h.origin+`/app/performance/${cycle}`)
   assert.ok((await reader.locator('body').textContent()).includes('synthetic-willow-10012'))
   assert.equal(await reader.getByRole('button',{name:'Acknowledge result',exact:true}).count(),0)
   assert.ok(!(await reader.locator('body').textContent()).includes('synthetic-willow-10010'))
   await tooltip(reader);await capture(reader,'released-only',width)
   const [download]=await Promise.all([reader.waitForEvent('download'),reader.getByRole('link',{name:'Download permitted cycle history (JSON)',exact:true}).click()]);assert.equal(await download.failure(),null)
   await reader.goto(h.origin+'/app/goals');assert.ok((await reader.locator('body').textContent()).includes('synthetic-willow-10016'))
   assert.equal(await reader.getByRole('button',{name:'Record check-in',exact:true}).count(),0)
   await tooltip(reader);await capture(reader,'goals-view',width)
   await apply({...plan,level,performanceFields:{self:{},others:{}}})
   assert.equal((await reader.goto(h.origin+`/app/performance/${cycle}`)).status(),404)
   await capture(reader,'revoked',width)
  }
 } finally {for(const c of contexts)await c.close();await browser.close()}
}
