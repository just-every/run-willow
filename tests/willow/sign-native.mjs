import { day } from './regression-fixture.mjs'
// Native signature business journeys extend the existing company-file acceptance.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument,StandardFonts,PDFArray,decodePDFRawStream } from 'pdf-lib'
import { file } from './harness.mjs'
import { mkdir } from 'node:fs/promises'
export async function nativeSigningProof(h,owner,s,join) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const as=(cookie,path,body,status)=>h.api(path,cookie,body,status)
 const employeeRecord=await api('people/'+s.employee.person)
 await api('person.update',{person:s.employee.person,revision:employeeRecord.revision,legalName:'Maya Chen',workEmail:'employee@example.com',employeeNumber:'WIL-103'})
 const mergeLocation=await api('location.create',{name:'Brisbane office',timezone:'Australia/Brisbane'})
 const mergeDepartment=await api('department.create',{name:'Field operations'})
 await api('mover.schedule',{period:s.employee.period,effectiveFrom:day(-1),locationId:mergeLocation.id,departmentId:mergeDepartment.id,reason:'Reviewed office assignment'})
 const mergeRecord=await api('people/'+s.employee.person)
 const folder=await api('company.folder',{name:'synthetic-willow-15200',audience:{kind:'everyone',id:null}})
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
 pdf.addPage([612,792]).drawText('Employment agreement for synthetic Willow employee',{x:40,y:730,font,size:14})
 pdf.addPage([612,792])
 const source=await api('company.file',{folder:folder.id,title:'Employment agreement',file:file('agreement.pdf',await pdf.save())})
 const category=await api('category.create',{name:'Signed agreements',subjectReads:true,managerReads:true})
 const fields=[{signer:0,kind:'employee_name',page:1,x:0.1,y:0.1,width:0.5,height:0.05},{signer:0,kind:'job_title',page:1,x:0.1,y:0.2,width:0.5,height:0.05},{signer:0,kind:'compensation',page:1,x:0.1,y:0.3,width:0.7,height:0.05},{signer:0,kind:'signature',page:1,x:0.1,y:0.4,width:0.4,height:0.07},{signer:0,kind:'initial',page:1,x:0.1,y:0.5,width:0.2,height:0.05},{signer:0,kind:'date',page:1,x:0.5,y:0.5,width:0.3,height:0.05},{signer:0,kind:'text',page:1,x:0.1,y:0.6,width:0.5,height:0.05},{signer:1,kind:'signature',page:1,x:0.1,y:0.8,width:0.5,height:0.07}]
 fields.push(...['work_email','employee_number','start_date','department','location'].map((kind,i)=>({signer:0,kind,page:2,x:0.1,y:0.1+i*0.12,width:0.8,height:0.08})))
 const t=await api('signature.template',{source:source.versionId,title:'Employment agreement',category:category.id,signers:['employee','hr'],fields})
 const template=(await api('signature-templates')).find(x=>x.id===t.id)
 await api('signature.template.approve',{template:t.id,digest:template.digest,reviewed:true})
 const input={template:t.id,people:[s.employee.person,s.managerb.person],hr:s.hr.member,expiresAt:Date.now()+7*86400000}
 await as(s.employee.cookie,'signature.preview',input,403)
 const review=await api('signature.preview',input)
 assert.equal(review.recipients.length,2)
 assert.equal(review.recipients[0].merged.employee_name,'Maya Chen')
 assert.ok(review.recipients[0].merged.compensation.includes('81234.56'))
 assert.deepEqual(Object.fromEntries(['work_email','employee_number','start_date','department','location'].map(key=>[key,review.recipients[0].merged[key]])),{work_email:'employee@example.com',employee_number:'WIL-103',start_date:mergeRecord.employment.find(p=>p.id===mergeRecord.selectedPeriod).startDate,department:'Field operations',location:'Brisbane office'})
 const preview=await h.raw('/app/signature-reviews/'+review.id+'?person='+s.employee.person,{cookie:owner})
 assert.equal(preview.status,200)
 assert.equal(createHash('sha256').update(Buffer.from(await preview.arrayBuffer())).digest('hex'),review.recipients[0].sha256)
 await as(s.hr.cookie,'signature.preview',input,403)
 await api('signature.send',{review:review.id,digest:review.digest,approved:false},400)
 await as(s.hr.cookie,'signature.send',{review:review.id,digest:review.digest,approved:true},409)
 const sent=await api('signature.send',{review:review.id,digest:review.digest,approved:true})
 await api('signature.send',{review:review.id,digest:review.digest,approved:true},409)
 const id=sent.requests[0],other=sent.requests[1]
 const detail=()=>as(s.employee.cookie,'signature-requests/'+id)
 const act=async(cookie,action,extra={},status)=>{
  const r=await as(cookie,'signature-requests/'+id),bound={request:id,revision:r.revision,digest:r.digest}
  if(action==='sign'&&extra.consent) {
   const payload=await as(cookie,'signature.prepare',{...bound,name:extra.name,initial:extra.initial,text:extra.text},status===403?403:200)
   if(status===403)return
   return as(cookie,'signature.act',{...bound,action,consent:true,payload:payload.id},status)
  }
  return as(cookie,'signature.act',{...bound,action,consent:extra.consent},status)
 }
 assert.equal((await detail()).canSign,true)
 const freshBound={request:id,revision:(await detail()).revision,digest:(await detail()).digest}
 const boundPayload=await as(s.employee.cookie,'signature.prepare',{...freshBound,name:'Session bound signer',initial:'SB',text:'Agreed'})
 const secondSession=await h.signIn('employee@example.com')
 await as(secondSession,'signature.act',{...freshBound,action:'sign',consent:true,payload:boundPayload.id},409)
 assert.equal((await h.raw('/app/signature-payloads/'+boundPayload.id+'.pdf',{cookie:secondSession})).status,404)
 await as(s.employee.cookie,'signature.act',{...freshBound,action:'sign',consent:true,payload:boundPayload.id,name:'Changed after review'},400)
 const exactPayload=await h.raw('/app/signature-payloads/'+boundPayload.id+'.pdf',{cookie:s.employee.cookie})
 assert.equal(exactPayload.status,200)
 assert.equal(createHash('sha256').update(Buffer.from(await exactPayload.arrayBuffer())).digest('hex'),boundPayload.sha256)
 await as(s.payroll.cookie,'signature-requests/'+id,undefined,404)
 assert.deepEqual(await as(s.payroll.cookie,'signature-requests'),[])
 await act(s.hr.cookie,'sign',{consent:true,name:'HR signer'},403)
 await act(s.employee.cookie,'sign',{consent:false,name:'Employee signer'},400)
 const stale=await detail()
 await act(s.employee.cookie,'view')
 await as(s.employee.cookie,'signature.act',{request:id,revision:stale.revision,digest:stale.digest,action:'sign',consent:true},409)
 await act(s.employee.cookie,'sign',{consent:true,name:'Employee signer',initial:'ES',text:'Agreed'})
 assert.equal((await detail()).canSign,false)
 const middle=await detail()
 assert.notEqual(middle.digest,stale.digest)
 await act(s.employee.cookie,'sign',{consent:true,name:'Employee signer'},403)
 await act(s.hr.cookie,'sign',{consent:true,name:'HR signer'})
 const completed=await detail()
 assert.equal(completed.state,'signed');assert.ok(completed.sealedVersion)
 assert.equal(completed.certificate.signers.length,2)
 assert.equal(completed.certificate.approvedDigest,review.recipients[0].sha256)
 assert.equal(completed.certificate.signers[0].payloadDigest,completed.certificate.signers[1].sourceDigest)
 assert.equal(completed.certificate.signers[1].payloadDigest,completed.certificate.sha256)
 assert.ok(completed.certificate.signers.every(x=>x.sessionBinding&&x.language==='en'&&x.consentVersion))
 assert.ok(completed.certificate.signers.every(x=>x.authentication==='active-session'&&x.consent))
 const downloaded=await h.raw('/app/files/document/'+completed.sealedVersion+'?download=1',{cookie:s.employee.cookie})
 assert.equal(downloaded.status,200)
 const sealed=Buffer.from(await downloaded.arrayBuffer())
 assert.equal(createHash('sha256').update(sealed).digest('hex'),completed.certificate.sha256)
 const sealedPdf=await PDFDocument.load(sealed)
 assert.equal(sealedPdf.getPageCount(),2)
 const streams=sealedPdf.getPages().flatMap(page=>{const contents=page.node.Contents();return contents instanceof PDFArray?Array.from({length:contents.size()},(_,i)=>sealedPdf.context.lookup(contents.get(i))):[contents]})
 const operators=streams.map(stream=>Buffer.from(decodePDFRawStream(stream).decode()).toString()).join('\n')
 for(const text of ['Maya Chen','Present role','AUD 81234.56 salary','Employee signer','ES','Agreed','HR signer','employee@example.com','WIL-103','Field operations','Brisbane office',review.recipients[0].merged.start_date,completed.certificate.signers[0].values.date])assert.ok(operators.includes(Buffer.from(text).toString('hex').toUpperCase()),'Sealed PDF renders '+text)
 assert.ok(operators.includes('61.2'),'The configured signature placement is present in the sealed PDF')
 await as(s.employee.cookie,'signature.act',{request:id,revision:completed.revision,digest:completed.digest,action:'withdraw'},409)
 assert.equal((await h.raw('/app/files/document/'+completed.sealedVersion,{cookie:s.payroll.cookie})).status,404)
 const manager=await as(s.managera.cookie,'signature-requests')
 assert.ok(manager.some(r=>r.id===id));assert.ok(!manager.some(r=>r.id===other))
 const managerDetail=await as(s.managera.cookie,'signature-requests/'+id)
 assert.deepEqual(managerDetail.fields,[]);assert.equal(managerDetail.certificate,null)
 const csv=await h.raw('/app/signatures.csv',{cookie:s.managera.cookie})
 const report=await csv.text();assert.ok(report.includes(id));assert.ok(!report.includes(other))
 await api('signature.cancel',{cohort:sent.id})
 assert.equal((await detail()).state,'signed')
 assert.equal((await as(s.managerb.cookie,'signature-requests/'+other)).state,'voided')
 const reissue=await api('signature.preview',{...input,people:[s.employee.person]})
 const next=await api('signature.send',{review:reissue.id,digest:reissue.digest,approved:true})
 assert.notEqual(next.requests[0],id)
 await as(s.employee.cookie,'signature.act',{request:id,revision:stale.revision,digest:stale.digest,action:'sign',consent:true},409)
 const partialReview=await api('signature.preview',{...input,people:[s.employee.person]})
 const partialSend=await api('signature.send',{review:partialReview.id,digest:partialReview.digest,approved:true})
 const partial=await as(s.employee.cookie,'signature-requests/'+partialSend.requests[0])
 const partialPayload=await as(s.employee.cookie,'signature.prepare',{request:partial.id,revision:partial.revision,digest:partial.digest,name:'Incomplete signer',initial:'IS',text:'Agreed'})
 await as(s.employee.cookie,'signature.act',{request:partial.id,revision:partial.revision,digest:partial.digest,action:'sign',consent:true,payload:partialPayload.id})
 const unsigned=await as(s.employee.cookie,'signature-requests/'+partial.id)
 await as(s.employee.cookie,'signature.act',{request:partial.id,revision:unsigned.revision,digest:unsigned.digest,action:'withdraw'})
 const withdrawn=await as(s.employee.cookie,'signature-requests/'+partial.id)
 assert.equal(withdrawn.state,'withdrawn');assert.equal(withdrawn.signed.length,1);assert.equal(withdrawn.sealedVersion,null)
 await as(s.hr.cookie,'signature.prepare',{request:partial.id,revision:withdrawn.revision,digest:withdrawn.digest,name:'Late HR'},409)
 for(const action of ['decline','withdraw','void']) {
  const rev=await api('signature.preview',{...input,people:[s.employee.person]})
  const send=await api('signature.send',{review:rev.id,digest:rev.digest,approved:true})
  const r=await as(s.employee.cookie,'signature-requests/'+send.requests[0])
  await as(action==='void'?owner:s.employee.cookie,'signature.act',{request:r.id,revision:r.revision,digest:r.digest,action})
  await as(s.employee.cookie,'signature.act',{request:r.id,revision:r.revision,digest:r.digest,action:'sign',consent:true},409)
 }
 const oldReview=await api('signature.preview',{...input,people:[s.employee.person]})
 const oldSend=await api('signature.send',{review:oldReview.id,digest:oldReview.digest,approved:true})
 const oldRequest=await as(s.employee.cookie,'signature-requests/'+oldSend.requests[0])
 await api('signature.act',{request:oldRequest.id,revision:oldRequest.revision,digest:oldRequest.digest,action:'void'})
 const revised=await api('signature.template',{template:t.id,source:source.versionId,title:'Reissued agreement',category:category.id,signers:['employee','hr'],fields})
 const revisedTemplate=(await api('signature-templates')).find(x=>x.id===revised.id)
 await api('signature.template.approve',{template:revised.id,digest:revisedTemplate.digest,reviewed:true})
 const changedReview=await api('signature.preview',{...input,template:revised.id,people:[s.employee.person]})
 const changedSend=await api('signature.send',{review:changedReview.id,digest:changedReview.digest,approved:true})
 await as(s.employee.cookie,'signature.act',{request:oldRequest.id,revision:oldRequest.revision,digest:oldRequest.digest,action:'sign',consent:true},409)
 assert.equal((await as(s.employee.cookie,'signature-requests/'+changedSend.requests[0])).state,'sent')
 const location=await api('location.create',{name:'Signature cohort office',timezone:'UTC'})
 const cohortPeople=[],cohortCookies=[]
 for(let i=0;i<5;i++) {
  const person=await join('synthetic-willow-'+(15210+i),{locationId:location.id})
  await api('access.give',{person:person.person})
  cohortCookies.push(await h.signIn('synthetic-willow-'+(15210+i)+'@example.com',{requested:true}))
  cohortPeople.push(person.person)
 }
 const cohortReview=await api('signature.preview',{template:revised.id,cohortKind:'location',cohortValue:location.id,hr:s.hr.member,expiresAt:Date.now()+7*86400000})
 assert.deepEqual(cohortReview.recipients.map(p=>p.id).sort(),[...cohortPeople].sort())
 const locationSend=await api('signature.send',{review:cohortReview.id,digest:cohortReview.digest,approved:true})
 assert.equal(locationSend.requests.length,5)
 const nonmatching=await as(s.managera.cookie,'signature-requests')
 assert.ok(!nonmatching.some(r=>locationSend.requests.includes(r.id)))
 for(let i=0;i<2;i++) {
  const recipient=cohortReview.recipients.find(p=>p.member&&(p.id===cohortPeople[i]))
  const requests=await as(cohortCookies[i],'signature-requests'),request=requests.find(r=>r.cohort===locationSend.id)
  assert.ok(request&&recipient)
  if(i===1&&process.env.WILLOW_SIGN_BROWSER==='1')await phoneCohortSigner(h,cohortCookies[i],s.hr.cookie,request.id)
  else for(const [cookie,name] of [[cohortCookies[i],'Cohort employee '+i],[s.hr.cookie,'Named HR']]) {
   const r=await as(cookie,'signature-requests/'+request.id),bound={request:r.id,revision:r.revision,digest:r.digest}
   const payload=await as(cookie,'signature.prepare',{...bound,name,initial:'CE',text:'Agreed'})
   await as(cookie,'signature.act',{...bound,action:'sign',consent:true,payload:payload.id})
  }
  const record=await as(cohortCookies[i],'signature-requests/'+request.id)
  assert.equal(record.state,'signed');assert.ok(record.sealedVersion)
  const profile=await as(cohortCookies[i],'people/'+cohortPeople[i])
  assert.ok(profile.documents.some(d=>d.categoryId===category.id&&d.versions.some(v=>v.id===record.sealedVersion)))
 }
 await api('signature.cancel',{cohort:locationSend.id})
 const cohortStates=(await api('signature-requests')).filter(r=>locationSend.requests.includes(r.id))
 assert.equal(cohortStates.filter(r=>r.state==='voided').length,3)
 assert.equal(cohortStates.filter(r=>r.state==='signed').length,2)
 const expiryReview=await api('signature.preview',{...input,template:revised.id,people:[s.employee.person],expiresAt:Date.now()+65000})
 const expiry=await api('signature.send',{review:expiryReview.id,digest:expiryReview.digest,approved:true})
 const expiredBefore=await as(s.employee.cookie,'signature-requests/'+expiry.requests[0])
 const tick=await h.raw('/cdn-cgi/local/scheduled?time='+expiryReview.expiresAt+'&cron='+encodeURIComponent('*/15 * * * *')+'&format=json')
 assert.equal(tick.status,200)
 const expired=await as(s.employee.cookie,'signature-requests/'+expiredBefore.id)
 assert.equal(expired.state,'expired');assert.equal(expired.canSign,false)
 await as(s.employee.cookie,'signature.act',{request:expiredBefore.id,revision:expiredBefore.revision,digest:expiredBefore.digest,action:'sign',consent:true,payload:'synthetic-willow-15299'},409)
 assert.equal((await h.raw('/app/signatures/'+expiredBefore.id,{cookie:s.employee.cookie})).status,200)

 await signingBrowser(h,owner,s,next.requests[0],oldRequest.id,changedSend.requests[0],expiry.requests[0])
 console.log('Native signing: PASS — consent, ordered signatures, sealed bytes, certificate, scoped cohort status, cancellation and old request refusal')
}
async function signingBrowser(h,owner,s,id,oldId,newId,expiredId) {
 if(process.env.WILLOW_SIGN_BROWSER!=='1')return
 const destination=process.env.WILLOW_EVIDENCE_DIR;assert.ok(destination);await mkdir(destination,{recursive:true})
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH??'@playwright/test')
 const browser=await chromium.launch({headless:true,...(process.env.WILLOW_CHROMIUM?{executablePath:process.env.WILLOW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const contexts=[]
 const enter=async cookie=>{const c=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(c);await c.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})));return c.newPage()}
 const capture=async(page,path,name)=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal((await page.goto(h.origin+path)).status(),200);await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' fits '+width);await page.screenshot({path:`${destination}/SIGN-${name}-${width}.png`,fullPage:true});const bell=page.getByRole('link',{name:'Open your task list'});await bell.focus();await page.getByRole('tooltip').waitFor({state:'visible'});await bell.hover();await page.waitForTimeout(350);assert.ok(await page.getByRole('tooltip').isVisible());await page.screenshot({path:`${destination}/SIGN-${name}-tooltip-${width}.png`,fullPage:true})}}
 try {
  const admin=await enter(owner),employee=await enter(s.employee.cookie),hr=await enter(s.hr.cookie),manager=await enter(s.managera.cookie)
  await capture(employee,'/app/signatures/'+oldId,'old-link');assert.equal(await employee.getByRole('button',{name:'Review signing document'}).count(),0);assert.equal((await h.api('signature-requests/'+newId,s.employee.cookie)).state,'sent')
  await capture(employee,'/app/signatures/'+expiredId,'expired');assert.equal(await employee.getByRole('button',{name:'Review signing document'}).count(),0)
  await capture(admin,'/app/settings/signatures','template-library')
  await admin.getByText('Create a template',{exact:true}).click()
  for(const title of ['Offer letter','Employment agreement','Workplace policy']) {
   const editor=admin.locator('form[action="/app/do/signature.template"]')
   await editor.getByLabel('Template title',{exact:true}).fill(title)
   await editor.getByLabel('Filing category',{exact:true}).selectOption({label:'Signed agreements'})
   for(const width of [1440,390]){await admin.setViewportSize({width,height:1000});await admin.screenshot({path:`${destination}/SIGN-template-editor-${title.replaceAll(' ','-')}-${width}.png`,fullPage:true})}
   await editor.getByRole('button',{name:'Save template revision'}).click();assert.ok(!new URL(admin.url()).searchParams.has('error'))
   const approve=admin.locator('form[action="/app/do/signature.template.approve"]').last()
   await approve.locator('input[name="reviewed"]').check();await approve.getByRole('button',{name:'Approve exact template'}).click();assert.ok(!new URL(admin.url()).searchParams.has('error'))
   await admin.getByText('Create a template',{exact:true}).click()
  }
  await capture(admin,'/app/signatures','requests')
  const f=admin.locator('form[action="/app/do/signature.preview"]');await f.locator(`input[value="${s.employee.person}"]`).check();await f.getByLabel('HR countersigner').selectOption(s.hr.member);await f.getByRole('button',{name:'Review recipients'}).click()
  assert.ok(!new URL(admin.url()).searchParams.has('error'))
  for(const width of [1440,390]){await admin.setViewportSize({width,height:1000});await admin.screenshot({path:`${destination}/SIGN-review-${width}.png`,fullPage:true})}
  await capture(employee,'/app/signatures/'+id,'employee-consent')
  await employee.getByLabel('Signature name',{exact:true}).fill('Employee form signer');await employee.getByLabel('Initials',{exact:true}).fill('EF');await employee.getByLabel('Text field',{exact:true}).fill('Agreed');await employee.getByRole('button',{name:'Review signing document'}).click();assert.ok(!new URL(employee.url()).searchParams.has('error'));for(const width of [1440,390]){await employee.setViewportSize({width,height:1000});await employee.screenshot({path:`${destination}/SIGN-payload-review-${width}.png`,fullPage:true})}await employee.locator('input[name="consent"]').check();await employee.getByRole('button',{name:'Sign exact document'}).click();assert.ok(!new URL(employee.url()).searchParams.has('error'))
  await capture(hr,'/app/signatures/'+id,'hr-countersign')
  await hr.getByLabel('Signature name',{exact:true}).fill('HR form signer');await hr.getByRole('button',{name:'Review signing document'}).click();assert.ok(!new URL(hr.url()).searchParams.has('error'));await hr.locator('input[name="consent"]').check();await hr.getByRole('button',{name:'Sign exact document'}).click();assert.ok(!new URL(hr.url()).searchParams.has('error'))
  await capture(employee,'/app/signatures/'+id,'sealed-certificate');await capture(manager,'/app/signatures','manager-report')
 } finally {for(const c of contexts)await c.close();await browser.close()}
}

async function phoneCohortSigner(h,employeeCookie,hrCookie,id) {
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH??'@playwright/test')
 const browser=await chromium.launch({headless:true,...(process.env.WILLOW_CHROMIUM?{executablePath:process.env.WILLOW_CHROMIUM}:{}),args:['--use-mock-keychain','--password-store=basic']})
 try {
  for(const [cookie,width,name] of [[employeeCookie,390,'Phone cohort signer'],[hrCookie,1440,'Named cohort HR']]) {
   const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}})
   await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})))
   const page=await context.newPage();assert.equal((await page.goto(h.origin+'/app/signatures/'+id)).status(),200)
   await page.getByLabel('Signature name',{exact:true}).fill(name)
   if(width===390){await page.getByLabel('Initials',{exact:true}).fill('PC');await page.getByLabel('Text field',{exact:true}).fill('Agreed')}
   await page.getByRole('button',{name:'Review signing document'}).click();assert.ok(!new URL(page.url()).searchParams.has('error'))
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   await page.screenshot({path:process.env.WILLOW_EVIDENCE_DIR+'/SIGN-location-payload-'+width+'.png',fullPage:true})
   await page.locator('input[name="consent"]').check();await page.getByRole('button',{name:'Sign exact document'}).click()
   assert.ok(!new URL(page.url()).searchParams.has('error'))
   await page.screenshot({path:process.env.WILLOW_EVIDENCE_DIR+'/SIGN-location-signed-'+width+'.png',fullPage:true});await context.close()
  }
 } finally {await browser.close()}
}
