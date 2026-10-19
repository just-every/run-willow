import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID, sign, createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { imports } from './import-transport.mjs'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')

// WIL-16: Business and the owner's forms share one real migrated HTTP pipeline.
export async function exerciseImportDoor({h,owner,nonOwner,inputs,before}) {
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'})
  const issuer='https://business.example.test', installationId='willow-import-conformance', key=publicKey.export({format:'jwk'})
  await h.setBindings({RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({business:key,retired:key})})
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
  const token=(action,approval={},kid='business',namespace='bamboohr')=>{
    const iat=Math.floor(Date.now()/1000)
    const payload={v:1,iss:issuer,aud:h.origin,installationId,email:h.vars.OWNER_EMAIL,jti:randomUUID(),iat,exp:iat+300,action,namespace,maxBytes:40_000_000,maxChunks:1024,maxRecords:100_000,...approval}
    const input=`${encode({alg:'ES256',typ:'rer-import-grant+jwt',kid})}.${encode(payload)}`
    return `${input}.${sign('sha256',Buffer.from(input),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`
  }
  const grant=async(action,body,{status=200,approval={},authorization=token(action,approval)}={})=>{
    const response=await fetch(`${h.origin}/api/rer/import/${action}`,{method:'POST',headers:{authorization:`Bearer ${authorization}`,'content-type':'application/json'},body:JSON.stringify(body)})
    const result=await response.json()
    assert.equal(response.status,status,`${action} grant: ${response.status} ${JSON.stringify(result).slice(0,300)}`)
    return result
  }
  const native=async()=>h.api('people',owner)
  await grant('status',{planId:'unknown'},{status:404})
  await h.api('import.settings',nonOwner,{enabled:true},403)
  await h.api('import.settings',owner,{enabled:true,revokedKids:['retired']})
  await grant('status',{planId:'unknown'},{status:403,authorization:token('status',{},'retired')})
  await grant('status',{planId:'unknown'},{status:403,authorization:token('status',{},'business','unlisted')})
  const repeated=token('status')
  await grant('status',{planId:'unknown'},{status:404,authorization:repeated})
  await grant('status',{planId:'unknown'},{status:403,authorization:repeated})
  const bytes=Buffer.from(JSON.stringify(inputs)),totalChunks=Math.ceil(bytes.length/65_536),bundleSha256=hash(bytes)
  let uploadId
  for(let index=0;index<totalChunks;index++) {
    const chunk=bytes.subarray(index*65_536,(index+1)*65_536)
    uploadId=(await grant('uploads',{uploadId,name:'bamboohr-bundle.json',bundleSha256,totalBytes:bytes.length,totalChunks,index,chunkSha256:hash(chunk),base64:chunk.toString('base64')})).uploadId
  }
  const plan=await grant('plan',{uploadId})
  assert.equal((await native()).length,before,'grant planning changes no native person')
  const approval={fingerprint:plan.fingerprint,approvalRecordId:randomUUID(),approvedAt:new Date().toISOString()}
  await grant('apply',{planId:plan.planId,reviewedFingerprint:'0'.repeat(64)},{status:403,approval})
  let applied
  for(let batch=0;batch<100;batch++) {
    applied=await grant('apply',{planId:plan.planId,reviewedFingerprint:plan.fingerprint},{approval})
    if(applied.job.state==='completed') break
    assert.ok(['queued','applying'].includes(applied.job.state))
  }
  assert.equal(applied.job.state,'completed')
  assert.equal((await grant('reconcile',{planId:plan.planId})).ok,true)
  assert.ok((await h.api('imports',owner)).find(row=>row.planId===plan.planId).caption.includes('approved via Business by'))
  await h.api('import.settings',owner,{enabled:false})
  await h.setBindings({RER_IMPORT_DOOR:'on'})
  assert.equal((await h.api('import-settings',owner)).enabled,false,'provisioning repair preserves the owner’s disabled choice')
  await grant('status',{planId:plan.planId},{status:404})
  // Business being off cannot lock the owner out of reconciliation or undo.
  const operator=imports(h,owner)
  assert.equal((await operator.reconcile(plan)).ok,true)
  await operator.undo(plan)
  assert.equal((await native()).length,before)
  await h.api('import.settings',owner,{enabled:true})
  await grant('status',{planId:'unknown'},{status:403,authorization:token('status',{},'retired')})
  await h.api('import.settings',owner,{enabled:false})
  await operator.request('uploads',{},403,{origin:'https://other.example.test'})
  await imports(h,'').request('uploads',{},401)
  // Deleted importer routes never create a hidden second pipeline.
  for(const action of ['import.preview','import.apply','import.job']) await h.api(action,owner,inputs,404)
  if(process.env.WILLOW_IMPORT_BROWSER!=='1') return
  const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  const directory=process.env.WILLOW_EVIDENCE_DIR
  assert.ok(directory)
  await mkdir(directory,{recursive:true})
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true})
    await context.addCookies(owner.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:h.origin})))
    const page=await context.newPage()
    const shot=async name=>{
      await page.evaluate(()=>document.fonts.ready)
      await page.screenshot({path:`${directory}/WIL-16-${name}-${page.viewportSize().width}.png`,fullPage:true})
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${page.viewportSize().width}: ${await page.evaluate(()=>JSON.stringify([...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,cl:e.className,w:Math.round(e.getBoundingClientRect().width)})).slice(-12)))}`)
    }
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.goto(h.origin+'/app/import')
      await shot('upload')
      for(const name of ['employees','balances','documents']) await page.locator(`[name=${name}]`).setInputFiles({name:inputs[name].filename,mimeType:inputs[name].type,buffer:Buffer.from(inputs[name].base64,'base64')})
      await page.locator('[name=schedule]').selectOption(inputs.schedule)
      await page.getByRole('button',{name:'Preview import',exact:true}).click()
      await page.waitForURL('**/app/import/preview')
      assert.ok(await page.locator('h1').innerText()==='Import preview')
      await shot('preview')
      await page.getByRole('button',{name:'Apply import',exact:true}).click()
      await page.waitForURL(url=>url.pathname==='/app/import')
      assert.equal((await native()).length,before+6)
      await shot('applied')
      await page.getByRole('button',{name:'Reconcile',exact:true}).last().click()
      await page.waitForURL('**/app/import/execute')
      assert.match(await page.locator('h1').innerText(),/reconciliation/i)
      await shot('reconciled')
      await page.goto(h.origin+'/app/import')
      await page.getByRole('button',{name:'Undo this import',exact:true}).last().click()
      await page.waitForURL(url=>url.pathname==='/app/import')
      assert.equal((await native()).length,before)
      await shot('undone')
    }
    await context.close()
  } finally { await browser.close() }
}
