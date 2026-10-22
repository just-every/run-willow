// The invitation and HR journeys use fresh browser contexts with only synthetic fixture sessions.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
async function launch() {
 assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH,'Mac evidence requires current Playwright')
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
 return chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
}
async function capture(page,name,width) {
 const destination=process.env.WILLOW_EVIDENCE_DIR
 assert.ok(destination);await mkdir(destination,{recursive:true})
 await page.setViewportSize({width,height:1000})
 const bytes=await page.screenshot({path:`${destination}/EEO-003-${name}-${width}.png`,fullPage:true})
 assert.equal(bytes.readUInt32BE(16),width,`${name} fits ${width}`)
}
export async function invitationBrowser(h,answerLink,declineLink) {
 if(process.env.WILLOW_EEO_INVITATIONS_BROWSER!=='1') return false
 const browser=await launch()
 try {
  for(const [name,link,decline] of [['preboarding',answerLink,false],['preboarding-decline',declineLink,true]]) {
   const context=await browser.newContext({ignoreHTTPSErrors:true}), page=await context.newPage()
   for(const width of [1440,390]) {assert.equal((await page.goto(link)).status(),200);await capture(page,name,width)}
   if(!decline) {
    await page.getByRole('group',{name:'Race (choose one or more)',exact:true}).getByLabel('Asian',{exact:true}).check()
    await page.getByRole('button',{name:'Save my answers'}).click()
    await page.getByRole('heading',{name:'Could not save your answers'}).waitFor()
    for(const width of [1440,390]) await capture(page,'invitation-correction',width)
    await page.getByRole('link',{name:'Return to your form'}).click()
   }
   await page.getByLabel('Are you Hispanic or Latino?').selectOption(decline?'declined':'no')
   await page.getByRole('group',{name:'Race (choose one or more)',exact:true}).getByLabel(decline?'I do not wish to self-identify':'Asian',{exact:true}).check()
   await page.getByLabel('Sex',{exact:true}).selectOption(decline?'declined':'female')
   await page.getByLabel('Protected veteran status').selectOption(decline?'declined':'not_protected')
   await page.getByLabel('Disability',{exact:true}).selectOption(decline?'declined':'no')
   const [posted]=await Promise.all([page.waitForResponse(response=>response.request().method()==='POST'),page.getByRole('button',{name:'Save my answers'}).click()])
   if(posted.status()!==303) { const body=await posted.text(); assert.fail(`invitation form submission: ${posted.status()} ${body.startsWith('{') ? body : body.match(/<p>([^<]*)<\/p>/)?.[1] ?? 'HTML failure'}`) }
   assert.ok(new URL(page.url()).searchParams.has('notice'))
   for(const width of [1440,390]) await capture(page,name+'-saved',width)
   await context.close()
  }
 } finally {await browser.close()}
 return true
}
export async function invitationScreens(h,data) {
 if(process.env.WILLOW_EEO_INVITATIONS_BROWSER!=='1') return
 const browser=await launch()
 try {
  for(const [name,cookie,path,status=200] of [
   ['packets',data.hr,'/app/preboarding'],['packet-record',data.hr,`/app/eeo/preboarding/${data.packet}`],
   ['employee-start',data.hr,'/app/people'],['applicant-post-offer',null,new URL(data.applicant).pathname],
   ['closed-applications',data.hr,'/app/eeo/applicants'],['application-record',data.hr,`/app/eeo/applicants/${data.application}`],
   ['hiring-closed',data.hr,`/app/hiring/applications/${data.application}`],
   ['invitation-ended',null,new URL(data.withdrawn).pathname,404]
  ]) {
   const context=await browser.newContext({ignoreHTTPSErrors:true})
   if(cookie) await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
   const page=await context.newPage()
   for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});assert.equal((await page.goto(h.origin+path)).status(),status);await capture(page,name,width)}
   await context.close()
  }
 } finally {await browser.close()}
}

export async function confirmPreboardBrowser(h,cookie,packet) {
 if(process.env.WILLOW_EEO_INVITATIONS_BROWSER!=='1') return null
 const browser=await launch()
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  const page=await context.newPage()
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000})
   assert.equal((await page.goto(`${h.origin}/app/retention/erasure?preboarding=${packet}`)).status(),200)
   await capture(page,'preboarding-erasure-preview',width)
  }
  await Promise.all([page.waitForURL(url=>url.pathname==='/app/retention'),page.getByRole('button',{name:'Confirm this preview and erase'}).click()])
  for(const width of [1440,390]) await capture(page,'retention-after-preboarding-erasure',width)
  await page.getByRole('link',{name:'Receipt',exact:true}).first().click()
  await page.getByRole('heading',{name:/Erasure receipt/}).waitFor()
  for(const width of [1440,390]) await capture(page,'preboarding-erasure-receipt',width)
  return new URL(page.url()).pathname.split('/').at(-1)
 } finally {await browser.close()}
}

export async function invitationLinkScreens(h,link,name) {
 if(process.env.WILLOW_EEO_INVITATIONS_BROWSER!=='1') return
 const browser=await launch()
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});assert.equal((await page.goto(link)).status(),200);await capture(page,name,width)}
 } finally {await browser.close()}
}

export async function startPreboardEmploymentBrowser(h,cookie,packet,template,schedule,startDate) {
 if(process.env.WILLOW_EEO_INVITATIONS_BROWSER!=='1') return null
 const browser=await launch()
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  const page=await context.newPage()
  for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});assert.equal((await page.goto(`${h.origin}/app/people?preboarding=${packet}`)).status(),200);await capture(page,'employee-start-before',width)}
  const form=page.locator('form[action="/app/do/joiner.start"]')
  await form.getByLabel('Joiner template',{exact:true}).selectOption(template)
  await form.getByLabel('Work email',{exact:true}).fill('nora@example.com')
  await form.getByLabel('Start date',{exact:true}).fill(startDate)
  await form.getByLabel('Employment type',{exact:true}).selectOption('full_time')
  await form.getByLabel('Job title',{exact:true}).fill('Present role')
  await form.getByLabel('Working schedule',{exact:true}).selectOption(schedule)
  await form.getByLabel('Payroll identifier',{exact:true}).fill('synthetic-willow-123')
  await Promise.all([page.waitForURL(url=>/^\/app\/cases\/[\w-]+$/.test(url.pathname)),form.getByRole('button',{name:'Start joiner',exact:true}).click()])
  const id=new URL(page.url()).pathname.split('/').at(-1)
  const detail=await h.api(`cases/${id}`,cookie)
  return {person:detail.person.id,period:detail.period,case:id}
 } finally {await browser.close()}
}
