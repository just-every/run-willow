import { launchSigningBrowser,prepareSigningCapture } from './sign-browser.mjs'
// SIGN-002 inherits the saved-report public doors, dated sources and current rights.
import assert from 'node:assert/strict'
import { file } from './harness.mjs'
import { PDFDocument,StandardFonts } from 'pdf-lib'
import { readZip } from './export-reader.mjs'
import { today,day } from './regression-fixture.mjs'

export async function signatureReportingProof(h,owner,s) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const as=(cookie,path,body,status)=>h.api(path,cookie,body,status)
 const folder=await api('company.folder',{name:'synthetic-willow-15300',audience:{kind:'everyone',id:null}})
 const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica)
 document.addPage([612,792]).drawText('synthetic-willow-15302',{x:40,y:730,font,size:14})
 const source=await api('company.file',{folder:folder.id,title:'synthetic-willow-15301',file:file('policy.pdf',await document.save())})
 const category=await api('category.create',{name:'synthetic-willow-15303',subjectReads:true,managerReads:true})
 const fields=[{signer:0,kind:'signature',page:1,x:.1,y:.6,width:.3,height:.1},{signer:1,kind:'signature',page:1,x:.5,y:.6,width:.3,height:.1}]
 const template=await api('signature.template',{source:source.versionId,title:'synthetic-willow-15304',category:category.id,signers:['employee','hr'],fields})
 const configured=(await api('signature-templates')).find(t=>t.id===template.id)
 await api('signature.template.approve',{template:template.id,digest:configured.digest,reviewed:true})
 const review=await api('signature.preview',{template:template.id,people:[s.employee.person,s.managerb.person],hr:s.hr.member,expiresAt:Date.now()+7*86400000})
 const cohort=await api('signature.send',{review:review.id,digest:review.digest,approved:true})
 const columns=['name','signatureRequests','signaturePending','signatureViewed','signatureSigned','signatureCancelled','signatureUnknown']
 const issuedRecord=(await api('signature-requests')).find(r=>r.id===cohort.requests[0])
 const recordDay=new Date(issuedRecord.createdAt).toISOString().slice(0,10),recordDate=new Date(issuedRecord.expiresAt).toISOString().slice(0,10)
 const pastDate=new Date(issuedRecord.createdAt-2*86400000).toISOString().slice(0,10),beforeRange=new Date(issuedRecord.createdAt-86400000).toISOString().slice(0,10)
 const definition={name:'synthetic-willow-15305',columns,asOf:recordDate,from:beforeRange,to:recordDate,status:'all',signatureTemplate:template.id,signatureCohort:cohort.id}
 await api('report.save',{definition:{...definition,signatureState:'unobserved'}},400)
 const saved=await api('report.save',{definition})
 const result=async(cookie=owner,id=saved.id)=>(await as(cookie,'custom-reports/'+id)).result
 let r=await result()
 assert.equal(r.signatureTotals.signatureRequests,2)
 assert.equal(r.signatureTotals.signaturePending,2)
 assert.equal(r.signatureTotals.signaturePending,r.rows.reduce((n,row)=>n+Number(row.cells.signaturePending??0),0))
 assert.deepEqual(r.signatureTotals.sources.map(x=>x.id).sort(),[...cohort.requests].sort())
 assert.ok(r.signatureCoverage.observedThrough&&r.sourceFreshness.recordedThrough)
 const employeeRequest=r.signatureTotals.sources.find(x=>x.personId===s.employee.person).id
 const act=async(cookie,action,extra={})=>{
  const request=await as(cookie,'signature-requests/'+employeeRequest)
  const base={request:employeeRequest,revision:request.revision,digest:request.digest}
  if(action==='sign') {
   const payload=await as(cookie,'signature.prepare',{...base,name:extra.name})
   return as(cookie,'signature.act',{...base,action,consent:true,payload:payload.id})
  }
  return as(cookie,'signature.act',{...base,action,...extra})
 }
 await act(s.employee.cookie,'sign',{consent:true,name:'synthetic-willow-15306'})
 r=await result();assert.equal(r.signatureTotals.signaturePending,2);assert.equal(r.signatureTotals.signatureViewed,1);assert.equal(r.signatureTotals.signatureSigned,0)
 await act(s.hr.cookie,'sign',{consent:true,name:'synthetic-willow-15307'})
 await api('signature.cancel',{cohort:cohort.id})
 r=await result()
 assert.equal(r.signatureTotals.signatureSigned,1);assert.equal(r.signatureTotals.signatureCancelled,1);assert.equal(r.signatureTotals.signaturePending,0)
 assert.equal(r.signatureTotals.signatureUnknown,0)
 for(const record of r.signatureTotals.sources) {
  assert.equal((await h.raw(record.source,{cookie:owner})).status,200)
  const dated=await api('signature-requests/'+record.id+'?asOf='+recordDate)
  assert.equal(dated.state,record.state,'Saved metrics reconcile with the dated public signing source')
  assert.ok(record.closedAt)
  for(const forbidden of ['certificate','sealedVersion','digest','fields','values','signers','rendered_sha256'])assert.ok(!Object.hasOwn(record,forbidden))
 }
 assert.ok(r.signatureTotals.sources.find(x=>x.id===employeeRequest).completedAt)
 const past=await api('report.save',{definition:{...definition,name:'synthetic-willow-15308',asOf:pastDate,from:pastDate,to:recordDate}})
 assert.equal((await result(owner,past.id)).signatureTotals.signatureRequests,0,'A past date excludes requests issued later')
 const filtered=await api('report.save',{definition:{...definition,name:'synthetic-willow-15309',signatureState:'signed'}})
 assert.equal((await result(owner,filtered.id)).signatureTotals.signatureRequests,1)
 const excluded=await api('report.save',{definition:{...definition,name:'synthetic-willow-15310',from:pastDate,to:beforeRange}})
 assert.equal((await result(owner,excluded.id)).signatureTotals.signatureRequests,0,'Issue dates use the inclusive selected range')
 const managerSaved=await as(s.managera.cookie,'report.save',{definition:{...definition,name:'synthetic-willow-15311'}})
 const manager=await result(s.managera.cookie,managerSaved.id)
 assert.deepEqual(manager.signatureTotals.sources.map(x=>x.id),[employeeRequest])
 assert.equal(manager.signatureTotals.signatureSigned,1)
 const privateCategory=await api('category.create',{name:'synthetic-willow-15312',subjectReads:true,managerReads:false})
 const hiddenTemplate=await api('signature.template',{source:source.versionId,title:'synthetic-willow-15313',category:privateCategory.id,signers:['employee','hr'],fields})
 const hidden=(await api('signature-templates')).find(t=>t.id===hiddenTemplate.id)
 await api('signature.template.approve',{template:hidden.id,digest:hidden.digest,reviewed:true})
 const hiddenReview=await api('signature.preview',{template:hidden.id,people:[s.employee.person],hr:s.hr.member,expiresAt:Date.now()+7*86400000})
 const hiddenCohort=await api('signature.send',{review:hiddenReview.id,digest:hiddenReview.digest,approved:true})
 const categoryReport=await as(s.managera.cookie,'report.save',{definition:{...definition,name:'synthetic-willow-15314',signatureTemplate:'',signatureCohort:''}})
 assert.ok(!(await result(s.managera.cookie,categoryReport.id)).signatureTotals.sources.some(x=>hiddenCohort.requests.includes(x.id)))
 // File formats consume the same projection and include the same reconcilable source rows.
 for(const [cookie,id,expected,forbidden] of [[owner,saved.id,cohort.requests,[]],[s.managera.cookie,managerSaved.id,[employeeRequest],cohort.requests.filter(x=>x!==employeeRequest)]]) {
  for(const format of ['csv','xlsx']) {
   const response=await h.raw(`/app/reports/custom/${id}.${format}`,{cookie});assert.equal(response.status,200)
   const bytes=Buffer.from(await response.arrayBuffer()),text=format==='csv'?bytes.toString():[...readZip(bytes).values()].map(x=>x.toString()).join('')
   for(const value of expected)assert.ok(text.includes(value))
   for(const value of [...forbidden,'synthetic-willow-15306','synthetic-willow-15307'])assert.ok(!text.includes(value))
   assert.ok(text.includes('Signature coverage'))
  }
 }
 const previousLevels=(await api('levels')).assignments.filter(row=>row.member_id===s.payroll.member).map(row=>row.level_id)
 const level=await api('level.apply',{review:(await api('level.preview',{kind:'level',name:'synthetic-willow-15315',permissions:[],reports:[saved.id]})).id})
 await api('level.apply',{review:(await api('level.preview',{kind:'assignment',member:s.payroll.member,levels:[...previousLevels,level.id]})).id})
 s.payroll.cookie=await h.signIn('payroll@example.com')
 const selected=await result(s.payroll.cookie)
 assert.deepEqual(selected.signatureTotals.sources,[])
 assert.ok(selected.rows.find(x=>x.personId===s.employee.person).withheld.includes('signatureSigned'))
 assert.equal((await h.raw('/app/signatures/'+employeeRequest+'.pdf',{cookie:s.payroll.cookie})).status,404)
 await api('report.schedule',{report:saved.id,version:saved.versionId,firstDate:recordDay,cadenceDays:1,recipients:[s.payroll.member],enabled:true})
 const scheduled=(await api('custom-reports/'+saved.id)).schedule
 assert.ok(scheduled.schedule.recipients.includes(s.payroll.member),'Signature definitions reuse the existing reviewed safe-link schedule')
 await api('connections.notices',{enabled:true})
 const tick=async instant=>{const response=await h.raw('/cdn-cgi/local/scheduled?time='+instant+'&cron='+encodeURIComponent('*/15 * * * *')+'&format=json');assert.equal(response.status,200)}
 const scheduledInstant=Date.parse(recordDay+'T12:00:00Z')
 const beforeMail=h.businessMail().filter(m=>m.subject==='Willow: scheduled report ready').length
 await tick(scheduledInstant)
 let outcomes=(await api('custom-reports/'+saved.id)).schedule.deliveries
 assert.equal(outcomes.length,1);assert.equal(outcomes[0].status,'accepted')
 const message=h.businessMail().filter(m=>m.subject==='Willow: scheduled report ready').at(-1)
 assert.ok(message.content.some(c=>c.value.includes(h.origin+'/app/reports/custom/'+saved.id)))
 for(const value of ['synthetic-willow-15306','synthetic-willow-15307',employeeRequest])assert.ok(!JSON.stringify(message).includes(value),'Scheduled links contain no signing values or request metadata')
 await tick(scheduledInstant)
 assert.equal(h.businessMail().filter(m=>m.subject==='Willow: scheduled report ready').length,beforeMail+1)

 await api('level.apply',{review:(await api('level.preview',{kind:'level',level:level.id,name:'synthetic-willow-15315',permissions:[],reports:[]})).id})
 s.payroll.cookie=await h.signIn('payroll@example.com')
 await as(s.payroll.cookie,'custom-reports/'+saved.id,undefined,403)
 await tick(scheduledInstant+86400000)
 outcomes=(await api('custom-reports/'+saved.id)).schedule.deliveries
 assert.equal(outcomes.length,2);assert.equal(outcomes[0].status,'refused')
 assert.equal(h.businessMail().filter(m=>m.subject==='Willow: scheduled report ready').length,beforeMail+1,'Revoked report selection blocks the next scheduled link')
 await api('connections.notices',{enabled:false})
 await api('report.schedule',{report:saved.id,version:saved.versionId,firstDate:recordDay,cadenceDays:1,recipients:[s.payroll.member],enabled:true},403)
 await reportScreens(h,owner,s.managera.cookie,saved.id,managerSaved.id)
 console.log('Saved signature reports: PASS — dated authorized sources, reconciled counts, filters, CSV and XLSX, selected-report isolation and reviewed schedule')
}

async function reportScreens(h,owner,manager,report,managerReport) {
 if(process.env.WILLOW_SIGN_BROWSER!=='1')return
 const {mkdir}=await import('node:fs/promises');const destination=process.env.WILLOW_EVIDENCE_DIR;assert.ok(destination);await mkdir(destination,{recursive:true})
 const browser=await launchSigningBrowser()
 try {for(const [cookie,id,role] of [[owner,report,'HR'],[manager,managerReport,'manager']]) {
  const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})))
  const page=await context.newPage()
  for(const width of [1440,390])for(const [path,label] of [['/app/reports/custom','definitions'],['/app/reports/custom/'+id,'report']]) {
   await page.setViewportSize({width,height:1000});assert.equal((await page.goto(h.origin+path)).status(),200);await page.evaluate(()=>document.fonts.ready)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await prepareSigningCapture(page);await page.screenshot({path:`${destination}/SIGN-${role}-${label}-${width}.png`,fullPage:true})
   const bell=page.getByRole('link',{name:'Open your task list'});await bell.focus();await page.getByRole('tooltip').waitFor({state:'visible'});await bell.hover();await page.waitForTimeout(350);assert.ok(await page.getByRole('tooltip').isVisible())
  }
  await context.close()
 }} finally {await browser.close()}
}
