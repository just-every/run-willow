import { bulkBrowserProof, delegatedBrowserProof } from './levels-bulk-browser.mjs'
import { personalBrowserProof, otherPersonalBrowserProof, documentCategoryBrowserProof, documentWriteBrowserProof, selectedReportBrowserProof } from './levels-personal-browser.mjs'
import { scopeBrowserProof } from './levels-scope-browser.mjs'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { evidenceDirectory } from './evidence.mjs'
export async function browserEvidence(h,owner,staff,bulk,scoped,delegated,documentRights,selectedReport,{access=true}={}) {
 if(process.env.WILLOW_LEVELS_BROWSER!=='1') return
 assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH)
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  const page=await context.newPage()
  try {
   await context.addCookies(owner.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
   const visit=async()=>assert.equal((await page.goto(h.origin+'/app/access')).status(),200)
   const form=name=>page.locator(`form[action="/app/do/${name}"]`)
   const submit=async(target,name)=>{
    await Promise.all([page.waitForNavigation({waitUntil:'load'}),target.getByRole('button',{name,exact:true}).click()])
    assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())
   }
   if(access) for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000})
    const capture=async name=>{
     await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`ROLE-001 ${name} fits ${width}`)
     await page.screenshot({path:`${evidenceDirectory}/ROLE-001-${name}-${width}.png`,fullPage:true})
    }
    await visit()
    const create=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Create a level$/})}).first()
    await create.locator('summary').click()
    const name=`Location reporting ${width}`
    await create.getByLabel('Level name',{exact:true}).fill(name)
    await create.getByLabel('Read organization-wide summaries',{exact:true}).check()
    await capture('create-form')
    await submit(create,'Review level')
    await capture('create-preview')
    await submit(form('level.apply'),'Apply reviewed change')
    const level=(await h.api('levels',owner)).levels.find(l=>l.name===name)
    assert.ok(level)
    const assignment=form('level.preview').filter({has:page.locator('input[name="kind"][value="assignment"]')})
    await assignment.getByLabel('Assign levels to',{exact:true}).selectOption(staff.managera.member)
    await assignment.getByLabel(name,{exact:true}).check()
    await capture('assignment-form')
    await submit(assignment,'Review assignment')
    await capture('assignment-preview')
    await submit(form('level.apply'),'Apply reviewed change')
    assert.ok((await h.api('me',staff.managera.cookie)).permissions.includes('reports.read'))
    // ROLE-001's union must also be usable through WIL-02's existing form.
    const visibility=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Preview what a member sees',exact:true})})
    await visibility.getByLabel('Member',{exact:true}).selectOption(staff.managera.member)
    await visibility.getByLabel('About this person',{exact:true}).selectOption(staff.employee.person)
    await visibility.getByRole('button',{name:'Preview',exact:true}).click()
    const compensation=visibility.locator('tbody tr').filter({has:page.getByText('Compensation',{exact:true})})
    await compensation.getByText('No',{exact:true}).waitFor()
    assert.equal((await h.api(`preview?member=${staff.managera.member}&person=${staff.employee.person}`,owner)).facets.find(f=>f.facet==='pay').visible,false)
    await capture('visibility-preview')
    await visit()
    const section=page.locator('details').filter({has:page.locator('summary').filter({hasText:new RegExp(`^${name} ·`)})}).first()
    await section.locator('summary').click()
    await section.getByLabel('Read organization-wide summaries',{exact:true}).uncheck()
    await submit(section,'Review level')
    await capture('revocation-preview')
    await submit(form('level.apply'),'Apply reviewed change')
    assert.ok(!(await h.api('me',staff.managera.cookie)).permissions.includes('reports.read'))
    await capture('revoked-end-state')
   }
   if(bulk) await bulkBrowserProof(page,h,owner,bulk)
   if(access) await personalBrowserProof(browser,h,owner,staff)
   if(scoped) await scopeBrowserProof(browser,h,owner,scoped)
   if(access) await otherPersonalBrowserProof(browser,h,owner,staff)
   if(delegated) await delegatedBrowserProof(browser,h,owner,staff,delegated)
   if(selectedReport) await selectedReportBrowserProof(browser,h,owner,staff,selectedReport)
   if(documentRights) {await documentCategoryBrowserProof(browser,h,owner,staff,documentRights);await documentWriteBrowserProof(browser,h,owner,staff,documentRights)}
  } catch(error) {
   await writeFile(`${evidenceDirectory}/access-failure.html`,await page.content())
   await writeFile(`${evidenceDirectory}/access-failure.json`,JSON.stringify({url:page.url(),error:String(error)}))
   throw error
  } finally {await context.close()}
 } finally {await browser.close()}
}


// The demo's public bootstrap must initialize real document records through the
// same live-session fence as ordinary category writes, without a seeding bypass.
export async function demoProof() {
 const {harness,file}=await import('./harness.mjs')
 const h=await harness({bindings:{RER_DEMO:'1'}})
 let browser
 try {
  const bootstrap=await h.raw('/auth/bootstrap',{body:{token:h.vars.SETUP_TOKEN,displayName:'Demo Owner'}})
  assert.equal(bootstrap.status,303,'The public demo bootstrap succeeds')
  const cookie=bootstrap.headers.getSetCookie().map(line=>line.split(';')[0]).join('; ')
  const directory=await h.raw('/app/people',{cookie})
  assert.equal(directory.status,200,'The first directory request initializes the demo under live owner authority')
  const directoryHtml=await directory.text()
  const people=await h.api('people',cookie)
  for(const person of people) assert.ok(directoryHtml.includes(`/app/people/${person.id}`),'The directory links each initialized record')
  assert.equal(people.length,12,'Every demo person was initialized')
  const owner=await h.api('me',cookie)
  const person=await h.api(`people/${owner.person}`,cookie)
  assert.equal(person.documents.length,1)
  const document=person.documents[0],version=document.versions[0]
  const download=await h.raw(`/app/files/document/${version.id}`,{cookie})
  assert.equal(download.status,200)
  assert.match(await download.text(),/Welcome to Harbor & Field/,'The seeded native file has its real stored bytes')
  assert.equal((await h.raw('/app/people')).status,303,'Demo data does not grant an anonymous record session')
  for(let i=0;i<2;i++) {
   assert.equal((await h.raw('/app/people',{cookie})).status,200)
   assert.equal((await h.api('people',cookie)).length,12)
   assert.equal((await h.api(`people/${owner.person}`,cookie)).documents[0].versions.length,1,'Repeated entry does not duplicate initialization')
  }
  if(process.env.WILLOW_LEVELS_BROWSER==='1') {
   const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
   browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
   const context=await browser.newContext({ignoreHTTPSErrors:true})
   try {
    await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
    const page=await context.newPage()
    for(const width of [1440,390]) {
     await page.setViewportSize({width,height:1000})
     for(const [name,path] of [['directory','/app/people'],['document',`/app/people/${owner.person}`]]) {
      assert.equal((await page.goto(h.origin+path)).status(),200)
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Demo ${name} fits ${width}`)
      await page.screenshot({path:`${evidenceDirectory}/demo-${name}-${width}.png`,fullPage:true})
     }
    }
   } finally {await context.close()}
  }
  // Ordinary category writes still require a live authenticated session after
  // initialization, and a revoked bootstrap session cannot append file bytes.
  const input={document:document.id,revision:person.documents[0].revision,file:file('synthetic-willow-1.txt','synthetic-willow-1')}
  await h.api('document.add',cookie,input)
  assert.equal((await h.api(`people/${owner.person}`,cookie)).documents[0].versions.length,2)
  const signout=await h.raw('/auth/signout',{body:{},cookie})
  assert.equal(signout.status,204)
  await h.api('document.add',cookie,input,401)
  console.log('Demo initialization: PASS — public bootstrap, populated directory, native file bytes, idempotent entry and live-session revocation')
 } finally {await browser?.close();await h.close()}
}
