import { launchSigningBrowser,prepareSigningCapture } from './sign-browser.mjs'
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
 await api('mover.schedule',{period:s.employee.period,effectiveFrom:day(-2),locationId:mergeLocation.id,departmentId:mergeDepartment.id,reason:'Reviewed office assignment'})
 const mergeRecord=await api('people/'+s.employee.person)
 const folder=await api('company.folder',{name:'synthetic-willow-15200',audience:{kind:'everyone',id:null}})
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
 pdf.addPage([612,792]).drawText('Employment offer for Willow employee',{x:40,y:730,font,size:14})
 pdf.addPage([612,792])
 const source=await api('company.file',{folder:folder.id,title:'Offer letter',file:file('offer.pdf',await pdf.save())})
 const category=await api('category.create',{name:'Signed agreements',subjectReads:true,managerReads:true})
 const fields=[{signer:0,kind:'employee_name',page:1,x:0.1,y:0.1,width:0.5,height:0.05},{signer:0,kind:'job_title',page:1,x:0.1,y:0.2,width:0.5,height:0.05},{signer:0,kind:'compensation',page:1,x:0.1,y:0.3,width:0.7,height:0.05},{signer:0,kind:'signature',page:1,x:0.1,y:0.4,width:0.4,height:0.07},{signer:0,kind:'initial',page:1,x:0.1,y:0.5,width:0.2,height:0.05},{signer:0,kind:'date',page:1,x:0.5,y:0.5,width:0.3,height:0.05},{signer:0,kind:'text',page:1,x:0.1,y:0.6,width:0.5,height:0.05},{signer:1,kind:'signature',page:1,x:0.1,y:0.8,width:0.5,height:0.07}]
 fields.push(...['work_email','employee_number','start_date','department','location'].map((kind,i)=>({signer:0,kind,page:2,x:0.1,y:0.1+i*0.12,width:0.8,height:0.08})))
 const t=await api('signature.template',{source:source.versionId,title:'Offer letter',category:category.id,signers:['employee','hr'],fields})
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
 assert.equal((await h.raw('/app/signature-payloads/'+boundPayload.id+'.pdf',{cookie:s.managera.cookie})).status,404,'Manager status access grants no exact signing payload')
 assert.equal(createHash('sha256').update(Buffer.from(await exactPayload.arrayBuffer())).digest('hex'),boundPayload.sha256)
 await as(s.payroll.cookie,'signature-requests/'+id,undefined,404)
 assert.deepEqual(await as(s.payroll.cookie,'signature-requests'),[])
 await act(s.hr.cookie,'sign',{consent:true,name:'HR signer'},403)
 await act(s.employee.cookie,'sign',{consent:false,name:'Employee signer'},400)
 const stale=await detail()
 await act(s.employee.cookie,'view')
 await as(s.employee.cookie,'signature.act',{request:id,revision:stale.revision,digest:stale.digest,action:'sign',consent:true},409)
 const raceRequest=await detail(),raceBound={request:id,revision:raceRequest.revision,digest:raceRequest.digest}
 const racePayload=await as(s.employee.cookie,'signature.prepare',{...raceBound,name:'Employee signer',initial:'ES',text:'Agreed'})
 const raced=await Promise.all([0,1].map(()=>h.raw('/api/willow/signature.act',{cookie:s.employee.cookie,body:{...raceBound,action:'sign',consent:true,payload:racePayload.id}})))
 assert.deepEqual(raced.map(r=>r.status).sort(),[200,409],'Concurrent redemption of one exact signing consent commits once')
 assert.equal((await detail()).signed.length,1)
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
 assert.equal((await as(s.managerb.cookie,'signature-requests/'+other)).state,'cancelled')
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
 // A real countersigner payload must lose authority when only category access is revoked.
 const custodyReview=await api('signature.preview',{...input,people:[s.employee.person]})
 const custodySend=await api('signature.send',{review:custodyReview.id,digest:custodyReview.digest,approved:true})
 const custodyId=custodySend.requests[0]
 const employeePending=await as(s.employee.cookie,'signature-requests/'+custodyId)
 const employeeBound={request:custodyId,revision:employeePending.revision,digest:employeePending.digest}
 const employeePayload=await as(s.employee.cookie,'signature.prepare',{...employeeBound,name:'synthetic-willow-15230',initial:'SW',text:'Agreed'})
 await as(s.employee.cookie,'signature.act',{...employeeBound,action:'sign',consent:true,payload:employeePayload.id})
 const preservedBefore=await api('signature-requests/'+custodyId)
 const counterBound={request:custodyId,revision:preservedBefore.revision,digest:preservedBefore.digest}
 const counterPayload=await as(s.hr.cookie,'signature.prepare',{...counterBound,name:'synthetic-willow-15231'})
 assert.equal((await h.raw('/app/signature-payloads/'+counterPayload.id+'.pdf',{cookie:s.hr.cookie})).status,200)
 const originalLevels=(await api('levels')).assignments.filter(a=>a.member_id===s.hr.member).map(a=>a.level_id)
 const restrictedReview=await api('level.preview',{kind:'level',name:'synthetic-willow-15232',permissions:['people.manage','people.private','leave.manage']})
 const restricted=await api('level.apply',{review:restrictedReview.id})
 const revoke=await api('level.preview',{kind:'assignment',member:s.hr.member,levels:[restricted.id]})
 await api('level.apply',{review:revoke.id})
 assert.ok((await as(s.hr.cookie,'me')).permissions.includes('people.manage'),'The same live HR session retains employer-wide authority')
 await as(s.hr.cookie,'signature.act',{...counterBound,action:'sign',consent:true,payload:counterPayload.id},404)
 assert.equal((await h.raw('/app/signature-payloads/'+counterPayload.id+'.pdf',{cookie:s.hr.cookie})).status,404,'Category revocation also closes the prepared document door')
 const preservedAfter=await api('signature-requests/'+custodyId)
 for(const key of ['state','revision','digest','signed','sealedVersion','certificate'])assert.deepEqual(preservedAfter[key],preservedBefore[key],'Denied signing preserves '+key)
 assert.equal(preservedAfter.signed.length,1)
 assert.equal(preservedAfter.sealedVersion,null)
 const retained=await h.raw('/app/signatures/'+custodyId+'.pdf',{cookie:owner})
 assert.equal(retained.status,200)
 assert.equal(createHash('sha256').update(Buffer.from(await retained.arrayBuffer())).digest('hex'),preservedBefore.digest,'The employee-signed bytes survive the denied countersignature')
 const restoreCategory=await api('level.preview',{kind:'assignment',member:s.hr.member,levels:originalLevels})
 await api('level.apply',{review:restoreCategory.id})
 await as(s.hr.cookie,'signature.act',{...counterBound,action:'sign',consent:true,payload:counterPayload.id})
 assert.equal((await api('signature-requests/'+custodyId)).state,'signed','Refusal neither consumes the prepared consent nor damages completion after authority is restored')
 const oldReview=await api('signature.preview',{...input,people:[s.employee.person]})
 const oldSend=await api('signature.send',{review:oldReview.id,digest:oldReview.digest,approved:true})
 const oldRequest=await as(s.employee.cookie,'signature-requests/'+oldSend.requests[0])
 await api('signature.act',{request:oldRequest.id,revision:oldRequest.revision,digest:oldRequest.digest,action:'void'})
 const revised=await api('signature.template',{template:t.id,source:source.versionId,title:'Reissued offer',category:category.id,signers:['employee','hr'],fields})
 const revisedTemplate=(await api('signature-templates')).find(x=>x.id===revised.id)
 await api('signature.template.approve',{template:revised.id,digest:revisedTemplate.digest,reviewed:true})
 const changedReview=await api('signature.preview',{...input,template:revised.id,people:[s.employee.person]})
 const changedSend=await api('signature.send',{review:changedReview.id,digest:changedReview.digest,approved:true})
 await as(s.employee.cookie,'signature.act',{request:oldRequest.id,revision:oldRequest.revision,digest:oldRequest.digest,action:'sign',consent:true},409)
 assert.equal((await as(s.employee.cookie,'signature-requests/'+changedSend.requests[0])).state,'sent')
 const location=await api('location.create',{name:'Signature cohort office',timezone:'UTC'})
 const cohortPeople=[],cohortCookies=[],cohortMembers=[],cohortEmails=[]
 for(let i=0;i<5;i++) {
  const person=await join('synthetic-willow-'+(15210+i),{locationId:location.id,legalName:['Avery Wilson','Casey Brown','Drew Martin','Jamie Taylor','Robin Davis'][i]})
  cohortMembers.push((await api('access.give',{person:person.person})).id)
  cohortEmails.push('synthetic-willow-'+(15210+i)+'@example.com')
  cohortCookies.push(await h.signIn(cohortEmails[i],{requested:true}))
  cohortPeople.push(person.person)
 }
 const policyPdf=await PDFDocument.create(),policyFont=await policyPdf.embedFont(StandardFonts.Helvetica)
 policyPdf.addPage([612,792]).drawText('Workplace conduct and confidentiality policy',{x:40,y:730,font:policyFont,size:14})
 const policySource=await api('company.file',{folder:folder.id,title:'Workplace policy',file:file('workplace-policy.pdf',await policyPdf.save())})
 const policyTemplate=await api('signature.template',{source:policySource.versionId,title:'Workplace policy',category:category.id,signers:['employee','hr'],fields:fields.filter(f=>f.page===1&&!['job_title','compensation'].includes(f.kind))})
 const policyDefinition=(await api('signature-templates')).find(t=>t.id===policyTemplate.id)
 await api('signature.template.approve',{template:policyTemplate.id,digest:policyDefinition.digest,reviewed:true})
 // Reviewed email delivery, future enrollment and the FLOW-002 cadence let the scheduler continue this cohort.
 await api('connections.notices',{enabled:true})
 await api('work.policy',{offsets:'0',quietStart:0,quietEnd:0,defaultDays:0})
 const cohortReview=await api('signature.preview',{template:policyTemplate.id,cohortKind:'location',cohortValue:location.id,hr:s.hr.member,expiresAt:Date.now()+7*86400000,notify:true,futureJoiners:true})
 assert.deepEqual(cohortReview.recipients.map(p=>p.id).sort(),[...cohortPeople].sort())
 const locationSend=await api('signature.send',{review:cohortReview.id,digest:cohortReview.digest,approved:true})
 assert.equal(locationSend.requests.length,5)
 const nonmatching=await as(s.managera.cookie,'signature-requests')
 assert.ok(!nonmatching.some(r=>locationSend.requests.includes(r.id)))
 const cohortSealed=[]
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
  cohortSealed.push(record.sealedVersion)
 }
 // Advancing the scheduler reminds each of the three pending signers exactly once; a matching joiner is enrolled and reminded too.
 const requestOf=new Map((await api('signature-requests')).filter(r=>r.cohort===locationSend.id).map(r=>[r.person,r.id]))
 const reminderMail=email=>h.businessMail().filter(m=>m.subject==='Willow: assigned work needs attention'&&m.personalizations.some(p=>p.to.some(t=>t.email===email)))
 const reminders=async(pending,signed)=>{
  const work=await api('work'),deliveries=person=>work.items.filter(w=>w.source.startsWith('signature:'+requestOf.get(person)+':')).flatMap(w=>w.deliveries)
  for(const [person,member,email] of pending) {
   assert.deepEqual(deliveries(person).map(d=>[d.recipient,d.status]),[[member,'accepted']],'Each pending signer has exactly one accepted reminder')
   assert.equal(reminderMail(email).length,1,'The mail edge carries one reminder to each pending signer')
  }
  for(const [person,,email] of signed) {
   assert.deepEqual(deliveries(person),[],'A completed signer is never reminded')
   assert.equal(reminderMail(email).length,0)
  }
 }
 const recipients=cohortPeople.map((person,i)=>[person,cohortMembers[i],cohortEmails[i]])
 await api('work.run',{})
 await api('work.run',{})
 await reminders(recipients.slice(2),recipients.slice(0,2))
 const joiner=await join('synthetic-willow-15215',{locationId:location.id,legalName:'Morgan Price',startDate:day(0)})
 const joinerRecipient=[joiner.person,(await api('access.give',{person:joiner.person})).id,'synthetic-willow-15215@example.com']
 const joinerCookie=await h.signIn(joinerRecipient[2],{requested:true})
 await api('work.run',{})
 await api('work.run',{})
 const joined=(await as(joinerCookie,'signature-requests')).find(r=>r.cohort===locationSend.id)
 assert.ok(joined,'A new joiner at the location sees their own request')
 requestOf.set(joiner.person,joined.id)
 await reminders([...recipients.slice(2),joinerRecipient],recipients.slice(0,2))
 await api('signature.cancel',{cohort:locationSend.id})
 const cohortStates=(await api('signature-requests')).filter(r=>locationSend.requests.includes(r.id))
 assert.equal(cohortStates.filter(r=>r.state==='cancelled').length,3)
 assert.equal(cohortStates.filter(r=>r.state==='signed').length,2)
 assert.equal((await as(joinerCookie,'signature-requests/'+joined.id)).state,'cancelled')
 const outreach=()=>h.businessMail().filter(m=>m.personalizations.some(p=>p.to.some(t=>[...cohortEmails,joinerRecipient[2]].includes(t.email)))).length
 const reached=outreach()
 await api('work.run',{})
 assert.equal(outreach(),reached,'Later ticks send nothing to the cancelled cohort')
 assert.ok(!(await api('work')).items.some(w=>[...requestOf.values()].some(id=>w.source.startsWith('signature:'+id+':'))),'Cancellation removes every remaining reminder')
 for(const [i,version] of cohortSealed.entries())assert.equal((await h.raw('/app/files/document/'+version+'?download=1',{cookie:cohortCookies[i]})).status,200,'Signed copies remain after cancellation')
 await api('connections.notices',{enabled:false})
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
 const nativeAudit=await api('audit')
 assert.ok(nativeAudit.some(e=>e.action==='signature.attempt.read'&&JSON.parse(e.detail).outcome==='denied'))
 assert.ok(!nativeAudit.filter(e=>e.action.startsWith('signature.')).some(e=>['Employee signer','HR signer','Session bound signer','Agreed'].some(value=>e.detail.includes(value))))
 console.log('Native signing: PASS — consent, ordered signatures, sealed bytes, certificate, scoped cohort status, cancellation and old request refusal')
 return [...cohortPeople,joiner.person]
}
async function signingBrowser(h,owner,s,id,oldId,newId,expiredId) {
 if(process.env.WILLOW_SIGN_BROWSER!=='1')return
 const destination=process.env.WILLOW_EVIDENCE_DIR;assert.ok(destination);await mkdir(destination,{recursive:true})
 const browser=await launchSigningBrowser()
 const contexts=[]
 const enter=async cookie=>{const c=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(c);await c.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})));return c.newPage()}
 const capture=async(page,path,name)=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal((await page.goto(h.origin+path)).status(),200);await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' fits '+width);await prepareSigningCapture(page);await page.screenshot({path:`${destination}/SIGN-${name}-${width}.png`,fullPage:true});const bell=page.getByRole('link',{name:'Open your task list'});await bell.focus();await page.getByRole('tooltip').waitFor({state:'visible'});await bell.hover();await page.waitForTimeout(350);assert.ok(await page.getByRole('tooltip').isVisible());await prepareSigningCapture(page);await page.screenshot({path:`${destination}/SIGN-${name}-tooltip-${width}.png`,fullPage:true})}}
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
   for(const width of [1440,390]){await admin.setViewportSize({width,height:1000});await prepareSigningCapture(admin);await admin.screenshot({path:`${destination}/SIGN-template-editor-${title.replaceAll(' ','-')}-${width}.png`,fullPage:true})}
   await editor.getByRole('button',{name:'Save template revision'}).click();assert.ok(!new URL(admin.url()).searchParams.has('error'))
   const approve=admin.locator('form[action="/app/do/signature.template.approve"]').last()
   await approve.locator('input[name="reviewed"]').check();await approve.getByRole('button',{name:'Approve exact template'}).click();assert.ok(!new URL(admin.url()).searchParams.has('error'))
   await admin.getByText('Create a template',{exact:true}).click()
  }
  await capture(admin,'/app/signatures','requests')
  const f=admin.locator('form[action="/app/do/signature.preview"]');await f.locator(`input[value="${s.employee.person}"]`).check();await f.getByLabel('HR countersigner').selectOption(s.hr.member);await f.getByRole('button',{name:'Review recipients'}).click()
  assert.ok(!new URL(admin.url()).searchParams.has('error'))
  for(const width of [1440,390]){await admin.setViewportSize({width,height:1000});await prepareSigningCapture(admin);await admin.screenshot({path:`${destination}/SIGN-review-${width}.png`,fullPage:true})}
  await capture(employee,'/app/signatures/'+id,'employee-consent')
  await employee.getByLabel('Signature name',{exact:true}).fill('Maya Chen');await employee.getByLabel('Initials',{exact:true}).fill('EF');await employee.getByLabel('Text field',{exact:true}).fill('Agreed');await employee.getByRole('button',{name:'Review signing document'}).click();assert.ok(!new URL(employee.url()).searchParams.has('error'));for(const width of [1440,390]){await employee.setViewportSize({width,height:1000});await prepareSigningCapture(employee);await employee.screenshot({path:`${destination}/SIGN-payload-review-${width}.png`,fullPage:true})}await employee.locator('input[name="consent"]').check();await employee.getByRole('button',{name:'Sign exact document'}).click();assert.ok(!new URL(employee.url()).searchParams.has('error'))
  await capture(hr,'/app/signatures/'+id,'hr-countersign')
  await hr.getByLabel('Signature name',{exact:true}).fill('Riley Morgan');await hr.getByRole('button',{name:'Review signing document'}).click();assert.ok(!new URL(hr.url()).searchParams.has('error'));await hr.locator('input[name="consent"]').check();await hr.getByRole('button',{name:'Sign exact document'}).click();assert.ok(!new URL(hr.url()).searchParams.has('error'))
  await capture(employee,'/app/signatures/'+id,'sealed-certificate');await capture(manager,'/app/signatures','manager-report')
 } finally {for(const c of contexts)await c.close();await browser.close()}
}

async function phoneCohortSigner(h,employeeCookie,hrCookie,id) {
 const browser=await launchSigningBrowser()
 try {
  for(const [cookie,width,name] of [[employeeCookie,390,'Phone cohort signer'],[hrCookie,1440,'Named cohort HR']]) {
   const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}})
   await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})))
   const page=await context.newPage();assert.equal((await page.goto(h.origin+'/app/signatures/'+id)).status(),200)
   await page.getByLabel('Signature name',{exact:true}).fill(name)
   if(width===390){await page.getByLabel('Initials',{exact:true}).fill('PC');await page.getByLabel('Text field',{exact:true}).fill('Agreed')}
   await page.getByRole('button',{name:'Review signing document'}).click();assert.ok(!new URL(page.url()).searchParams.has('error'))
   await page.evaluate(()=>document.fonts.ready)
   if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)) {
    await prepareSigningCapture(page);await page.screenshot({path:process.env.WILLOW_EVIDENCE_DIR+'/SIGN-overflow-'+width+'.png',fullPage:true})
    console.log('Signing overflow:',await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(-15)))
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   await prepareSigningCapture(page);await page.screenshot({path:process.env.WILLOW_EVIDENCE_DIR+'/SIGN-location-payload-'+width+'.png',fullPage:true})
   await page.locator('input[name="consent"]').check();await page.getByRole('button',{name:'Sign exact document'}).click()
   assert.ok(!new URL(page.url()).searchParams.has('error'))
   await prepareSigningCapture(page);await page.screenshot({path:process.env.WILLOW_EVIDENCE_DIR+'/SIGN-location-signed-'+width+'.png',fullPage:true});await context.close()
  }
 } finally {await browser.close()}
}
