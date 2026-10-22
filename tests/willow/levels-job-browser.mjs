import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { evidenceDirectory } from './evidence.mjs'
import { day } from './regression-fixture.mjs'
export async function jobBrowserProof(h,owner,ctx) {
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')return
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const open=async cookie=>{const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})));return {context,page:await context.newPage()}}
 const admin=await open(owner),reader=await open(ctx.reader.cookie)
 try{
  const apply=async page=>{await page.getByRole('button',{name:'Apply reviewed change',exact:true}).click();await page.waitForURL(url=>url.searchParams.has('notice'));assert.ok(!new URL(page.url()).searchParams.has('error'))}
  const capture=async(page,name,width)=>{await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`);await page.screenshot({path:`${evidenceDirectory}/ROLE-004-${name}-${width}.png`,fullPage:true})}
  for(const width of [1440,390]){
   for(const page of [admin.page,reader.page])await page.setViewportSize({width,height:1000})
   await admin.page.goto(h.origin+'/app/access')
   const edit=admin.page.locator('details').filter({has:admin.page.locator('summary').filter({hasText:/^synthetic-willow-456 ·/})}).first()
   await edit.locator('summary').click()
   await edit.getByLabel('Job about others: Working schedule',{exact:true}).selectOption('view')
   await capture(admin.page,'level-editor',width)
   await edit.getByRole('button',{name:'Review level',exact:true}).click()
   await admin.page.waitForURL(url=>url.searchParams.has('levelReview'))
   await capture(admin.page,'review',width)
   await apply(admin.page)
   await reader.page.goto(h.origin+`/app/people/${ctx.target.person}`)
   await reader.page.getByText('synthetic-willow-452',{exact:true}).first().waitFor()
   assert.ok(!(await reader.page.locator('body').innerText()).includes('81,234.56'))
   await capture(reader.page,'view-only-record',width)
   await admin.page.goto(h.origin+'/app/access')
   const again=admin.page.locator('details').filter({has:admin.page.locator('summary').filter({hasText:/^synthetic-willow-456 ·/})}).first()
   await again.locator('summary').click()
   await again.getByLabel('Job about others: Job title',{exact:true}).selectOption('edit')
   await again.getByLabel('Job about others: Working schedule',{exact:true}).selectOption('approval')
   await again.getByRole('button',{name:'Review level',exact:true}).click();await admin.page.waitForURL(url=>url.searchParams.has('levelReview'));await apply(admin.page)
   await reader.page.goto(h.origin+`/app/people/${ctx.target.person}`)
   const change=reader.page.locator('section').filter({has:reader.page.getByRole('heading',{name:'Change permitted job fields',exact:true})})
   const title=change.locator('details').filter({has:reader.page.locator('summary').filter({hasText:/^Job title$/})})
   await title.locator('summary').click();await title.getByLabel('Job title',{exact:true}).fill(`synthetic-willow-46${width}`);await title.getByLabel('Effective from',{exact:true}).fill(day(width===1440?1:2));await title.getByLabel('Reason',{exact:true}).fill('Reviewed job correction')
   await capture(reader.page,'job-edit-form',width)
   await title.getByRole('button',{name:'Save job title',exact:true}).click();await reader.page.waitForURL(url=>url.searchParams.has('notice'));assert.ok(!new URL(reader.page.url()).searchParams.has('error'))
   await capture(reader.page,'job-edit-end-state',width)
   const request=reader.page.locator('section').filter({has:reader.page.getByRole('heading',{name:'Change permitted job fields',exact:true})}).locator('details').filter({has:reader.page.locator('summary').filter({hasText:/^Working schedule · approval required$/})})
   await request.locator('summary').click();await request.getByLabel('Working schedule',{exact:true}).selectOption(ctx.schedule.id);await request.getByLabel('Effective from',{exact:true}).fill(day(width===1440?3:4));await request.getByLabel('Reason',{exact:true}).fill('Review this schedule change')
   // A different schedule is needed to create a real change.
   const current=await h.api(`people/${ctx.target.person}`,owner)
   const alternative=(await h.api('settings',owner)).schedules.find(row=>row.id!==current.current.schedule.id)
   await request.getByLabel('Working schedule',{exact:true}).selectOption(alternative.id)
   await request.getByRole('button',{name:'Request working schedule change',exact:true}).click();await reader.page.waitForURL(url=>url.pathname.startsWith('/app/changes/'))
   assert.ok(!new URL(reader.page.url()).searchParams.has('error'));await capture(reader.page,'approval-pending',width)
   const id=new URL(reader.page.url()).pathname.split('/').at(-1),detail=await h.api(`change-requests/${id}`,owner)
   await h.api('change.decide',owner,{request:id,state:detail.state,decision:'decline',comment:'Keep original working schedule'})
   await reader.page.reload();await capture(reader.page,'approval-declined',width)
   await admin.page.goto(h.origin+'/app/access')
   const revoke=admin.page.locator('details').filter({has:admin.page.locator('summary').filter({hasText:/^synthetic-willow-456 ·/})}).first();await revoke.locator('summary').click()
   for(const field of ['Job title','Working schedule'])await revoke.getByLabel(`Job about others: ${field}`,{exact:true}).selectOption('none')
   await revoke.getByRole('button',{name:'Review level',exact:true}).click();await admin.page.waitForURL(url=>url.searchParams.has('levelReview'));await apply(admin.page)
   await reader.page.goto(h.origin+`/app/people/${ctx.target.person}`)
   assert.equal(await reader.page.getByRole('heading',{name:'Change permitted job fields',exact:true}).count(),0)
   assert.equal(await reader.page.getByText('synthetic-willow-452',{exact:true}).count(),0)
   await capture(reader.page,'revoked',width)
  }
 }finally{await admin.context.close();await reader.context.close();await browser.close()}
}
