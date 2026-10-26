import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { file } from './harness.mjs'

export async function signingRestoreSource(h,owner,s) {
 const api=(path,body)=>h.api(path,owner,body)
 const folder=await api('company.folder',{name:'synthetic-willow-15500',audience:{kind:'everyone',id:null}})
 const pdf=await PDFDocument.create();pdf.addPage([612,792])
 const source=await api('company.file',{folder:folder.id,title:'synthetic-willow-15501',file:file('agreement.pdf',await pdf.save())})
 const category=await api('category.create',{name:'synthetic-willow-15502',subjectReads:true})
 const template=await api('signature.template',{source:source.versionId,title:'Restore employment agreement',category:category.id,signers:['employee','hr'],fields:[0,1].map(signer=>({signer,kind:'signature',page:1,x:.1,y:.4+signer*.2,width:.5,height:.1}))})
 const definition=(await api('signature-templates')).find(t=>t.id===template.id)
 await api('signature.template.approve',{template:template.id,digest:definition.digest,reviewed:true})
 const hr=(await api('me')).id
 const review=await api('signature.preview',{template:template.id,cohortKind:'everyone',hr,expiryDays:7,futureJoiners:true,notify:true})
 const issued=await api('signature.send',{review:review.id,digest:review.digest,approved:true})
 const requests=await api('signature-requests'),completed=requests.find(r=>r.cohort===issued.id&&r.person===s.employee.person),pending=requests.find(r=>r.cohort===issued.id&&r.person===s.managerb.person)
 const prepare=async(cookie,id,name)=>{const r=await h.api('signature-requests/'+id,cookie);return {r,payload:await h.api('signature.prepare',cookie,{request:r.id,revision:r.revision,digest:r.digest,name})}}
 for(const [cookie,name] of [[s.employee.cookie,'Maya Chen'],[owner,'Employer representative']]) {
  const {r,payload}=await prepare(cookie,completed.id,name)
  await h.api('signature.act',cookie,{request:r.id,revision:r.revision,digest:r.digest,action:'sign',consent:true,payload:payload.id})
 }
 const {r,payload}=await prepare(s.managerb.cookie,pending.id,'Pending signature')
 const record=await h.api('signature-requests/'+completed.id,s.employee.cookie)
 assert.equal(record.state,'signed')
 const unusedReview=await api('signature.preview',{template:template.id,people:[s.employee.person],hr,expiryDays:7})
 return {unusedReview,cohort:issued.id,completed:record,pending:r,payload:payload.id,count:issued.requests.length}
}

export async function signingRestoreProof(h,owner,employeeCookie,signing) {
 await h.api('signature.send',owner,{review:signing.unusedReview.id,digest:signing.unusedReview.digest,approved:true},409)
 const restored=await h.api('signature-requests/'+signing.completed.id,employeeCookie)
 assert.equal(restored.state,'signed');assert.equal(restored.certificate.sha256,signing.completed.certificate.sha256)
 assert.deepEqual(restored.certificate,signing.completed.certificate)
 const response=await h.raw('/app/signatures/'+restored.id+'.pdf',{cookie:employeeCookie});assert.equal(response.status,200)
 const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),restored.certificate.sha256)
 const pending=await h.api('signature-requests/'+signing.pending.id,owner)
 assert.equal(pending.state,'voided');assert.equal(pending.canSign,false)
 await h.api('signature.act',owner,{request:pending.id,revision:pending.revision,digest:pending.digest,action:'sign',consent:true,payload:signing.payload},409)
 assert.equal((await h.raw('/app/signature-payloads/'+signing.payload+'.pdf',{cookie:owner})).status,404)
 await h.api('work.run',owner,{})
 assert.ok(!(await h.api('work',owner)).items.some(w=>w.source.startsWith('signature:'+pending.id+':')))
 console.log('Signing restore: preserved sealed bytes and consent history; unsigned authority, payload reviews, enrollment and outbound remain stopped')
}
