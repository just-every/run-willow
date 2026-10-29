import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
// The browser receives unmodified production HTTP responses from the disposable
// verifier request function. It has no app binding or production credential.
export async function browserProof({request,origin,cookie,application}) {
 const directory=process.env.WILLOW_EVIDENCE_DIR||resolve('..','..','..','evidence','sx-door-adopt-willow-2')
 await mkdir(directory,{recursive:true})
 let phase='launch'
 const browser=await chromium.launch({executablePath:process.env.CI?undefined:'/usr/bin/chromium',args:['--no-sandbox']})
 try {
  const context=await browser.newContext()
  await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:origin}}))
  await context.route('**/*',async route=>{
   const source=route.request(),url=new URL(source.url())
   if(url.origin!==origin){await route.abort();return}
   const headers={...source.headers(),cookie}
   const response=await request(url.href,{method:source.method(),headers,body:source.postDataBuffer()??undefined,redirect:'manual'})
   const copied=Object.fromEntries(response.headers)
   delete copied['content-encoding'];delete copied['content-length'];delete copied['set-cookie']
   await route.fulfill({status:response.status,headers:copied,body:Buffer.from(await response.arrayBuffer())})
  })
  phase='new-page'
  const page=await context.newPage()
  const paths=[['agents','/agents'],['candidate',`/app/hiring/applications/${application}`],['audit','/app/audit'],['agent-docs','/docs/agents']]
  for(const [name,path] of paths)for(const width of [1440,390]) {
   phase=name+'-'+width+'-navigation'
   await page.setViewportSize({width,height:1000})
   const response=await page.goto(origin+path,{waitUntil:'networkidle'})
   assert.equal(response.status(),200,'Expected native page at '+phase)
   assert(await page.locator('h1').count())
   phase=name+'-'+width+'-overflow'
   if(width===1440)assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow: '+path)
   await page.screenshot({path:resolve(directory,`agent-door-${name}-${width}.png`),fullPage:true})
  }
  await context.close()
 }catch(error){console.error('Agent browser step failed: '+phase+' ('+error.name+')');throw error}finally{await browser.close()}
}
