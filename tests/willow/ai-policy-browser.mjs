import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { evidenceDirectory } from './evidence.mjs'

export async function policyScreens(h,owner,staff,calculationPerson){
 if(process.env.WILLOW_AI_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  for(const [name,cookie,path] of [['assistant',staff.employee.cookie,'/app/policy-assistant'],['assistant-settings',owner,'/app/connections'],['assistant-inclusion',staff.hr.cookie,'/app/settings'],['assistant-leave',staff.employee.cookie,'/app/leave'],['assistant-tasks',staff.payroll.cookie,'/app/tasks'],...(calculationPerson?[['assistant-calculation',staff.managera.cookie,`/app/policy-assistant?person=${calculationPerson}`]]:[])]){
   const context=await browser.newContext({ignoreHTTPSErrors:true})
   await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:h.origin})))
   const page=await context.newPage()
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.goto(h.origin+path);await page.evaluate(()=>document.fonts.ready)
    if(name==='assistant-settings'){
     await page.getByText('Configure assistant',{exact:true}).click()
     await page.getByRole('button',{name:'Apply assistant controls',exact:true}).click()
     await page.getByRole('alert').waitFor()
     await page.screenshot({path:join(evidenceDirectory,`assistant-consent-required-${width}.png`),fullPage:true})
     await page.getByText('Configure assistant',{exact:true}).click()
     await page.getByText('Policy handling consent',{exact:true}).click()
     await page.getByText('Workflow handling consent',{exact:true}).click()
     await page.getByLabel('I attest to the policy handling statement',{exact:true}).check()
     await page.getByLabel('I attest to the workflow handling statement',{exact:true}).check()
     await page.screenshot({path:join(evidenceDirectory,`assistant-consent-${width}.png`),fullPage:true})
     await page.getByRole('button',{name:'Apply assistant controls',exact:true}).click()
     await page.getByRole('status').waitFor()
     await page.getByText('Configure assistant',{exact:true}).click()
    }
    if(name==='assistant-inclusion')await page.getByText('Policy inclusion',{exact:true}).first().click()
    if(name==='assistant'||name==='assistant-calculation'){
     await page.getByLabel('Question',{exact:true}).fill('Am I eligible for PTO?')
     await page.getByRole('button',{name:'Ask about policy',exact:true}).click()
     await page.getByRole('heading',{name:'Cited answer',exact:true}).waitFor()
     if(name==='assistant-calculation')await page.getByRole('heading',{name:'Willow leave calculation',exact:true}).waitFor()
    }
    const bell=page.getByRole('link',{name:'Open your task list',exact:true})
    await bell.focus();assert.ok(await page.getByRole('tooltip',{name:'Your tasks',exact:true}).isVisible())
    await page.locator('h1').click()
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow')
    await page.screenshot({path:join(evidenceDirectory,`${name}-${width}.png`),fullPage:true})
    if(name==='assistant'){
     await page.goto(h.origin+path)
     await page.getByLabel('Question',{exact:true}).fill('Who is the highest paid worker?')
     await page.getByRole('button',{name:'Ask about policy',exact:true}).click()
     await page.getByRole('heading',{name:'Ask HR',exact:true}).waitFor()
     await page.screenshot({path:join(evidenceDirectory,`assistant-refusal-${width}.png`),fullPage:true})
    }
   }
   await context.close()
  }
 }finally{await browser.close()}
}

export async function disabledPolicyScreen(h,cookie){
 if(process.env.WILLOW_AI_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true})
  await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:h.origin})))
  const page=await context.newPage()
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/policy-assistant')
   assert.equal(await page.getByRole('button',{name:'Ask about policy',exact:true}).count(),0)
   await page.screenshot({path:join(evidenceDirectory,`assistant-disabled-${width}.png`),fullPage:true})
  }
  await context.close()
 }finally{await browser.close()}
}
