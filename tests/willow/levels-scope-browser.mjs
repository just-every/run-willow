// ROLE-002: the owner's scope picker and reach review, then the scoped member's in-scope and out-of-scope records.
import assert from 'node:assert/strict'
import { evidenceDirectory } from './evidence.mjs'
export async function scopeBrowserProof(browser,h,owner,{make,ten,inside,b0,harbour,hills}) {
 const contexts=[]
 const pageFor=async cookie=>{
  const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context)
  await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  return context.newPage()
 }
 try {
  const admin=await pageFor(owner)
  const submit=async(page,form,name)=>{
   await form.getByRole('button',{name,exact:true}).click()
   await page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
   assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())
  }
  for(const width of [1440,390]) {
   const member=await make(`br${width}`,{member:true}), reader=await pageFor(member.cookie)
   for(const page of [admin,reader]) await page.setViewportSize({width,height:1000})
   const capture=async(page,name)=>{
    await page.evaluate(()=>document.fonts.ready)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`ROLE-002 ${name} fits ${width}`)
    await page.screenshot({path:`${evidenceDirectory}/ROLE-002-scope-${name}-${width}.png`,fullPage:true})
   }
   await admin.goto(h.origin+'/app/access')
   const name=`Browser location reader ${width}`
   const create=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:/^Create a level$/})}).first()
   await create.locator('summary').click()
   await create.getByLabel('Level name',{exact:true}).fill(name)
   await create.getByLabel('Read private contact details',{exact:true}).check()
   await create.getByLabel('Scope',{exact:true}).selectOption('group')
   await create.getByLabel('Scope Harbour',{exact:true}).check()
   await capture(admin,'form')
   await submit(admin,create,'Review level')
   await admin.getByText('Reaches: Location: Scope Harbour',{exact:true}).waitFor()
   await capture(admin,'level-review')
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   const level=(await h.api('levels',owner)).levels.find(l=>l.name===name)
   assert.deepEqual(level.scope,{kind:'group',dimensions:{location:[harbour]}})
   const assignment=admin.locator('form[action="/app/do/level.preview"]').filter({has:admin.locator('input[name="kind"][value="assignment"]')})
   await assignment.getByLabel('Assign levels to',{exact:true}).selectOption(member.member)
   await assignment.getByLabel(name,{exact:true}).check()
   await submit(admin,assignment,'Review assignment')
   await admin.getByText(/people today\)/).first().waitFor()
   await capture(admin,'assignment-impact')
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await reader.goto(h.origin+`/app/people/${inside.person}`)
   await reader.getByText('Private details',{exact:true}).waitFor()
   await capture(reader,'in-scope-record')
   await reader.goto(h.origin+`/app/people/${b0.person}`)
   assert.equal(await reader.getByText('Private details',{exact:true}).count(),0,'An out-of-location record shows no private details')
   await capture(reader,'out-of-scope-record')
   await reader.goto(h.origin+'/app/people')
   await capture(reader,'directory')
   // Editing the scope in the same form is reviewed again and reaches the member on their next request.
   await admin.goto(h.origin+'/app/access')
   const section=admin.locator('details').filter({has:admin.locator('summary').filter({hasText:new RegExp(`^${name} ·`)})}).first()
   await section.locator('summary').click()
   await section.getByLabel('Scope Harbour',{exact:true}).uncheck()
   await section.getByLabel('Scope Hills',{exact:true}).check()
   await submit(admin,section,'Review level')
   await admin.getByText('Reaches: Location: Scope Hills',{exact:true}).waitFor()
   await capture(admin,'scope-edit-review')
   await submit(admin,admin.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
   await reader.goto(h.origin+`/app/people/${inside.person}`)
   assert.equal(await reader.getByText('Private details',{exact:true}).count(),0,'The edited scope applies in the same session')
   await reader.goto(h.origin+`/app/people/${b0.person}`)
   await reader.getByText('Private details',{exact:true}).waitFor()
   await capture(reader,'after-scope-edit')
   void ten; void hills
  }
 } finally { for(const context of contexts) await context.close() }
}
