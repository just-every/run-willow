// LEAVE-001: operate the existing settings and leave forms, then inspect each role's case.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
export async function browserEvidence(h,owner,staff,caseId,ca,tx) {
 if(process.env.WILLOW_LEAVE_BROWSER!=='1')return
 const destination=process.env.WILLOW_EVIDENCE_DIR;assert.ok(destination)
 await mkdir(destination,{recursive:true})
 assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH,'Mac browser needs current Playwright')
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  let browserOverride
 for(const [who,cookie] of [['hr',staff.hr.cookie],['owner',owner],['manager',staff.managera.cookie],['employee',staff.employee.cookie]]) {
   const context=await browser.newContext({ignoreHTTPSErrors:true})
   await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:h.origin})))
   try{
    const page=await context.newPage()
    const capture=async(path,name,width)=>{
     await page.setViewportSize({width,height:1000});assert.equal((await page.goto(h.origin+path)).status(),200)
     if(name==='leave')for(const summary of await page.locator('details > summary').filter({hasText:'Daily accrual calculations'}).all())await summary.click()
     await page.evaluate(()=>document.fonts.ready)
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`LEAVE-001 ${name} fits ${width}`)
     await page.screenshot({path:`${destination}/LEAVE-001-${who}-${name}-${width}.png`,fullPage:true})
    }
    if(who==='hr'){
     await page.goto(h.origin+'/app/protected-leave')
     const create=page.locator('form[action="/app/do/protected.open"]')
     const localDate=(await h.api('me',cookie)).today
     await create.getByLabel('Person',{exact:true}).selectOption(staff.employee.person)
     await create.getByLabel('Case title',{exact:true}).fill('Employer-reviewed parental leave')
     await create.getByLabel('First eligible date',{exact:true}).fill(localDate)
     await create.getByLabel('Last eligible date',{exact:true}).fill(localDate)
     await create.getByLabel('Entitlement (hours)',{exact:true}).fill('24')
     await create.getByLabel('Employer review and policy reference',{exact:true}).fill('Employer review reference HR-2026-14; no legal adjudication')
     await create.getByLabel('Medical certification (optional, up to 10 MB)',{exact:true}).setInputFiles({name:'certification.txt',mimeType:'text/plain',buffer:Buffer.from('Restricted certification for browser journey')})
     for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await create.screenshot({path:`${destination}/LEAVE-001-hr-protected-create-${width}.png`})}
     await create.getByRole('button',{name:'Record reviewed case',exact:true}).click();await page.waitForURL(/\/app\/protected-leave\/[\w-]+/)
     const newCase=new URL(page.url()).pathname.split('/').pop()
     const absence=page.locator('form[action="/app/do/protected.absence"]')
     await absence.getByLabel('Hours used',{exact:true}).fill('4')
     await absence.getByLabel('Case note (restricted)',{exact:true}).fill('Intermittent employer-recorded time')
     await absence.getByRole('button',{name:'Record absence',exact:true}).click();await page.waitForURL(/notice=/)
     assert.equal((await h.api(`protected-leave/${newCase}`,cookie)).remainingMinutes,1200)
     for(const width of [1440,390])await capture(`/app/protected-leave/${newCase}`,'protected-recorded',width)
     await page.goto(h.origin+`/app/people/${staff.employee.person}`)
     const override=page.locator('form[action="/app/do/leave.adjust"]').first()
     await override.locator('..').getByText('Propose balance override',{exact:true}).click()
     for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`${destination}/LEAVE-001-hr-person-${width}.png`,fullPage:true})}
     await override.getByLabel('Adjustment (hours, signed)',{exact:true}).fill('1')
     await override.getByLabel('Reason',{exact:true}).fill('Browser schedule correction')
     await override.getByRole('button',{name:'Request owner approval',exact:true}).click();await page.waitForURL(/\/app\/leave/)
     browserOverride=(await h.api('leave-overrides',cookie)).find(o=>o.note==='Browser schedule correction').id
     await page.goto(h.origin+'/app/settings')
     const form=page.locator('form[action="/app/do/policy.write"]').last()
     const policyName=`Office vacation ${(await h.api('policies',cookie)).filter(p=>p.name.startsWith('Office vacation')).length+1}`
     await form.getByLabel('Policy name',{exact:true}).fill(policyName)
     await form.getByLabel('Policy text',{exact:true}).fill('Reviewed employer rule, not a statutory determination')
     await form.getByText('Scheduled PTO rules',{exact:true}).click()
     await form.getByLabel('Scheduled policy kind',{exact:true}).selectOption('vacation')
     await form.getByLabel('Credit cadence',{exact:true}).selectOption('monthly')
     await form.getByLabel('Annual allowance',{exact:true}).first().fill('120')
     await form.getByLabel('Maximum balance (hours, blank for no cap)',{exact:true}).fill('160')
     await form.getByLabel('January 1 carryover maximum (hours, blank for all)',{exact:true}).fill('40')
     await form.getByLabel('Carryover expires (MM-DD, optional)',{exact:true}).first().fill('03-31')
     // Form names distinguish the repeated, readable location controls.
     await form.locator('[name="ruleLocation0"]').selectOption(ca)
     await form.locator('[name="ruleLocationReview0"]').fill('California policy reviewed')
     await form.locator('[name="ruleLocationAmount0_0"]').fill('144')
     for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});await form.screenshot({path:`${destination}/LEAVE-001-hr-policy-form-${width}.png`})
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
     }
     await form.getByRole('button',{name:'Save draft policy',exact:true}).click();await page.waitForURL(/\/app\/settings/)
     assert.ok(!new URL(page.url()).searchParams.has('error'),'LEAVE-001 policy form saved successfully')
     const p=(await h.api('policies',cookie)).find(p=>p.name===policyName)
     assert.equal(p.versions[0].status,'draft');assert.equal(p.versions[0].rules.locations[0].tiers[0].allowance.amount,144)
    }
    if(who==='owner'&&browserOverride){
     for(const width of [1440,390])await capture('/app/leave','override-pending',width)
     const decision=page.locator('form[action="/app/do/leave.override.decide"]').filter({has:page.locator(`input[name="override"][value="${browserOverride}"]`)}).filter({has:page.locator('input[name="decision"][value="approve"]')})
     await decision.getByRole('button',{name:'Approve override',exact:true}).click();await page.waitForURL(/notice=/)
     assert.equal((await h.api('leave-overrides',cookie)).find(o=>o.id===browserOverride).decision,'approved')
    }
    for(const width of [1440,390]){
     if(who==='owner'||who==='hr')await capture('/app/settings','settings',width)
     await capture('/app/leave','leave',width)
     await capture('/app/protected-leave','case-list',width)
     await capture(`/app/protected-leave/${caseId}`,'case-detail',width)
     if(who==='manager')assert.ok(!(await page.content()).includes('medical.txt'))
    }
   }finally{await context.close()}
  }
 }finally{await browser.close()}
}
