// ROLE-001: owner configuration → employee proposal → HR release → same-session revocation.
import assert from 'node:assert/strict'
import { evidenceDirectory } from './evidence.mjs'
export async function personalBrowserProof(browser,h,owner,staff) {
 const contexts=[]
 const pageFor=async cookie=>{
  const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context)
  await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  return context.newPage()
 }
 try {
  const admin=await pageFor(owner), employee=await pageFor(staff.employee.cookie), hr=await pageFor(staff.hr.cookie)
  const capture=async(page,name,width)=>{
   await page.evaluate(()=>document.fonts.ready)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`ROLE-001 ${name} fits ${width}`)
   await page.screenshot({path:`${evidenceDirectory}/ROLE-001-personal-${name}-${width}.png`,fullPage:true})
  }
  const submit=async(page,form,name)=>{
   await form.getByRole('button',{name,exact:true}).click()
   await page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
   assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())
  }
  for(const width of [1440,390]) {
   for(const page of [admin,employee,hr]) await page.setViewportSize({width,height:1000})
   await admin.goto(h.origin+'/app/access')
   const name=`Personal approval ${width}`
   const create=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:/^Create a level$/})}).first()
   await create.locator('summary').click()
   await create.getByLabel('Level name',{exact:true}).fill(name)
   await create.getByLabel('Phone',{exact:true}).selectOption('approval')
   await create.getByLabel('Preferred name',{exact:true}).selectOption('view')
   await capture(admin,'configure',width)
   await submit(admin,create,'Review level')
   await capture(admin,'review',width)
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   const assignment=admin.locator('form[action="/app/do/level.preview"]').filter({has:admin.locator('input[name="kind"][value="assignment"]')})
   await assignment.getByLabel('Assign levels to',{exact:true}).selectOption(staff.employee.member)
   await assignment.getByLabel(name,{exact:true}).check()
   await submit(admin,assignment,'Review assignment')
   await capture(admin,'assignment-impact',width)
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await employee.goto(h.origin+`/app/people/${staff.employee.person}`)
   assert.equal(await employee.getByRole('button',{name:'Save preferred name',exact:true}).count(),0)
   await employee.getByText('Edit private details',{exact:true}).click()
   await capture(employee,'profile',width)
   await employee.goto(h.origin+'/app/self-changes')
   const request=employee.locator('form[action="/app/do/self.request"]').filter({has:employee.locator('input[name="field"][value="phone"]')})
   await request.locator('..').locator('summary').click()
   await request.getByLabel('Phone',{exact:true}).fill(width===1440?'+1 512 555 0144':'+1 512 555 0390')
   await capture(employee,'request-form',width)
   await submit(employee,request,'Request phone change')
   const id=new URL(employee.url()).pathname.split('/').pop()
   assert.equal((await h.api(`self-changes/${id}`,staff.employee.cookie)).status,'pending')
   await capture(employee,'pending',width)
   await hr.goto(h.origin+`/app/self-changes/${id}`)
   const decision=hr.locator('form[action="/app/do/self.decide"]')
   await decision.getByLabel('Decision',{exact:true}).selectOption('approve')
   await decision.getByLabel('Comment',{exact:true}).fill('Contact revision reviewed with employee')
   await capture(hr,'hr-review',width)
   await submit(hr,decision,'Record decision')
   assert.equal((await h.api(`people/${staff.employee.person}`,staff.employee.cookie)).private.phone,width===1440?'+1 512 555 0144':'+1 512 555 0390')
   await capture(hr,'approved',width)
   await employee.reload()
   await capture(employee,'approved-history',width)
   await admin.goto(h.origin+'/app/access')
   const edit=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:new RegExp(`^${name} ·`)})}).first()
   await edit.locator('summary').click()
   await edit.getByLabel('Phone',{exact:true}).selectOption('view')
   await submit(admin,edit,'Review level')
   await capture(admin,'revoke-impact',width)
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await employee.goto(h.origin+'/app/self-changes')
   assert.equal(await employee.locator('input[name="field"][value="phone"]').count(),0)
   await h.api('self.request',staff.employee.cookie,{kind:'personal',field:'phone',value:'No longer permitted'},403)
   await capture(employee,'revoked',width)
  }
 } finally {for(const context of contexts) await context.close()}
}
