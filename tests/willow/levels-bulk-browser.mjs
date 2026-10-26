// ROLE-002 uses the actual owner filter and revert forms at both viewport sizes.
import assert from 'node:assert/strict'
import { evidenceDirectory } from './evidence.mjs'

export async function bulkBrowserProof(page,h,owner,{members,level,location,priorAssignments}) {
 const ids=members.map(m=>m.id)
 const assigned=data=>Object.fromEntries(ids.map(id=>[id,data.assignments.filter(a=>a.member_id===id).map(a=>a.level_id).sort()]))
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000})
  const capture=async(target,name)=>{
   await page.evaluate(()=>document.fonts.ready)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`ROLE-002 ${name} fits ${width}`)
   await target.screenshot({path:`${evidenceDirectory}/ROLE-002-${name}-${width}.png`})
  }
  const submit=async(target,name)=>{
   await target.getByRole('button',{name,exact:true}).click()
   await page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
   assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())
  }
  const reviewCard=()=>page.locator('section.card').filter({has:page.getByRole('heading',{name:'Review access change',exact:true})}).last()
  await page.goto(h.origin+'/app/access')
  assert.deepEqual(assigned(await h.api('levels',owner)),priorAssignments)
  await capture(page,'before')
  const section=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Assign levels by filter$/})})
  await section.locator('summary').click()
  await section.locator('[name="location"]').fill(location)
  await section.locator('[name="status"]').selectOption('active')
  await section.locator(`input[name="levels"][value="${level}"]`).check()
  await capture(section,'selection')
  await submit(section,'Review filtered assignment')
  let review=reviewCard()
  for(const member of members) await review.getByText(member.name,{exact:true}).first().waitFor()
  const batch=await page.locator('form[action="/app/do/level.apply"] input[name="review"]').inputValue()
  const immutable=await h.api(`level-reviews/${batch}`,owner)
  assert.deepEqual([...immutable.plan.members].sort(),[...ids].sort(),'The form reviews exactly the ten matching active linked members')
  await capture(review,'preview')
  await submit(page.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
  assert.equal(new URL(page.url()).pathname,'/app/access','Applying returns to the access page')
  assert.equal(new URL(page.url()).searchParams.has('levelReview'),false)
  const result=(await h.api('levels',owner)).levels.find(l=>l.id===level)
  assert.deepEqual(result.members.sort(),[...ids].sort())
  const end=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Workforce reporting batch ·/})})
  await end.locator('summary').click()
  await capture(end,'applied')
  const revertForm=page.locator('form[action="/app/do/level.preview"]').filter({has:page.locator(`input[name="batch"][value="${batch}"]`)})
  await submit(revertForm,'Review revert')
  review=reviewCard()
  await review.getByText('Revert batch assignment',{exact:true}).waitFor()
  for(const member of members) await review.getByText(member.name,{exact:true}).first().waitFor()
  await capture(review,'revert-preview')
  await submit(page.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
  assert.equal(new URL(page.url()).pathname,'/app/access')
  assert.equal(new URL(page.url()).searchParams.has('levelReview'),false)
  assert.deepEqual(assigned(await h.api('levels',owner)),priorAssignments,'The owner form restores every prior assigned level')
  assert.deepEqual((await h.api('me',members[0].cookie)).permissions,['it.tasks'],'Direct grants survive the owner revert form')
  await capture(page,'reverted')
  const row=page.locator('tr').filter({has:page.getByText(batch,{exact:true})})
  await row.getByText('Reverted',{exact:true}).waitFor()
  await capture(row,'reverted-batch')
 }
}

// ROLE-003: owner delegates; HR creates/assigns a level; pay changes wait for a second administrator.
export async function delegatedBrowserProof(browser,h,owner,staff,ids) {
 const contexts=[]
 const pageFor=async cookie=>{
  const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context)
  await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  return context.newPage()
 }
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const apply=async plan=>api('level.apply',{review:(await api('level.preview',plan)).id})
 try {
  const admin=await pageFor(owner),hr=await pageFor(staff.hr.cookie),reader=await pageFor(staff.managerb.cookie)
  const capture=async(page,name,width)=>{
   await page.evaluate(()=>document.fonts.ready)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`ROLE-003 ${name} fits ${width}`)
   await page.screenshot({path:`${evidenceDirectory}/ROLE-003-${name}-${width}.png`,fullPage:true})
  }
  const submit=async(page,form,name)=>{
   await form.getByRole('button',{name,exact:true}).click()
   await page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
   assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())
  }
  const assignment=page=>page.locator('form[action="/app/do/level.preview"]').filter({has:page.locator('input[name="kind"][value="assignment"]')})
  const create=page=>page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Create a level$/})}).first()
  for(const width of [1440,390]) {
   for(const page of [admin,hr,reader]) await page.setViewportSize({width,height:1000})
   await admin.goto(h.origin+'/app/access')
   const form=create(admin),name=`Delegated administration ${width}`
   await form.locator('summary').click()
   await form.getByLabel('Level name',{exact:true}).fill(name)
   await form.getByLabel('Administer named access levels (also requires employer-wide manage people; owner alone delegates this right)',{exact:true}).check()
   await capture(admin,'owner-grant-form',width)
   await submit(admin,form,'Review level')
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   const delegation=(await api('levels')).levels.find(l=>l.name===name)
   const assign=assignment(admin),data=await api('levels')
   await assign.getByLabel('Assign levels to',{exact:true}).selectOption(staff.hr.member)
   for(const id of [...ids.originalHR,delegation.id]) await assign.getByLabel(data.levels.find(l=>l.id===id).name,{exact:true}).check()
   await submit(admin,assign,'Review assignment')
   await capture(admin,'owner-grant-review',width)
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await hr.goto(h.origin+'/app/access')
   const contactName=`HR contact view ${width}`,contact=create(hr)
   await contact.locator('summary').click()
   await contact.getByLabel('Level name',{exact:true}).fill(contactName)
   await contact.getByLabel('Read private contact details',{exact:true}).check()
   await capture(hr,'hr-create-form',width)
   await submit(hr,contact,'Review level')
   await capture(hr,'hr-create-review',width)
   await submit(hr,hr.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   const target=assignment(hr)
   await target.getByLabel('Assign levels to',{exact:true}).selectOption(staff.managerb.member)
   await target.getByLabel(contactName,{exact:true}).check()
   await submit(hr,target,'Review assignment')
   await capture(hr,'hr-assignment-review',width)
   await submit(hr,hr.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await reader.goto(h.origin+`/app/people/${staff.employee.person}`)
   await reader.getByRole('heading',{name:'Private details',exact:true}).waitFor()
   await capture(reader,'assigned-contact-view',width)
   // This first-phase grant gives HR only their existing pay ceiling when the owner explicitly adds it.
   await apply({kind:'assignment',member:staff.hr.member,levels:[...ids.originalHR,delegation.id,ids.payCeiling]})
   await hr.goto(h.origin+'/app/access')
   const payName=`HR pay review ${width}`,pay=create(hr)
   await pay.locator('summary').click()
   await pay.getByLabel('Level name',{exact:true}).fill(payName)
   await pay.getByLabel('Read compensation',{exact:true}).check()
   await submit(hr,pay,'Review level')
   const review=new URL(hr.url()).searchParams.get('levelReview')
   await hr.getByText('Waiting for the owner or a different eligible access administrator to apply this review.',{exact:true}).waitFor()
   assert.equal(await hr.locator('form[action="/app/do/level.apply"]').count(),0)
   await capture(hr,'pay-waits-for-second-admin',width)
   await admin.goto(h.origin+'/app/access')
   await admin.locator(`a[href="/app/access?levelReview=${review}"]`).click()
   await capture(admin,'second-admin-pay-review',width)
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await capture(admin,'second-admin-applied',width)
   await apply({kind:'assignment',member:staff.hr.member,levels:ids.originalHR})
   await hr.goto(h.origin+'/app/access')
   assert.equal(await hr.getByRole('heading',{name:'Named access levels',exact:true}).count(),0)
   await capture(hr,'delegation-revoked',width)
   await h.api('levels',staff.hr.cookie,undefined,403)
   await apply({kind:'assignment',member:staff.managerb.member,levels:ids.originalTarget})
  }
 } finally {for(const context of contexts) await context.close()}
}

export async function scopedDelegationBrowserProof(h,owner,staff,{location,originalHR,delegation}) {
 const {pathToFileURL}=await import('node:url')
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,executablePath:process.env.WILLOW_CHROMIUM_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const assignHR=async levels=>api('level.apply',{review:(await api('level.preview',{kind:'assignment',member:staff.hr.member,levels})).id})
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(staff.hr.cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  const page=await context.newPage()
  const submit=async(form,label)=>{
   await form.getByRole('button',{name:label,exact:true}).click()
   await page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
   assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())
  }
  const capture=async(name,width)=>{
   await page.evaluate(()=>document.fonts.ready)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   const bell=page.locator('.bell'),tip=page.getByRole('tooltip',{name:'Your tasks'})
   await page.mouse.move(0,0);await bell.hover();await page.waitForTimeout(150);assert.equal(await tip.isVisible(),false);await tip.waitFor({state:'visible'})
   await page.mouse.move(0,0);await bell.focus();assert.equal(await tip.isVisible(),true)
   await page.screenshot({path:evidenceDirectory+'/ROLE-003-scoped-'+name+'-'+width+'.png',fullPage:true})
  }
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000})
   await page.goto(h.origin+'/app/access')
   const create=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Create a level$/})}).first()
   await create.locator('summary').click()
   await create.getByLabel('Level name',{exact:true}).fill('synthetic-willow-15220-'+width)
   await create.getByLabel('Scope',{exact:true}).selectOption('group')
   await create.locator('[name="scopeLocation"][value="'+location+'"]').check()
   await capture('create',width)
   await submit(create,'Review level')
   await capture('review',width)
   await submit(page.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   const level=(await h.api('levels',staff.hr.cookie)).levels.find(item=>item.name==='synthetic-willow-15220-'+width)
   const form=page.locator('form[action="/app/do/level.preview"]').filter({has:page.locator('input[name="kind"][value="assignment"]')})
   assert.equal(await form.locator('[name="member"] option[value="'+staff.managera.member+'"]').count(),0)
   await form.getByLabel('Assign levels to',{exact:true}).selectOption(staff.employee.member)
   await form.locator('[name="levels"][value="'+level.id+'"]').check()
   await submit(form,'Review assignment')
   await capture('assignment-review',width)
   await submit(page.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   assert.ok((await h.api('levels',staff.hr.cookie)).assignments.some(item=>item.member_id===staff.employee.member&&item.level_id===level.id))
   await capture('assigned',width)
   await assignHR(originalHR)
   await page.goto(h.origin+'/app/access')
   assert.equal(await page.locator('form[action="/app/do/level.preview"]').count(),0)
   await capture('revoked',width)
   await assignHR([...originalHR,delegation])
  }
 } finally {await browser.close()}
}
