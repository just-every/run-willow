import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { evidenceDirectory } from './evidence.mjs'
export async function browserEvidence(h,owner,staff) {
 if(process.env.WILLOW_LEVELS_BROWSER!=='1') return
 assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH)
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  try {
   await context.addCookies(owner.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
   const page=await context.newPage()
   const visit=async()=>assert.equal((await page.goto(h.origin+'/app/access')).status(),200)
   const form=name=>page.locator(`form[action="/app/do/${name}"]`)
   const submit=async(target,name)=>{
    await target.getByRole('button',{name,exact:true}).click()
    await page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
    assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())
   }
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000})
    const capture=async name=>{
     await page.evaluate(()=>document.fonts.ready)
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
    await page.getByLabel('Member').selectOption(staff.managera.member)
    await page.getByLabel('About this person').selectOption(staff.employee.person)
    await page.getByRole('button',{name:'Preview'}).click()
    const visibility=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Preview what a member sees',exact:true})})
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
  } finally {await context.close()}
 } finally {await browser.close()}
}
