// ROLE-002 uses the actual owner form at both required viewport sizes.
import assert from 'node:assert/strict'
import { evidenceDirectory } from './evidence.mjs'

export async function bulkBrowserProof(page,h,owner,{members,level}) {
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000})
  await page.goto(h.origin+'/app/access')
  const section=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Assign levels to several members$/})})
  await section.locator('summary').click()
  const capture=async(target,name)=>{
   await page.evaluate(()=>document.fonts.ready)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`ROLE-002 ${name} fits ${width}`)
   await target.screenshot({path:`${evidenceDirectory}/ROLE-002-${name}-${width}.png`})
  }
  const submit=async(target,name)=>{
   await target.getByRole('button',{name,exact:true}).click()
   await page.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
   assert.ok(!new URL(page.url()).searchParams.has('error'),page.url())
  }
  for(const member of members) await section.locator(`input[name="members"][value="${member.id}"]`).check()
  await section.locator(`input[name="levels"][value="${level}"]`).check()
  await capture(section,'selection')
  await submit(section,'Review bulk assignment')
  const review=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Review access change',exact:true})}).last()
  for(const member of members) await review.getByRole('cell',{name:member.name,exact:true}).waitFor()
  await capture(review,'preview')
  await submit(page.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
  const result=(await h.api('levels',owner)).levels.find(l=>l.id===level)
  assert.deepEqual(result.members.sort(),members.map(m=>m.id).sort())
  const end=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Workforce reporting batch ·/})})
  await end.locator('summary').click()
  await capture(end,'applied')
  // Clear the batch through a fresh reviewed public action for the next viewport.
  const clear=await h.api('level.preview',owner,{kind:'bulk-assignment',members:members.map(m=>m.id),levels:[]})
  await h.api('level.apply',owner,{review:clear.id})
 }
}
