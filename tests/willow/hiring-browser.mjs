// HIRING-003: real forms for the current manual pipeline; no provider simulation.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { evidenceDirectory } from './evidence.mjs'
export async function hiringBrowser(h, s) {
 if (process.env.WILLOW_PHASE2_BROWSER !== '1' && process.env.WILLOW_HIRING_BROWSER !== '1') return
 assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH)
 const {chromium} = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
 const browser = await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try {
  const context = async cookie => {
   const c = await browser.newContext({ignoreHTTPSErrors:true})
   await c.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})))
   return c
  }
  const hc=await context(s.hr.cookie),mc=await context(s.managera.cookie),oc=await context(s.managerb.cookie)
  const hp=await hc.newPage(),mp=await mc.newPage(),op=await oc.newPage()
  for (const width of [1440,390]) {
   for(const p of [hp,mp,op]) await p.setViewportSize({width,height:1000})
   const capture=async(p,name)=>{
    await p.evaluate(()=>document.fonts.ready)
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`)
    await p.screenshot({path:`${evidenceDirectory}/HIRING-003-${name}-${width}.png`,fullPage:true})
   }
   const save=async(p,button)=>{
    await p.getByRole('button',{name:button,exact:true}).click()
    await p.waitForURL(u=>u.searchParams.has('notice')||u.searchParams.has('error'))
    assert.ok(!new URL(p.url()).searchParams.has('error'),p.url())
   }
   const name=`Customer support specialist ${width}`
   await hp.goto(h.origin+'/app/hiring')
   await hp.getByLabel('Opening name',{exact:true}).fill(name)
   // An empty team is rejected by the action and must return to a usable form.
   const [invalidTeam] = await Promise.all([hp.waitForNavigation(),hp.getByRole('button',{name:'Create review',exact:true}).click()])
   assert.equal(invalidTeam.status(),200,'Rejected opening stays on a real page')
   assert.ok(new URL(hp.url()).searchParams.has('error'))
   assert.equal((await h.api('hiring',s.hr.cookie)).filter(o=>o.name===name).length,0)
   await capture(hp,'opening-validation')
   await hp.getByLabel('Opening name',{exact:true}).fill(name)
   await hp.locator(`input[name="members"][value="${s.managera.member}"]`).check()
   await capture(hp,'create-review')
   await save(hp,'Create review')
   await hp.getByRole('link',{name,exact:true}).click()
   const openingPath=new URL(hp.url()).pathname
   const job=(await h.api('hiring',s.hr.cookie)).find(o=>o.name===name)
   assert.ok(job)
   assert.equal((await op.goto(h.origin+openingPath)).status(),404)
   assert.ok(!(await op.textContent('body')).includes(name))
   await mp.goto(h.origin+'/app/hiring')
   await mp.getByRole('link',{name,exact:true}).click()
   assert.equal(new URL(mp.url()).pathname,openingPath)
   const applications=[]
   for(const candidate of ['Marisol Chen','Devon Patel']) {
    await mp.goto(h.origin+openingPath)
    await mp.getByLabel('Candidate name',{exact:true}).fill(candidate)
    await mp.getByLabel('Contact email',{exact:true}).fill(`${candidate.split(' ')[0].toLowerCase()}@example.test`)
    await mp.getByLabel('Source',{exact:true}).fill('Employee referral')
    if(!applications.length) {
     await mp.getByLabel('Contact email',{exact:true}).fill('marisol@example')
     const [invalidEmail]=await Promise.all([mp.waitForNavigation(),mp.getByRole('button',{name:'Add candidate',exact:true}).click()])
     assert.equal(invalidEmail.status(),200,'Rejected candidate stays on the opening')
     assert.equal(new URL(mp.url()).pathname,openingPath)
     assert.ok(new URL(mp.url()).searchParams.has('error'))
     assert.equal((await h.api(`hiring/openings/${job.id}`,s.hr.cookie)).candidates.length,0)
     await capture(mp,'candidate-validation')
     await mp.getByLabel('Candidate name',{exact:true}).fill(candidate)
     await mp.getByLabel('Contact email',{exact:true}).fill('marisol@example.test')
     await mp.getByLabel('Source',{exact:true}).fill('Employee referral')
    }
    await save(mp,'Add candidate')
    await mp.getByRole('link',{name:candidate,exact:true}).click()
    applications.push(new URL(mp.url()).pathname)
    await mp.getByLabel('Next stage',{exact:true}).selectOption('Interview')
    await save(mp,'Move candidate')
    const id=new URL(mp.url()).pathname.split('/').pop()
    assert.equal((await h.api(`hiring/applications/${id}`,s.managera.cookie)).stage,'Interview')
   }
   const candidatePath=applications[0],id=candidatePath.split('/').pop()
   await mp.goto(h.origin+candidatePath)
   const resumeBytes=Buffer.from(`%PDF-1.7\nMarisol resume ${width}`)
   await mp.getByLabel('Resume file',{exact:true}).setInputFiles({name:'marisol-resume.pdf',mimeType:'application/pdf',buffer:resumeBytes})
   await save(mp,'Upload resume')
   const resumeLink=mp.getByRole('link',{name:'marisol-resume.pdf',exact:true})
   const resumeUrl=await resumeLink.getAttribute('href')
   const [resumeDownload]=await Promise.all([mp.waitForEvent('download'),resumeLink.click()])
   assert.deepEqual(await readFile(await resumeDownload.path()),resumeBytes)
   assert.equal(resumeDownload.suggestedFilename(),'marisol-resume.pdf')
   await mp.getByLabel('Resume file',{exact:true}).setInputFiles({name:'marisol-corrected.txt',mimeType:'text/plain',buffer:Buffer.from('Corrected experience')})
   await save(mp,'Upload resume')
   assert.equal((await h.api(`hiring/applications/${id}`,s.managera.cookie)).resumes.length,2)
   await capture(mp,'resume-history')
   assert.equal((await op.goto(h.origin+resumeUrl)).status(),404)
   await mp.getByLabel('Observed evidence',{exact:true}).fill('Explained a billing escalation clearly; follow-up scenario discussed.')
   await save(mp,'Record evidence')
   await mp.getByLabel('Observed evidence',{exact:true}).fill('Correction: explained the escalation and checked consent before follow-up.')
   await save(mp,'Save correction')
   await hp.goto(h.origin+candidatePath)
   await hp.getByLabel('Observed evidence',{exact:true}).fill('Second interview: demonstrated patient written communication.')
   await save(hp,'Record evidence')
   const result=await h.api(`hiring/applications/${id}`,s.hr.cookie)
   assert.equal(result.stage,'Interview')
   assert.deepEqual(result.scorecards.filter(c=>c.author===s.managera.member).map(c=>c.version).sort(),[1,2])
   assert.equal(result.scorecards.filter(c=>c.author===s.hr.member).length,1)
   assert.equal(result.timeline.length,2)
   await capture(hp,'candidate-history')
   assert.equal((await op.goto(h.origin+candidatePath)).status(),404)
   assert.ok(!(await op.textContent('body')).includes('Marisol'))
   await hp.goto(h.origin+openingPath)
   await capture(hp,'opening-team')
   await hp.locator(`input[name="members"][value="${s.managera.member}"]`).uncheck()
   await hp.locator(`input[name="members"][value="${s.hr.member}"]`).check()
   await save(hp,'Save team')
   assert.equal((await mp.goto(h.origin+candidatePath)).status(),404)
   assert.equal((await h.raw(resumeUrl,{cookie:s.managera.cookie})).status,404)
   await capture(mp,'revoked')
   await mp.goto(h.origin+'/app/hiring')
   assert.equal(await mp.getByRole('link',{name,exact:true}).count(),0)
   await capture(mp,'scoped-list')
  }
  await hc.close();await mc.close();await oc.close()
 } finally {await browser.close()}
}
