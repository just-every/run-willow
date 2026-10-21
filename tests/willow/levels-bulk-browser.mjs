// ROLE-002 uses the actual owner filter and revert forms at both viewport sizes.
import assert from 'node:assert/strict'
import { evidenceDirectory } from './evidence.mjs'

export async function bulkBrowserProof(page,h,owner,{members,level,location,priorAssignments}) {
 const ids=members.map(m=>m.id)
 const assigned=data=>Object.fromEntries(ids.map(id=>[id,data.assignments.filter(a=>a.member_id===id).map(a=>a.level_id).sort()]))
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000})
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
  const reviewCard=()=>page.locator('section.card').filter({has:page.getByRole('heading',{name:'Review access change',exact:true})}).last()
  await page.goto(h.origin+'/app/access')
  assert.deepEqual(assigned(await h.api('levels',owner)),priorAssignments)
  await capture(page,'before')
  const section=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Assign levels by filter$/})})
  await section.locator('summary').click()
  await section.locator('[name="location"]').fill(location)
  await section.locator('[name="status"]').selectOption('active')
  await section.locator(`input[name="levels"][value="${level}"]`).check()
  await capture(section,'selection')
  await submit(section,'Review filtered assignment')
  let review=reviewCard()
  for(const member of members) await review.getByText(member.name,{exact:true}).waitFor()
  const batch=await page.locator('form[action="/app/do/level.apply"] input[name="review"]').inputValue()
  const immutable=await h.api(`level-reviews/${batch}`,owner)
  assert.deepEqual([...immutable.plan.members].sort(),[...ids].sort(),'The form reviews exactly the ten matching active linked members')
  await capture(review,'preview')
  await submit(page.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
  assert.equal(new URL(page.url()).pathname,'/app/access','Applying returns to the access page')
  assert.equal(new URL(page.url()).searchParams.has('levelReview'),false)
  const result=(await h.api('levels',owner)).levels.find(l=>l.id===level)
  assert.deepEqual(result.members.sort(),[...ids].sort())
  const end=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Workforce reporting batch ·/})})
  await end.locator('summary').click()
  await capture(end,'applied')
  const revertForm=page.locator('form[action="/app/do/level.preview"]').filter({has:page.locator(`input[name="batch"][value="${batch}"]`)})
  await submit(revertForm,'Review revert')
  review=reviewCard()
  await review.getByText('Revert batch assignment',{exact:true}).waitFor()
  for(const member of members) await review.getByText(member.name,{exact:true}).waitFor()
  await capture(review,'revert-preview')
  await submit(page.locator('form[action="/app/do/level.apply"]'),'Apply reviewed change')
  assert.equal(new URL(page.url()).pathname,'/app/access')
  assert.equal(new URL(page.url()).searchParams.has('levelReview'),false)
  assert.deepEqual(assigned(await h.api('levels',owner)),priorAssignments,'The owner form restores every prior assigned level')
  assert.deepEqual((await h.api('me',members[0].cookie)).permissions,['it.tasks'],'Direct grants survive the owner revert form')
  await capture(page,'reverted')
  const row=page.locator('tr').filter({has:page.getByText(batch,{exact:true})})
  await row.getByText('Reverted',{exact:true}).waitFor()
  await capture(row,'reverted-batch')
 }
}
