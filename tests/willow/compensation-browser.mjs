// Optional COMP-001 browser use through the same real Worker and form actions.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { today,day } from './regression-fixture.mjs'
export async function browserEvidence(h,owner,staff,ids) {
 if(process.env.WILLOW_COMPENSATION_BROWSER!=='1')return
 const destination=process.env.WILLOW_EVIDENCE_DIR;assert.ok(destination)
 await mkdir(destination,{recursive:true})
 assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH)
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try {
  for(const who of ['owner','managera','hr']) {
   const cookie=who==='owner'?owner:staff[who].cookie,context=await browser.newContext({ignoreHTTPSErrors:true})
   try {
    await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
    const page=await context.newPage()
    for(const width of [1440,390]) {
     await page.setViewportSize({width,height:1000})
     const paths=who==='hr'?[['/app/compensation','approver-list'],[`/app/compensation/${ids.cycle}`,'approver-published-cycle']]:who==='owner'?[
      ['/app/compensation','bands-and-cycles'],[`/app/compensation/${ids.cycle}`,'published-merit'],[`/app/compensation/${ids.promotion}`,'promotion'],[`/app/compensation/${ids.conflict}`,'source-conflict'],[`/app/compensation/${ids.bonus}`,'bonus'],[`/app/compensation/equity?asOf=${today}&level=${ids.equityLevel}`,'equity-suppression'],['/app/changes','band-conditions']
     ]:[['/app/compensation','manager-list'],[`/app/compensation/${ids.cycle}`,'manager-restricted-cycle']]
     for(const [path,name] of paths) {
      assert.equal((await page.goto(h.origin+path)).status(),200)
      for(const summary of await page.locator('details > summary').all())if(await summary.locator('..').getAttribute('open')===null)await summary.click()
      await page.evaluate(()=>document.fonts.ready)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`COMP-001 ${name} fits ${width}`)
      await page.screenshot({path:`${destination}/COMP-001-${who}-${name}-${width}.png`,fullPage:true})
     }
     if(who==='owner'||who==='hr') {
      await page.goto(h.origin+'/app/compensation')
      const create=page.locator('form[action="/app/do/compensation.cycle"]')
      await create.locator('..').locator('summary').click()
      await create.getByLabel('Cycle name',{exact:true}).fill(`Browser merit ${who} ${width}`)
      await create.getByLabel('Kind',{exact:true}).selectOption('merit')
      await create.getByLabel('Effective date',{exact:true}).fill(day((who==='hr'?122:120)+(width===390?1:0)))
      await create.getByLabel('Budget in USD',{exact:true}).fill('3000')
      await create.getByRole('button',{name:'Prepare cycle',exact:true}).click()
      await page.waitForURL(url=>url.pathname.startsWith('/app/compensation/')&&url.searchParams.has('notice'))
      const cycle=new URL(page.url()).pathname.split('/').pop()
      await page.screenshot({path:`${destination}/COMP-001-${who}-draft-${width}.png`,fullPage:true})
      await page.getByRole('button',{name:'Approve budget',exact:true}).click()
      await page.waitForURL(url=>url.searchParams.has('notice'))
      const managerContext=await browser.newContext({ignoreHTTPSErrors:true})
      try {
       await managerContext.addCookies(staff.managera.cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
       const managerPage=await managerContext.newPage();await managerPage.setViewportSize({width,height:1000})
       await managerPage.goto(h.origin+`/app/compensation/${cycle}`)
       const propose=managerPage.locator('form[action="/app/do/compensation.propose"]')
       await propose.getByLabel('Person',{exact:true}).selectOption(ids.person)
       await propose.getByLabel('Increase percent',{exact:true}).fill('1')
       await propose.getByLabel('Reason',{exact:true}).fill('Browser reviewed merit')
       await propose.getByRole('button',{name:'Submit proposal',exact:true}).click()
       await managerPage.waitForURL(url=>url.searchParams.has('notice'))
       await managerPage.screenshot({path:`${destination}/COMP-001-manager-form-submitted-${width}.png`,fullPage:true})
      }finally{await managerContext.close()}
      await page.goto(h.origin+`/app/compensation/${cycle}`)
      const review=await h.api(`compensation/${cycle}`,owner)
      assert.equal(review.rows.length,1);assert.equal(review.cycle.status,'approved')
      await page.screenshot({path:`${destination}/COMP-001-${who}-reviewed-${width}.png`,fullPage:true})
      const publish=page.locator('form[action="/app/do/compensation.publish"]')
      await publish.getByLabel('Reason for any out-of-band or unbanded exceptions',{exact:true}).fill('Authorized approver reviewed pending band')
      await publish.getByRole('button',{name:'Approve and publish exact changes',exact:true}).click()
      await page.waitForURL(url=>url.searchParams.has('notice'))
      assert.equal((await h.api(`compensation/${cycle}`,owner)).cycle.status,'published')
      await page.screenshot({path:`${destination}/COMP-001-${who}-form-published-${width}.png`,fullPage:true})
     }
    }
   }finally{await context.close()}
  }
 }finally{await browser.close()}
}
