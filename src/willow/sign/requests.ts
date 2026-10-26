import { signingMember } from './cohort-access'
import { employerZone } from '../actor'
import { isDate } from '../dates'
import { datedSignatureSources } from '../reporting/signatures'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { Bindings } from '../../auth.server'
import { can, requirePermission, type Actor } from '../actor'
import { readsCategory } from '../access'
import { all, auditRead, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from '../core'
import { serve, store } from '../files'
import type { Input } from '../input'
import { signatureTemplates } from './templates'
import { selectedPeriods } from '../employment'
import { directory,personView } from '../profile'

import { CONSENT, session, authority, pending, requestState, SEQUENCE, rowFor, readable, bytes, draw } from './custody'
export { CONSENT } from './custody'
import { consumePayload } from './payloads'

import { mergeValues } from './rendering'
import { cohortPolicy,cohortIssueStatements,cohortCancelStatements } from './cohorts'
import { dispatchCohortNotices } from './delivery'
import { eligibleSource } from './source'
export { enrollSignatureRecipient } from './recipients'

export async function previewSignatures(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 input.only(['template','people','cohortKind','cohortValue','cohortSelection','hr','expiresAt','expiryDays','futureJoiners','notify','returnTo'])
 const template=(await signatureTemplates(env,actor)).find(t=>t.id===input.text('template',{max:100}))
 insist(template?.approvedAt&&template.current,'signature_approved_template_required',409)
 const roles=template.signers
 insist(roles[0]==='employee'&&(roles.length===1||(roles.length===2&&roles[1]==='hr')),'signature_order_unsupported')
 const visible=await directory(env,actor)
 const selection=input.text('cohortSelection',{optional:true,max:150}).split(':')
 const cohortKind=selection[0]||input.text('cohortKind',{optional:true})||'named',cohortValue=selection[1]||input.text('cohortValue',{optional:true,max:100})
 insist(['named','everyone','location','department','employment_type','access_level'].includes(cohortKind),'invalid_signature_cohort')
 const periods=cohortKind==='employment_type'?await selectedPeriods(env,actor.today):new Map()
 let people=[...new Set(input.list('people'))]
 if(cohortKind!=='named') {
  insist(people.length===0,'signature_cohort_ambiguous')
  let selected=visible.filter(p=>p.status==='active')
  if(cohortKind==='location')selected=selected.filter(p=>p.location?.id===cohortValue)
  if(cohortKind==='department')selected=selected.filter(p=>p.department?.id===cohortValue)
  if(cohortKind==='employment_type')selected=selected.filter(p=>periods.get(p.id)?.employment_type===cohortValue)
  if(cohortKind==='access_level') {
   const members=await all(env,"SELECT m.person_id FROM wl_member_levels l JOIN wl_members m ON m.id=l.member_id WHERE l.level_id=? AND m.status='active'",cohortValue)
   selected=selected.filter(p=>members.some(m=>m.person_id===p.id))
  }
  people=selected.map(p=>p.id)
 }
 insist(people.length>0&&people.length<=200,'signature_recipients_required')
 const hr=input.text('hr',{optional:roles.length===1,max:100})||actor.id
 const counter=await one(env,`SELECT m.id,m.name FROM wl_members m WHERE m.id=? AND m.status='active' AND (EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission='people.manage') OR EXISTS(SELECT 1 FROM oa_operators o WHERE lower(o.email)=m.email AND o.role='owner' AND o.status='active'))`,hr)
 insist(counter,'signature_hr_required')
 const counterActor=await signingMember(env,hr)
 insist(counterActor&&can(counterActor,'people.manage'),'signature_hr_required',403)
 const expiresAt=input.has('expiryDays')?now()+input.integer('expiryDays',{min:1,max:90})!*86400000:input.integer('expiresAt',{min:now()+60_000,max:now()+90*86400000})!
 const source=await one(env,'SELECT * FROM wl_company_file_versions WHERE id=?',template.sourceVersion)
 insist(source,'signature_source_missing',409)
 const original=await bytes(env,source.sha256,source.size)
 const recipients=[]
 const files:D1PreparedStatement[]=[]
 for(const id of people) {
  const person=visible.find(p=>p.id===id)
  insist(await eligibleSource(env,actor,template.sourceVersion,id),'signature_source_target_denied',403)
  const member=await one(env,"SELECT id FROM wl_members WHERE person_id=? AND status='active'",id)
  insist(person&&person.status==='active'&&member,'signature_active_recipient_required')
  const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',template.category)
  insist(category&&category.subject_reads&&readsCategory(actor,id,category)&&readsCategory(counterActor,id,category),'signature_category_denied',403)
  insist(member.id!==hr||roles.length===1,'signature_distinct_signers_required')
  const merged=await mergeValues(env,actor,id,template.fields)
  let rendered={sha256:source.sha256,size:source.size}
  if(Object.keys(merged).length) {
   const pdf=await PDFDocument.load(original).catch(()=>null)
   insist(pdf&&pdf.getPageCount()>0,'signature_pdf_invalid')
   const font=await pdf.embedFont(StandardFonts.Helvetica)
   for(const field of template.fields.filter((f:Row)=>Object.hasOwn(merged,f.kind))) {
    insist(field.page<=pdf.getPageCount(),'signature_page_missing')
    draw(pdf.getPage(field.page-1),font,merged[field.kind],field)
   }
   rendered=await store(env,{filename:'reviewed.pdf',bytes:await pdf.save()})
   files.push(stmt(env,'INSERT INTO wl_sign_files(id,request_id,person_id,sha256,size,created_at) VALUES(?,NULL,?,?,?,?)',newId(),id,rendered.sha256,rendered.size,now()))
  }
  recipients.push({id,name:person.name,member:member.id,merged,sha256:rendered.sha256,size:rendered.size})
 }
 const categoryName=(await one(env,'SELECT name FROM wl_doc_categories WHERE id=?',template.category))!.name
 let cohortLabel=cohortKind==='named'?'Named people':cohortKind.replaceAll('_',' ')
 if(['location','department','access_level'].includes(cohortKind))cohortLabel+=': '+(await one(env,'SELECT name FROM '+({location:'wl_locations',department:'wl_departments',access_level:'wl_levels'} as Record<string,string>)[cohortKind]+' WHERE id=?',cohortValue))?.name
 if(cohortKind==='employment_type')cohortLabel+=': '+cohortValue.replaceAll('_',' ')
 const snapshot={categoryName,hrName:counter.name,cohortLabel,templateVersion:template.version,...cohortPolicy(input,cohortKind),expiryDuration:expiresAt-now(),cohortKind,cohortValue,template:template.id,templateDigest:template.digest,source:template.sourceVersion,sourceSha256:template.sourceSha256,category:template.category,title:template.title,hr,expiresAt,recipients}
 const encoded=JSON.stringify(snapshot),digest=await sha256Hex(encoded),id=newId()
 await commit(env,[session(env,actor),authority(env,actor),...files,stmt(env,'INSERT INTO wl_sign_reviews(id,actor,template_id,snapshot,digest,created_at) VALUES(?,?,?,?,?,?)',id,actor.id,template.id,encoded,digest,now())],{actor:actor.id,action:'signature.preview',subject:id,detail:{template:template.id,count:people.length}})
 return {id,digest,...snapshot}
}

export async function sendSignatures(env:Bindings,actor:Actor,input:Input, workflowStatements:D1PreparedStatement[]=[] ) {
 requirePermission(actor,'people.manage')
 input.only(['review','digest','approved','returnTo'])
 insist(input.flag('approved'),'signature_review_required')
 const review=await one(env,'SELECT * FROM wl_sign_reviews WHERE id=?',input.text('review',{max:100}))
 insist(review&&review.actor===actor.id&&!review.used_at&&review.created_at>now()-30*60000,'signature_review_expired',409)
 insist(input.text('digest',{max:64})===review.digest,'signature_review_changed',409)
 const sequence=(await one(env,'SELECT '+SEQUENCE+' AS n'))!.n
 const snapshot=JSON.parse(review.snapshot)
 insist(snapshot.expiresAt>now(),'signature_expiry_passed',409)
 const template=(await signatureTemplates(env,actor)).find(t=>t.id===snapshot.template)
 insist(template?.current&&template.approvedAt&&template.digest===snapshot.templateDigest,'signature_template_changed',409)
 const source=await one(env,'SELECT * FROM wl_company_file_versions WHERE id=?',snapshot.source)
 insist(source,'signature_source_missing',409)
 const original=await bytes(env,source.sha256,source.size)
 const sourcePdf=await PDFDocument.load(original).catch(()=>null)
 insist(sourcePdf&&sourcePdf.getPageCount()>0,'signature_pdf_invalid')
 insist(template.fields.every((f:Row)=>f.page<=sourcePdf.getPageCount()),'signature_page_missing')
 const statements=[session(env,actor),authority(env,actor),guard(env,'signature_inputs_changed',SEQUENCE+'=?',sequence),guard(env,'signature_review_used','EXISTS(SELECT 1 FROM wl_sign_reviews WHERE id=? AND used_at IS NULL)',review.id),
 guard(env,'signature_template_changed','NOT EXISTS(SELECT 1 FROM wl_sign_templates WHERE family=? AND version>?)',template.family,template.version),
 stmt(env,'UPDATE wl_sign_reviews SET used_at=? WHERE id=?',now(),review.id)]
 const counterActor=await signingMember(env,snapshot.hr)
 insist(counterActor&&can(counterActor,'people.manage'),'signature_hr_required',403)
 const visible=await directory(env,actor)
 const periods=snapshot.cohortKind==='employment_type'?await selectedPeriods(env,actor.today):new Map()
 const requests=[]
 for(const recipient of snapshot.recipients) {
  const current=visible.find(p=>p.id===recipient.id&&p.status==='active')
  insist(await eligibleSource(env,actor,snapshot.source,recipient.id),'signature_source_target_denied',403)
  insist(current,'signature_recipient_changed',409)
  if(snapshot.cohortKind==='location')insist(current.location?.id===snapshot.cohortValue,'signature_cohort_changed',409)
  if(snapshot.cohortKind==='department')insist(current.department?.id===snapshot.cohortValue,'signature_cohort_changed',409)
  if(snapshot.cohortKind==='employment_type')insist(periods.get(current.id)?.employment_type===snapshot.cohortValue,'signature_cohort_changed',409)
  if(snapshot.cohortKind==='access_level')insist(await one(env,'SELECT 1 FROM wl_member_levels l JOIN wl_members m ON m.id=l.member_id WHERE l.level_id=? AND m.person_id=?',snapshot.cohortValue,recipient.id),'signature_cohort_changed',409)
  const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',snapshot.category)
  insist(category&&category.subject_reads&&readsCategory(actor,recipient.id,category)&&readsCategory(counterActor,recipient.id,category),'signature_category_denied',403)
  statements.push(guard(env,'signature_recipient_changed',"EXISTS(SELECT 1 FROM wl_members WHERE id=? AND person_id=? AND status='active')",recipient.member,recipient.id))
  insist(JSON.stringify(await mergeValues(env,actor,recipient.id,template.fields))===JSON.stringify(recipient.merged),'signature_merge_changed',409)
  const id=newId(),document=newId()
  statements.push(stmt(env,`INSERT INTO wl_sign_requests(id,cohort,template_id,person_id,hr_member,document_id,rendered_sha256,rendered_size,state,expires_at,created_at,approved_sha256) VALUES(?,?,?,?,?,?,?,?,'sent',?,?,?)`,id,review.id,template.id,recipient.id,snapshot.hr,document,recipient.sha256,recipient.size,snapshot.expiresAt,now(),recipient.sha256))
  statements.push(stmt(env,'INSERT INTO wl_sign_files(id,request_id,person_id,sha256,size,created_at) VALUES(?,?,?,?,?,?)',newId(),id,recipient.id,recipient.sha256,recipient.size,now()))
  requests.push(id)
 }
 await commit(env,[...statements,...cohortIssueStatements(env,actor,review,snapshot),...workflowStatements],{actor:actor.id,action:'signature.send',subject:review.id,detail:{requests,count:requests.length,outbound:false}})
 await dispatchCohortNotices(env,review.id)
 return {id:review.id,requests,notice:snapshot.notify?'Portal requests created. Check delivery status for email outcomes.':'Portal requests created. No email was sent.'}
}

export async function signatureRequests(env:Bindings,actor:Actor) {
 const rows=await all(env,`SELECT r.*,t.title,t.category_id,c.subject_reads,c.manager_reads FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id JOIN wl_doc_categories c ON c.id=t.category_id ORDER BY r.created_at DESC,r.id`)
 return rows.filter(row=>readable(actor,row)).map(row=>({id:row.id,cohort:row.cohort,template:row.template_id,person:row.person_id,title:row.title,state:pending(row)&&row.expires_at<=now()?'expired':requestState(row),createdAt:row.created_at,expiresAt:row.expires_at,sealedVersion:row.sealed_version}))
}
export async function signatureRequest(env:Bindings,actor:Actor,id:string,asOf?:string) {
 const row=await rowFor(env,id)
 insist(row&&readable(actor,row),'not_found',404)
 if(asOf) {
  insist(isDate(asOf),'invalid_asOf')
  const source=(await datedSignatureSources(env,actor,asOf,await employerZone(env))).find(r=>r.id===id)
  insist(source,'not_found',404)
  return {...source,person:source.personId,asOf,revision:row.revision,digest:null,canSign:false,canManage:false,participant:false,signer:0,fields:[],signers:[],signed:[],sealedVersion:null,certificate:null,deliveries:[],category:row.category_name}
 }
 const deliveries=await all(env,'SELECT signer,status,failure,created_at FROM wl_sign_notifications WHERE request_id=? ORDER BY created_at,id',id)
 const events=await all(env,'SELECT * FROM wl_sign_events WHERE request_id=? ORDER BY at,id',id)
 const signers=JSON.parse(row.signers_json),signed=events.filter(e=>e.kind==='sign'),index=signed.length
 const eligible=index===0?actor.personId===row.person_id:actor.id===row.hr_member&&can(actor,'people.manage')
 const isPending=pending(row)&&row.expires_at>now()
 const sourceEligible=!isPending||await eligibleSource(env,actor,row.source_version,row.person_id)
 const participant=actor.personId===row.person_id||actor.id===row.hr_member||can(actor,'people.manage')
 return {id:row.id,title:row.title,category:row.category_name,deliveries:participant?deliveries:[],person:row.person_id,state:pending(row)&&!isPending?'expired':requestState(row),revision:row.revision,digest:participant?row.rendered_sha256:null,expiresAt:row.expires_at,canSign:isPending&&sourceEligible&&eligible&&index<signers.length,canManage:can(actor,'people.manage'),participant,signer:index,fields:participant?JSON.parse(row.fields_json):[],signers:participant?signers:[],signed:participant?signed.map(e=>({member:e.member_id,at:e.at,signer:e.signer})):[],sealedVersion:participant?row.sealed_version:null,certificate:participant&&row.certificate?JSON.parse(row.certificate):null}
}

export async function actSignature(env:Bindings,actor:Actor,input:Input,request:Request) {
 input.only(['request','revision','digest','action','consent','payload','returnTo'])
 const sequence=(await one(env,'SELECT '+SEQUENCE+' AS n'))!.n
 const row=await rowFor(env,input.text('request',{max:100}))
 insist(row&&readable(actor,row),'not_found',404)
 insist(pending(row)&&row.expires_at>now(),'signature_closed',409)
 if(input.text('action')==='sign')insist(await eligibleSource(env,actor,row.source_version,row.person_id),'signature_source_target_denied',403)
 insist(input.integer('revision')===row.revision&&input.text('digest',{max:64})===row.rendered_sha256,'signature_changed',409)
 const action=input.text('action'),detail=await signatureRequest(env,actor,row.id)
 const self=actor.personId===row.person_id,counter=actor.id===row.hr_member&&can(actor,'people.manage')
 insist(self||counter||can(actor,'people.manage'),'signature_signer_required',403)
 const statements=[session(env,actor),guard(env,'signature_inputs_changed',SEQUENCE+'=?',sequence),guard(env,'signature_changed',"EXISTS(SELECT 1 FROM wl_sign_requests WHERE id=? AND revision=? AND state IN ('sent','viewed') AND expires_at>?)",row.id,row.revision,now())]
 if(!self)statements.push(authority(env,actor))
 else statements.push(guard(env,'signature_subject_changed',"EXISTS(SELECT 1 FROM wl_members WHERE id=? AND person_id=? AND status='active')",actor.id,row.person_id))
 let state=row.state,certificate=null,sealed=null
 const event:Row={action,authentication:'active-session',consent:action==='sign'?CONSENT:null,ip:request.headers.get('cf-connecting-ip'),device:(request.headers.get('user-agent')??'').slice(0,300)}
 if(action==='sign') {
  insist(detail.canSign,'signature_order',403)
  insist(input.flag('consent'),'signature_consent_required')
  const prepared=await consumePayload(env,actor,input,row,detail,statements)
  const prior=await all(env,"SELECT * FROM wl_sign_events WHERE request_id=? AND kind='sign' ORDER BY signer",row.id)
  const stored={sha256:prepared.sha256,size:prepared.size}
  Object.assign(event,{values:prepared.values,sourceDigest:row.rendered_sha256,approvedDigest:prepared.approvedDigest,payloadDigest:prepared.sha256,consentVersion:'2026-10-26',language:prepared.language,sessionBinding:prepared.sessionBinding})
  statements.push(stmt(env,'UPDATE wl_sign_requests SET rendered_sha256=?,rendered_size=? WHERE id=?',stored.sha256,stored.size,row.id))
  if(detail.signer===detail.signers.length-1) {
   state='signed';sealed=newId()
   certificate={request:row.id,language:prepared.language,approvedDigest:prepared.approvedDigest,template:row.template_id,sha256:stored.sha256,consent:CONSENT,completedAt:now(),signers:[...prior.map(e=>({member:e.member_id,at:e.at,...JSON.parse(e.detail)})),{member:actor.id,at:now(),...event}]}
   statements.push(stmt(env,'INSERT INTO wl_documents(id,person_id,category_id,title,revision,created_by,created_at) VALUES(?,?,?,?,?,?,?)',row.document_id,row.person_id,row.category_id,row.title,newId(),actor.id,now()),stmt(env,'INSERT INTO wl_document_versions(id,document_id,number,filename,media_type,size,sha256,uploaded_by,uploaded_at) VALUES(?,?,1,?,?,?,?,?,?)',sealed,row.document_id,'signed.pdf','application/pdf',stored.size,stored.sha256,actor.id,now()))
  } else state='viewed'
 } else if(action==='view') { insist(self||counter,'signature_signer_required',403);state='viewed' }
 else if(action==='decline') { insist(self||counter,'signature_signer_required',403);state='declined' }
 else if(action==='withdraw') { insist(self||counter,'signature_signer_required',403);state='withdrawn' }
 else if(action==='void') { requirePermission(actor,'people.manage');state='voided' }
 else insist(false,'invalid_signature_action')
 statements.push(stmt(env,'INSERT INTO wl_sign_events(id,request_id,member_id,kind,signer,at,detail) VALUES(?,?,?,?,?,?,?)',newId(),row.id,actor.id,action,action==='sign'?detail.signer:null,now(),JSON.stringify(event)),stmt(env,'UPDATE wl_sign_requests SET state=?,revision=revision+1,sealed_version=?,certificate=? WHERE id=?',state,sealed,certificate?JSON.stringify(certificate):null,row.id))
 await commit(env,statements,{actor:actor.id,action:'signature.'+action,subject:row.id,detail:{state,outcome:'committed',person:row.person_id,category:row.category_id,authority:self?'employee':'employer-wide-hr',namedCountersigner:row.hr_member,revisionBefore:row.revision,revisionAfter:row.revision+1,template:row.template_id,signer:action==='sign'?detail.signer:null,consentReference:action==='sign'?input.text('payload'):null,sourceDigest:row.rendered_sha256,sealedDigest:certificate?.sha256??null}})
 return {id:row.id,state,sealedVersion:sealed}
}
export async function signatureFile(env:Bindings,actor:Actor,id:string) {
 const row=await rowFor(env,id)
 insist(row&&readable(actor,row)&&(actor.personId===row.person_id||actor.id===row.hr_member||can(actor,'people.manage')),'not_found',404)
 await auditRead(env,actor.id,'signature.download',id)
 return serve(env,{filename:'signature-document.pdf',mediaType:'application/pdf',size:row.rendered_size,sha256:row.rendered_sha256},{download:true})
}

export async function cancelSignatures(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 input.only(['cohort','returnTo'])
 const cohort=input.text('cohort',{max:100})
 insist(await one(env,'SELECT 1 FROM wl_sign_reviews WHERE id=? AND used_at IS NOT NULL',cohort),'not_found',404)
 await commit(env,[session(env,actor),authority(env,actor),...cohortCancelStatements(env,cohort),stmt(env,"UPDATE wl_sign_requests SET state='voided',closure_reason='cohort-cancelled',revision=revision+1 WHERE cohort=? AND state IN ('sent','viewed')",cohort)],{actor:actor.id,action:'signature.cohort.cancel',subject:cohort})
 return {id:cohort}
}

export async function signatureCsv(env:Bindings,actor:Actor) {
 const rows=await signatureRequests(env,actor)
 const cell=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,"'$&")+'"'
 return new Response([['Request','Template','Cohort','Person','State','Created','Expires'],...rows.map(r=>[r.id,r.template,r.cohort,r.person,r.state,r.createdAt,r.expiresAt])].map(r=>r.map(cell).join(',')).join('\r\n'),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="signed-documents.csv"','cache-control':'private, no-store'}})
}

export async function signatureReviewFile(env:Bindings,actor:Actor,id:string,url:URL) {
 requirePermission(actor,'people.manage')
 const review=await one(env,'SELECT * FROM wl_sign_reviews WHERE id=? AND actor=?',id,actor.id)
 insist(review&&review.created_at>now()-30*60000,'not_found',404)
 const snapshot=JSON.parse(review.snapshot),recipient=snapshot.recipients.find((r:Row)=>r.id===url.searchParams.get('person'))
 insist(recipient,'not_found',404)
 const template=(await signatureTemplates(env,actor)).find(t=>t.id===snapshot.template)
 insist(template&&JSON.stringify(await mergeValues(env,actor,recipient.id,template.fields))===JSON.stringify(recipient.merged),'signature_merge_changed',409)
 const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',snapshot.category)
 insist(category&&readsCategory(actor,recipient.id,category),'not_found',404)
 await auditRead(env,actor.id,'signature.preview.download',id)
 return serve(env,{sha256:recipient.sha256,size:recipient.size,filename:'reviewed.pdf',mediaType:'application/pdf'},{download:true})
}
