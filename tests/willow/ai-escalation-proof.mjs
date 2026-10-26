import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { evidenceDirectory } from './evidence.mjs'

const route = '/app/policy-assistant#hr-policy-follow-up'

export async function escalationProof({h,owner,staff}) {
 const read = cookie => h.api('policy-escalations', cookie)
 const request = cookie => h.api('policy.escalate', cookie, {returnTo:route})
 const resolve = (cookie, escalation, status=200) => h.api('policy.escalation.resolve', cookie, {escalation,returnTo:route}, status)
 const before = await read(staff.employee.cookie)
 await Promise.all(['question','details','person'].map(field => h.api('policy.escalate', staff.employee.cookie, {returnTo:route,[field]:'synthetic-willow-301'}, 400)))
 assert.deepEqual(await read(staff.employee.cookie),before,'Rejected content creates no HR contact request')

 const first = await request(staff.employee.cookie)
 assert.ok(first.id)
 assert.equal((await request(staff.employee.cookie)).id, first.id, 'Repeated requests reuse the open contact request')
 const other = await request(staff.managerb.cookie)
 const [employee,otherMember,manager,hr,ownerQueue] = await Promise.all([
  read(staff.employee.cookie), read(staff.managerb.cookie), read(staff.managera.cookie), read(staff.hr.cookie), read(owner),
 ])
 assert.equal(employee.filter(row=>row.status==='open').length,1)
 assert.ok(employee.every(row=>row.requestedBy===staff.employee.member && !row.canResolve))
 assert.ok(!employee.some(row=>row.id===other.id),'Employees cannot read another member’s contact request')
 assert.ok(!otherMember.some(row=>row.id===first.id))
 assert.ok(!manager.some(row=>row.id===first.id),'Managing a person grants no HR queue access')
 const work=await h.api('work',staff.hr.cookie)
 assert.ok(work.items.some(item=>item.source===`policy-followup:${first.id}`),'A contact request is real native HR work')
 const queued = hr.find(row=>row.id===first.id)
 assert.equal(queued.status,'open')
 assert.equal(queued.requester.id,staff.employee.person)
 assert.ok(queued.canResolve)
 assert.ok(ownerQueue.some(row=>row.id===first.id && row.canResolve))
 for(const field of ['question','details'])assert.ok(!Object.hasOwn(queued,field),'The HR queue contains no question or answer content')

 await Promise.all([
  resolve(staff.managera.cookie,first.id,403),
  resolve(staff.employee.cookie,first.id,403),
  ...['question','details'].map(field=>h.api('policy.escalation.resolve',staff.hr.cookie,{escalation:first.id,returnTo:route,[field]:'synthetic-willow-302'},400)),
 ])
 assert.equal((await read(staff.employee.cookie)).find(row=>row.id===first.id).status,'open','Unauthorized or content-bearing decisions leave the request open')
 await h.api('member.permissions',owner,{member:staff.hr.member,permissions:[]})
 const revoked=await h.raw('/api/willow/policy.escalation.resolve',{cookie:staff.hr.cookie,body:{escalation:first.id}})
 assert.ok([401,403].includes(revoked.status),'Revoked HR authority cannot complete another member’s request')
 await h.api('member.permissions',owner,{member:staff.hr.member,permissions:['people.manage','people.private','documents.private','leave.manage']})
 staff.hr.cookie=await h.signIn('hr@example.com')
 await resolve(staff.hr.cookie, first.id)
 const outcome = await read(staff.employee.cookie)
 assert.equal(outcome.find(row=>row.id===first.id).status,'resolved')
 assert.ok(outcome.every(row=>row.requestedBy===staff.employee.member))
 assert.ok(!outcome.some(row=>row.id===other.id),'Resolved history preserves member isolation')
 await resolve(staff.hr.cookie, other.id)
 await escalationScreens({h,staff,read})
 console.log('AI-001 content-free HR follow-up, current authority and native work: PASS')
}

async function escalationScreens({h,staff,read}) {
 if(process.env.WILLOW_AI_BROWSER!=='1')return
 const {chromium} = await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser = await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const contexts = []
 try {
  const pages = {}
  for(const key of ['employee','hr']) {
   const context = await browser.newContext({ignoreHTTPSErrors:true})
   contexts.push(context)
   await context.addCookies(staff[key].cookie.split('; ').map(cookie=>{
    const separator = cookie.indexOf('=')
    return {name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:h.origin}
   }))
   pages[key] = await context.newPage()
  }
  for(const width of [1440,390]) {
   for(const page of Object.values(pages))await page.setViewportSize({width,height:1000})
   const employee = pages.employee, hr = pages.hr
   await employee.goto(h.origin+route)
   assert.equal(await employee.getByRole('button',{name:'Ask about policy',exact:true}).count(),0,'HR follow-up remains usable while AI answers are disabled')
   await Promise.all([
    employee.waitForNavigation({waitUntil:'domcontentloaded'}),
    employee.locator('#hr-policy-follow-up').getByRole('button',{name:'Ask HR to contact me',exact:true}).click(),
   ])
   const pending = (await read(staff.employee.cookie)).find(row=>row.status==='open')
   assert.ok(pending,'The employee form creates an HR contact request')
   await capture(employee,'followup-requested',width)

   await hr.goto(h.origin+'/app/tasks')
   await capture(hr,'followup-work',width,'h1')
   await hr.getByRole('link',{name:'Contact requester about policy',exact:true}).first().click()
   await hr.getByRole('heading',{name:'HR policy follow-up',exact:true}).waitFor()
   const form = hr.locator('form[action="/app/do/policy.escalation.resolve"]').filter({has:hr.locator(`input[name="escalation"][value="${pending.id}"]`)})
   assert.equal(await form.count(),1,'HR has a native form for the employee request')
   await capture(hr,'followup-hr',width)
   await Promise.all([
    hr.waitForNavigation({waitUntil:'domcontentloaded'}),
    form.getByRole('button',{name:'Mark HR follow-up complete',exact:true}).click(),
   ])
   await employee.reload()
   const history = await read(staff.employee.cookie)
   assert.equal(history.find(row=>row.id===pending.id).status,'resolved')
   assert.ok(!history.some(row=>row.status==='open'))
   assert.equal(await employee.locator('#hr-policy-follow-up tbody tr').count(),history.length,'The employee can read the outcome in their request history')
   await capture(employee,'followup-resolved',width)
  }
 } finally {
  try {await Promise.all(contexts.map(context=>context.close()))}
  finally {await browser.close()}
 }
}

async function capture(page,name,width,section='#hr-policy-follow-up') {
 await page.evaluate(()=>document.fonts.ready)
 const bell = page.getByRole('link',{name:'Open your task list',exact:true})
 await bell.focus()
 assert.ok(await page.getByRole('tooltip',{name:'Your tasks',exact:true}).isVisible(),'The task bell has an immediate focus tooltip')
 await page.locator('h1').click()
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The follow-up page has no horizontal overflow')
 await page.locator(section).scrollIntoViewIfNeeded()
 await page.screenshot({path:join(evidenceDirectory,`${name}-${width}.png`),fullPage:true})
}
