import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { evidenceDirectory } from './evidence.mjs'

export async function handbookScreens(h,staff,calls) {
 if(process.env.WILLOW_AI_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const contexts=[]
 const actorPage=async cookie=>{
  const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context)
  await context.addCookies(cookie.split('; ').map(value=>({name:value.slice(0,value.indexOf('=')),value:value.slice(value.indexOf('=')+1),url:h.origin})))
  return context.newPage()
 }
 try{
  const hr=await actorPage(staff.hr.cookie),employee=await actorPage(staff.employee.cookie)
  const submit=async(page,button)=>{await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),button.click()])}
  const capture=async(page,name,width)=>{
   await page.evaluate(()=>document.fonts.ready)
   const bell=page.getByRole('link',{name:'Open your task list',exact:true})
   await bell.hover();await page.getByRole('tooltip',{name:'Your tasks',exact:true}).waitFor({state:'visible'})
   await bell.focus();assert.ok(await page.getByRole('tooltip',{name:'Your tasks',exact:true}).isVisible())
   await page.locator('h1').click()
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Handbook screens fit the viewport')
   await page.screenshot({path:join(evidenceDirectory,`handbook-${name}-${width}.png`),fullPage:true})
  }
  const openBook=async(page,title)=>{
   const summary=page.locator('summary').filter({hasText:new RegExp('^'+title+' ·')})
   await summary.click()
   return summary.locator('..')
  }
  for(const width of [1440,390]){
   await hr.setViewportSize({width,height:1000});await employee.setViewportSize({width,height:1000})
   const title=width===1440?'Flexible work handbook':'Workplace flexibility handbook'
   const before=calls.length
   await hr.goto(h.origin+'/app/settings');await hr.getByText('Create handbook source',{exact:true}).click()
   const form=hr.locator('form[action="/app/do/ai.handbook.write"]:visible')
   await form.getByLabel('Handbook title',{exact:true}).fill(title)
   await form.getByLabel('Clause number',{exact:true}).fill('1')
   await form.getByLabel('Topic',{exact:true}).selectOption('remote-work')
   await form.getByLabel('Applies from',{exact:true}).fill((await h.api('me',staff.hr.cookie)).today)
   await form.getByLabel('Plain-text policy clause',{exact:true}).fill('Agree remote working days with your manager in writing before the arrangement starts.')
   await capture(hr,'draft-request',width)
   await submit(hr,form.getByRole('button',{name:'Create handbook draft',exact:true}))
   const draft=(await h.api('handbook-management',staff.hr.cookie)).find(source=>source.title===title)
   assert.ok(draft)
   assert.ok(!(await h.api('handbooks',staff.employee.cookie)).some(source=>source.versionId===draft.versionId))
   let book=await openBook(hr,title)
   await book.getByText('Version 1 · Draft',{exact:true}).click()
   await capture(hr,'publication-review',width)
   await book.locator('input[name="sourceAttestation"]').check()
   await submit(hr,book.getByRole('button',{name:'Approve and publish exact version',exact:true}))
   book=await openBook(hr,title);await book.getByText('Version 1 · Published',{exact:true}).click()
   await capture(hr,'inclusion',width)
   await submit(hr,book.getByRole('button',{name:'Include approved version',exact:true}))
   assert.equal(calls.length,before,'Source management never invokes a provider')
   await employee.goto(h.origin+'/app/policy-assistant')
   await employee.getByLabel('Policy context',{exact:true}).selectOption('handbook')
   await employee.getByLabel('Question',{exact:true}).fill('What is our remote work policy?')
   await submit(employee,employee.getByRole('button',{name:'Ask about policy',exact:true}))
   await employee.getByRole('heading',{name:'Cited answer',exact:true}).waitFor()
   assert.ok((await employee.locator('body').innerText()).includes(draft.versionId))
   await capture(employee,'answer',width)
   await hr.goto(h.origin+'/app/settings');book=await openBook(hr,title)
   await book.getByText('Withdraw handbook',{exact:true}).click()
   await submit(hr,book.getByRole('button',{name:'Withdraw handbook source',exact:true}))
   await employee.goto(h.origin+'/app/policy-assistant')
   await employee.getByLabel('Policy context',{exact:true}).selectOption('handbook')
   await employee.getByLabel('Question',{exact:true}).fill('What is our remote work policy?')
   const withdrawn=calls.length
   await submit(employee,employee.getByRole('button',{name:'Ask about policy',exact:true}))
   await employee.getByRole('heading',{name:'Ask HR',exact:true}).waitFor()
   assert.equal(calls.length,withdrawn)
   await capture(employee,'withdrawn',width)
  }
 }finally{await Promise.all(contexts.map(context=>context.close()));await browser.close()}
}
