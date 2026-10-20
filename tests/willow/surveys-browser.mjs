import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { today } from './regression-fixture.mjs'
export async function browserEvidence(h,owner,staff,participants,ids) {
 if(process.env.WILLOW_SURVEYS_BROWSER!=='1')return
 const destination=process.env.WILLOW_EVIDENCE_DIR;assert.ok(destination);await mkdir(destination,{recursive:true})
 assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH)
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try {
  for(const who of ['owner','hr','managera','participant','payroll']) {
   const cookie=who==='owner'?owner:who==='participant'?participants[0].cookie:staff[who].cookie
   const context=await browser.newContext({ignoreHTTPSErrors:true})
   try {
    await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
    const page=await context.newPage()
    for(const width of [1440,390]) {
     await page.setViewportSize({width,height:1000})
     const paths=who==='payroll'?[[`/app/survey-plans/${ids.outsidePlan}`,'own-plan']]:[['/app/surveys','list'],[`/app/surveys/${ids.survey}`,'survey-and-plan'],['/app/tasks','private-work']]
     if(!['participant','payroll'].includes(who))paths.push([`/app/surveys/${ids.survey}/results`,'results'],[`/app/surveys/${ids.small}/results`,'small-cell'])
     for(const [path,name] of paths) {
      assert.equal((await page.goto(h.origin+path)).status(),200)
      for(const summary of await page.locator('details > summary').all())if(await summary.locator('..').getAttribute('open')===null)await summary.click()
      await page.evaluate(()=>document.fonts.ready)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`ENGAGE-001 ${who} ${name} fits ${width}`)
      await page.screenshot({path:`${destination}/ENGAGE-001-${who}-${name}-${width}.png`,fullPage:true})
     }
     if(who==='payroll') {
      const form=page.locator('form[action="/app/do/survey.plan.complete"]')
      if(await form.count()) {
       await form.getByLabel('Completion evidence',{exact:true}).fill('Career guide published at the approved team location')
       await form.getByRole('button',{name:'Complete action plan',exact:true}).click()
       await page.waitForURL(url=>url.searchParams.has('notice'))
      }
      assert.ok((await h.api(`survey-plans/${ids.outsidePlan}`,cookie)).evidence)
      await page.screenshot({path:`${destination}/ENGAGE-001-payroll-own-plan-completed-${width}.png`,fullPage:true})
     }
     if(who==='owner') {
      await page.goto(h.origin+'/app/surveys')
      const form=page.locator('form[action="/app/do/survey.create"]');await form.locator('..').locator('summary').click()
      await form.getByLabel('Survey name',{exact:true}).fill(`Browser onboarding ${width}`)
      await form.getByLabel('Kind',{exact:true}).selectOption('onboarding')
      await form.getByLabel('Collection',{exact:true}).selectOption('named')
      await form.locator(`input[name="members"][value="${staff.employee.member}"]`).check()
      await form.getByLabel('Delivery date',{exact:true}).fill(today);await form.getByLabel('Due date',{exact:true}).fill(today)
      await form.getByRole('button',{name:'Publish survey',exact:true}).click()
      await page.waitForURL(url=>/^\/app\/surveys\/[\w-]+$/.test(url.pathname)&&url.searchParams.has('notice'))
      const id=new URL(page.url()).pathname.split('/').pop()
      const employeeContext=await browser.newContext({ignoreHTTPSErrors:true})
      try {
       await employeeContext.addCookies(staff.employee.cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
       const response=await employeeContext.newPage();await response.setViewportSize({width,height:1000});await response.goto(h.origin+`/app/surveys/${id}`)
       const respond=response.locator('form[action="/app/do/survey.respond"]').filter({has:response.locator('select')})
       await respond.getByLabel('How likely are you to recommend working here?',{exact:true}).selectOption('9')
       await respond.getByLabel('What would help?',{exact:true}).fill('A useful welcome guide and a team introduction.')
       await response.screenshot({path:`${destination}/ENGAGE-001-employee-disclosure-response-${width}.png`,fullPage:true})
       await respond.getByRole('button',{name:'Submit response',exact:true}).click()
       await response.waitForURL(url=>url.searchParams.has('notice'))
       assert.equal((await h.api(`surveys/${id}`,staff.employee.cookie)).survey.own.answered,true)
       await response.screenshot({path:`${destination}/ENGAGE-001-employee-recorded-${width}.png`,fullPage:true})
      }finally{await employeeContext.close()}
      await page.goto(h.origin+`/app/surveys/${id}/results`)
      assert.ok((await h.api(`surveys/${id}/results`,owner)).namedAnswers.length===1)
      await page.screenshot({path:`${destination}/ENGAGE-001-owner-form-result-${width}.png`,fullPage:true})
     }
    }
   }finally{await context.close()}
  }
 }finally{await browser.close()}
}
