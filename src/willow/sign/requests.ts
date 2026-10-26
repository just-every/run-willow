import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { Bindings } from '../../auth.server'
import { can, requirePermission, type Actor } from '../actor'
import { readsCategory } from '../access'
import { all, auditRead, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from '../core'
import { serve, store } from '../files'
import type { Input } from '../input'
import { signatureTemplates } from './templates'
import { directory,personView } from '../profile'

export const CONSENT='I consent to electronic records and signatures for this exact document. I can download a copy and withdraw before completion. I intend my entered name and initials to be my signature.'
const SESSION=`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email) WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`
const session=(env:Bindings,actor:Actor)=>guard(env,'signature_session_changed',SESSION,actor.sessionId,actor.id,now())
const authority=(env:Bindings,actor:Actor)=>guard(env,'signature_authority_changed',`EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=? AND permission='people.manage') OR EXISTS(SELECT 1 FROM oa_operators WHERE email=? AND role='owner' AND status='active')`,actor.id,actor.email)
const pending=(row:Row)=>['sent','viewed'].includes(row.state)
const SEQUENCE="COALESCE((SELECT MAX(seq) FROM wl_audit WHERE action NOT LIKE '%.read' AND action NOT LIKE '%.download'),0)"
const rowFor=(env:Bindings,id:string)=>one(env,`SELECT r.*,t.title,t.category_id,t.signers_json,t.fields_json,c.subject_reads,c.manager_reads FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id JOIN wl_doc_categories c ON c.id=t.category_id WHERE r.id=?`,id)
function readable(actor:Actor,row:Row) { return readsCategory(actor,row.person_id,row)&&(can(actor,'people.manage')||actor.personId===row.person_id||actor.reports.has(row.person_id)) }
async function bytes(env:Bindings,hash:string,size:number) {
 const response=await serve(env,{sha256:hash,size,filename:'document.pdf',mediaType:'application/pdf'})
 return new Uint8Array(await response.arrayBuffer())
}
function draw(page:any,font:any,text:string,field:Row) {
 insist(/^[\x20-\x7e]*$/.test(text),'signature_text_unsupported')
 const {width,height}=page.getSize(),w=field.width*width,h=field.height*height
 const size=Math.min(14,h*0.7,w/Math.max(font.widthOfTextAtSize(text||' ',1),1))
 insist(size>=6,'signature_text_does_not_fit')
 page.drawText(text,{x:field.x*width,y:height-(field.y+field.height)*height+Math.max(0,(h-size)/2),size,font})
}

async function mergeValues(env:Bindings,actor:Actor,person:string,fields:Row[]) {
 const view=await personView(env,actor,person) as any
 const values:Record<string,string>={}
 for(const field of fields) {
  if(field.kind==='employee_name')values.employee_name=view.legalName
  if(field.kind==='job_title')values.job_title=view.current?.jobTitle??''
  if(field.kind==='compensation') {
   const term=view.employment?.flatMap((p:any)=>p.terms).find((t:any)=>t.id===view.current?.id)
   insist(term?.pay,'signature_compensation_denied',403)
   values.compensation=`${term.pay.currency} ${(term.pay.amountCents/100).toFixed(2)} ${term.pay.basis}`
  }
 }
 return values
}

export async function previewSignatures(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 input.only(['template','people','hr','expiresAt','returnTo'])
 const template=(await signatureTemplates(env,actor)).find(t=>t.id===input.text('template',{max:100}))
 insist(template?.approvedAt&&template.current,'signature_approved_template_required',409)
 const roles=template.signers
 insist(roles[0]==='employee'&&(roles.length===1||(roles.length===2&&roles[1]==='hr')),'signature_order_unsupported')
 const people=[...new Set(input.list('people'))]
 insist(people.length>0&&people.length<=200,'signature_recipients_required')
 const hr=input.text('hr',{optional:roles.length===1,max:100})||actor.id
 const counter=await one(env,`SELECT m.id FROM wl_members m WHERE m.id=? AND m.status='active' AND (EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission='people.manage') OR EXISTS(SELECT 1 FROM oa_operators o WHERE lower(o.email)=m.email AND o.role='owner' AND o.status='active'))`,hr)
 insist(counter,'signature_hr_required')
 const expiresAt=input.integer('expiresAt',{min:now()+60_000,max:now()+90*86400000})!
 const visible=await directory(env,actor)
 const source=await one(env,'SELECT * FROM wl_company_file_versions WHERE id=?',template.sourceVersion)
 insist(source,'signature_source_missing',409)
 const original=await bytes(env,source.sha256,source.size)
 const recipients=[]
 const files:D1PreparedStatement[]=[]
 for(const id of people) {
  const person=visible.find(p=>p.id===id)
  const member=await one(env,"SELECT id FROM wl_members WHERE person_id=? AND status='active'",id)
  insist(person&&person.status==='active'&&member,'signature_active_recipient_required')
  const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',template.category)
  insist(category&&category.subject_reads&&readsCategory(actor,id,category),'signature_category_denied',403)
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
 const snapshot={template:template.id,templateDigest:template.digest,source:template.sourceVersion,sourceSha256:template.sourceSha256,category:template.category,title:template.title,hr,expiresAt,recipients}
 const encoded=JSON.stringify(snapshot),digest=await sha256Hex(encoded),id=newId()
 await commit(env,[session(env,actor),authority(env,actor),...files,stmt(env,'INSERT INTO wl_sign_reviews(id,actor,template_id,snapshot,digest,created_at) VALUES(?,?,?,?,?,?)',id,actor.id,template.id,encoded,digest,now())],{actor:actor.id,action:'signature.preview',subject:id,detail:{template:template.id,count:people.length}})
 return {id,digest,...snapshot}
}

export async function sendSignatures(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 input.only(['review','digest','approved','returnTo'])
 insist(input.flag('approved'),'signature_review_required')
 const review=await one(env,'SELECT * FROM wl_sign_reviews WHERE id=?',input.text('review',{max:100}))
 insist(review&&review.actor===actor.id&&!review.used_at&&review.created_at>now()-30*60000,'signature_review_expired',409)
 insist(input.text('digest',{max:64})===review.digest,'signature_review_changed',409)
 const sequence=(await one(env,'SELECT '+SEQUENCE+' AS n'))!.n
 const snapshot=JSON.parse(review.snapshot)
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
 const visible=await directory(env,actor)
 const requests=[]
 for(const recipient of snapshot.recipients) {
  insist(visible.some(p=>p.id===recipient.id&&p.status==='active'),'signature_recipient_changed',409)
  const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',snapshot.category)
  insist(category&&category.subject_reads&&readsCategory(actor,recipient.id,category),'signature_category_denied',403)
  statements.push(guard(env,'signature_recipient_changed',"EXISTS(SELECT 1 FROM wl_members WHERE id=? AND person_id=? AND status='active')",recipient.member,recipient.id))
  insist(JSON.stringify(await mergeValues(env,actor,recipient.id,template.fields))===JSON.stringify(recipient.merged),'signature_merge_changed',409)
  const id=newId(),document=newId()
  statements.push(stmt(env,`INSERT INTO wl_sign_requests(id,cohort,template_id,person_id,hr_member,document_id,rendered_sha256,rendered_size,state,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,'sent',?,?)`,id,review.id,template.id,recipient.id,snapshot.hr,document,recipient.sha256,recipient.size,snapshot.expiresAt,now()))
  requests.push(id)
 }
 await commit(env,statements,{actor:actor.id,action:'signature.send',subject:review.id,detail:{requests,count:requests.length,outbound:false}})
 return {id:review.id,requests,notice:'Portal requests created. No email was sent.'}
}

export async function signatureRequests(env:Bindings,actor:Actor) {
 const rows=await all(env,`SELECT r.*,t.title,t.category_id,c.subject_reads,c.manager_reads FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id JOIN wl_doc_categories c ON c.id=t.category_id ORDER BY r.created_at DESC,r.id`)
 return rows.filter(row=>readable(actor,row)).map(row=>({id:row.id,cohort:row.cohort,template:row.template_id,person:row.person_id,title:row.title,state:pending(row)&&row.expires_at<=now()?'expired':row.state,createdAt:row.created_at,expiresAt:row.expires_at,sealedVersion:row.sealed_version}))
}
export async function signatureRequest(env:Bindings,actor:Actor,id:string) {
 const row=await rowFor(env,id)
 insist(row&&readable(actor,row),'not_found',404)
 const events=await all(env,'SELECT * FROM wl_sign_events WHERE request_id=? ORDER BY at,id',id)
 const signers=JSON.parse(row.signers_json),signed=events.filter(e=>e.kind==='sign'),index=signed.length
 const eligible=index===0?actor.personId===row.person_id:actor.id===row.hr_member&&can(actor,'people.manage')
 const isPending=pending(row)&&row.expires_at>now()
 const participant=actor.personId===row.person_id||actor.id===row.hr_member||can(actor,'people.manage')
 return {id:row.id,title:row.title,person:row.person_id,state:pending(row)&&!isPending?'expired':row.state,revision:row.revision,digest:row.rendered_sha256,expiresAt:row.expires_at,canSign:isPending&&eligible&&index<signers.length,canManage:can(actor,'people.manage'),participant,signer:index,fields:participant?JSON.parse(row.fields_json):[],signers,signed:participant?signed.map(e=>({member:e.member_id,at:e.at,signer:e.signer})):[],sealedVersion:row.sealed_version,certificate:participant&&row.certificate?JSON.parse(row.certificate):null}
}

export async function actSignature(env:Bindings,actor:Actor,input:Input,request:Request) {
 input.only(['request','revision','digest','action','consent','name','initial','text','returnTo'])
 const sequence=(await one(env,'SELECT '+SEQUENCE+' AS n'))!.n
 const row=await rowFor(env,input.text('request',{max:100}))
 insist(row&&readable(actor,row),'not_found',404)
 insist(pending(row)&&row.expires_at>now(),'signature_closed',409)
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
  const name=input.text('name',{max:100}),initial=input.text('initial',{optional:true,max:16}),text=input.text('text',{optional:true,max:160})
  const prior=await all(env,"SELECT * FROM wl_sign_events WHERE request_id=? AND kind='sign' ORDER BY signer",row.id)
  const pdf=await PDFDocument.load(await bytes(env,row.rendered_sha256,row.rendered_size)),font=await pdf.embedFont(StandardFonts.Helvetica)
  const values={signature:name,initial,date:new Date().toISOString().slice(0,10),text}
  for(const field of JSON.parse(row.fields_json).filter((f:Row)=>f.signer===detail.signer&&['signature','initial','date','text'].includes(f.kind))) {
   const value=values[field.kind as keyof typeof values]
   insist(value,'signature_field_required')
   draw(pdf.getPage(field.page-1),font,value,field)
  }
  Object.assign(event,{values,sourceDigest:row.rendered_sha256})
  const stored=await store(env,{filename:'signed.pdf',bytes:await pdf.save()})
  statements.push(stmt(env,'INSERT INTO wl_sign_files(id,request_id,person_id,sha256,size,created_at) VALUES(?,?,?,?,?,?)',newId(),row.id,row.person_id,stored.sha256,stored.size,now()))
  statements.push(stmt(env,'UPDATE wl_sign_requests SET rendered_sha256=?,rendered_size=? WHERE id=?',stored.sha256,stored.size,row.id))
  if(detail.signer===detail.signers.length-1) {
   state='signed';sealed=newId()
   certificate={request:row.id,template:row.template_id,sha256:stored.sha256,consent:CONSENT,completedAt:now(),signers:[...prior.map(e=>({member:e.member_id,at:e.at,...JSON.parse(e.detail)})),{member:actor.id,at:now(),...event}]}
   statements.push(stmt(env,'INSERT INTO wl_documents(id,person_id,category_id,title,revision,created_by,created_at) VALUES(?,?,?,?,?,?,?)',row.document_id,row.person_id,row.category_id,row.title,newId(),actor.id,now()),stmt(env,'INSERT INTO wl_document_versions(id,document_id,number,filename,media_type,size,sha256,uploaded_by,uploaded_at) VALUES(?,?,1,?,?,?,?,?,?)',sealed,row.document_id,'signed.pdf','application/pdf',stored.size,stored.sha256,actor.id,now()))
  } else state='viewed'
 } else if(action==='view') { insist(self||counter,'signature_signer_required',403);state='viewed' }
 else if(action==='decline') { insist(self||counter,'signature_signer_required',403);state='declined' }
 else if(action==='withdraw') { insist(self||counter,'signature_signer_required',403);state='withdrawn' }
 else if(action==='void') { requirePermission(actor,'people.manage');state='voided' }
 else insist(false,'invalid_signature_action')
 statements.push(stmt(env,'INSERT INTO wl_sign_events(id,request_id,member_id,kind,signer,at,detail) VALUES(?,?,?,?,?,?,?)',newId(),row.id,actor.id,action,action==='sign'?detail.signer:null,now(),JSON.stringify(event)),stmt(env,'UPDATE wl_sign_requests SET state=?,revision=revision+1,sealed_version=?,certificate=? WHERE id=?',state,sealed,certificate?JSON.stringify(certificate):null,row.id))
 await commit(env,statements,{actor:actor.id,action:'signature.'+action,subject:row.id,detail:{state,signer:action==='sign'?detail.signer:null}})
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
 await commit(env,[session(env,actor),authority(env,actor),stmt(env,"UPDATE wl_sign_requests SET state='voided',revision=revision+1 WHERE cohort=? AND state IN ('sent','viewed')",cohort)],{actor:actor.id,action:'signature.cohort.cancel',subject:cohort})
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
