import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { Bindings } from '../../auth.server'
import { actorFor, type Actor } from '../actor'
import { readsCategory } from '../access'
import { guard, insist, newId, now, one, stmt, type Row } from '../core'
import { personView } from '../profile'
import { store } from '../files'
import { bytes, draw } from './custody'
import { mergeValues } from './rendering'
import { eligibleSource } from './source'
import { signatureTemplates } from './templates'

export async function enrollSignatureRecipient(env:Bindings,actor:Actor,snapshot:Row,personId:string,cohort:string,statements:D1PreparedStatement[]) {
 const template=(await signatureTemplates(env,actor)).find(t=>t.id===snapshot.template&&t.current&&t.approvedAt&&t.digest===snapshot.templateDigest)
 insist(template,'signature_template_changed',409)
 const person=await personView(env,actor,personId) as Row
 const member=await one(env,"SELECT * FROM wl_members WHERE person_id=? AND status='active'",personId)
 insist(member&&person.current,'signature_active_recipient_required',409)
 const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',snapshot.category)
 insist(category?.subject_reads&&readsCategory(actor,personId,category),'signature_category_denied',403)
 insist(await eligibleSource(env,actor,snapshot.source,personId),'signature_source_target_denied',403)
 const counter=await one(env,"SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active'",snapshot.hr)
 insist(counter,'signature_hr_required',409)
 const counterActor=await actorFor(env,{id:counter.id,email:counter.email,name:counter.name,personId:counter.person_id,owner:counter.role==='owner',sessionId:''})
 insist(counterActor.owner||counterActor.permissions.has('people.manage'),'signature_hr_required',403)
 insist(readsCategory(counterActor,personId,category),'signature_category_denied',403)
 insist(member.id!==counter.id||template.signers.length===1,'signature_distinct_signers_required')
 const source=await one(env,'SELECT * FROM wl_company_file_versions WHERE id=?',snapshot.source)
 insist(source,'signature_source_missing',409)
 const merged=await mergeValues(env,actor,personId,template.fields)
 const pdf=await PDFDocument.load(await bytes(env,source.sha256,source.size)),font=await pdf.embedFont(StandardFonts.Helvetica)
 for(const field of template.fields.filter((f:Row)=>Object.hasOwn(merged,f.kind)))draw(pdf.getPage(field.page-1),font,merged[field.kind],field)
 const rendered=Object.keys(merged).length?await store(env,{filename:'reviewed.pdf',bytes:await pdf.save()}):{sha256:source.sha256,size:source.size}
 const id=newId(),document=newId(),instant=now()
 statements.push(guard(env,'signature_recipient_changed',"EXISTS(SELECT 1 FROM wl_members WHERE id=? AND person_id=? AND status='active')",member.id,personId),
  stmt(env,'INSERT INTO wl_sign_files(id,request_id,person_id,sha256,size,created_at) VALUES(?,NULL,?,?,?,?)',newId(),personId,rendered.sha256,rendered.size,instant),
  stmt(env,"INSERT INTO wl_sign_requests(id,cohort,template_id,person_id,hr_member,document_id,rendered_sha256,rendered_size,state,expires_at,created_at,approved_sha256) VALUES(?,?,?,?,?,?,?,?,'sent',?,?,?)",id,cohort,template.id,personId,snapshot.hr,document,rendered.sha256,rendered.size,instant+snapshot.expiryDuration,instant,rendered.sha256))
 return id
}
