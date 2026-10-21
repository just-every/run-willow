import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { evidenceDirectory } from './evidence.mjs'
// ROLE-001: real owner review/apply and same-session subject status/revocation.
export async function followBrowserProof(h,owner,s,level,request) {
 if(process.env.WILLOW_CHANGE_REQUESTS_BROWSER!=='1') return
 assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH)
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try {
  const context=async cookie=>{
   const c=await browser.newContext({ignoreHTTPSErrors:true})
   await c.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})))
   return c
  }
  const oc=await context(owner),ec=await context(s.employee.cookie),op=await oc.newPage(),ep=await ec.newPage()
  for(const width of [1440,390]) {
   for(const page of [op,ep]) await page.setViewportSize({width,height:1000})
   const capture=async(page,name)=>{
    await page.evaluate(()=>document.fonts.ready)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`)
    await page.screenshot({path:`${evidenceDirectory}/ROLE-001-follow-${name}-${width}.png`,fullPage:true})
   }
   const set=async enabled=>{
    assert.equal((await op.goto(h.origin+'/app/access')).status(),200)
    const form=op.locator('form[action="/app/do/level.preview"]').filter({has:op.locator(`input[name="level"][value="${level}"]`)})
    await form.locator('xpath=ancestor::details[1]/summary').click()
    await form.getByLabel('Follow change requests about themselves (status)',{exact:true}).selectOption(String(enabled))
    await capture(op,enabled?'enable-form':'disable-form')
    await form.getByRole('button',{name:'Review level',exact:true}).click()
    await op.waitForURL(url=>url.searchParams.has('levelReview'))
    assert.ok((await op.textContent('body')).includes(enabled?'Off → On':'On → Off'))
    await capture(op,enabled?'enable-review':'disable-review')
    await op.getByRole('button',{name:'Apply reviewed change',exact:true}).click()
    await op.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
    assert.ok(!new URL(op.url()).searchParams.has('error'))
   }
   assert.equal((await ep.goto(h.origin+'/app')).status(),200)
   if(width===390) await ep.locator('label.menu-button').click()
   await capture(ep,'home-navigation')
   await ep.locator('nav a[href="/app/changes"]').click()
   await ep.waitForURL(h.origin+'/app/changes')
   await ep.getByRole('link',{name:'Your change request',exact:true}).click()
   await ep.waitForURL(`${h.origin}/app/changes/${request}`)
   assert.equal(await ep.locator('form[action="/app/do/change.decide"]').count(),0)
   assert.equal(await ep.locator('form[action="/app/do/change.edit"]').count(),0)
   assert.ok((await ep.textContent('body')).includes('Step 1 of 3'))
   await capture(ep,'subject-status')
   assert.equal((await ep.goto(h.origin+'/app/changes')).status(),200)
   await capture(ep,'subject-list')
   await set(false)
   assert.equal((await ep.goto(`${h.origin}/app/changes/${request}`)).status(),404)
   await capture(ep,'revoked')
   await set(true)
   assert.equal((await ep.goto(`${h.origin}/app/changes/${request}`)).status(),200)
   await capture(ep,'restored-status')
  }
  await oc.close();await ec.close()
 } finally {await browser.close()}
}
