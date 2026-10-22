import type { Bindings } from '../auth.server'
import { actorFor, canAbout, type Actor } from './actor'
import { readsCategory } from './access'
import { commit, guard, insist, newId, now, one, stmt, type Row } from './core'
import { addDays } from './dates'
import { store } from './files'
import type { Input } from './input'
import { documentMode } from './levels/documents'
import { documentNumber } from './document-publication'

export const documentChangeCategory=(row:Row)=>({id:row.doc_category_id??JSON.parse(row.after_json).category,subject_reads:row.doc_subject_reads??0,manager_reads:row.doc_manager_reads??0})
export const readsDocumentChange=(actor:Actor,row:Row)=>readsCategory(actor,row.person_id,documentChangeCategory(row)) && (actor.personId===row.person_id || actor.id===row.requested_by || canAbout(actor,'people.manage',row.person_id))
export const reviewsDocumentChange=(actor:Actor,row:Row)=>canAbout(actor,'people.manage',row.person_id) && readsCategory(actor,row.person_id,documentChangeCategory(row))
async function fresh(env:Bindings,actor:Actor) {
 const row=await one(env,`SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?`,actor.id)
 insist(row,'forbidden',403)
 return actorFor(env,{id:row.id,email:row.email,name:row.name,personId:row.person_id,owner:row.role==='owner',sessionId:actor.sessionId})
}
const snapshotFence=(env:Bindings,source:number)=>guard(env,'access_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',source)
const sessionFence=(env:Bindings,actor:Actor)=>guard(env,'access_changed',`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email)
 WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`,actor.sessionId,actor.id,now())

export async function writeDocument(env:Bindings,actor:Actor,input:Input,approval=false) {
 input.only(['person','category','title','document','revision','file','returnTo'])
 const source=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 actor=await fresh(env,actor)
 const existing=input.text('document',{optional:true,max:100})
 const document=existing?await one(env,'SELECT * FROM wl_documents WHERE id=?',existing):null
 insist(!existing||document,'document_not_found',404)
 const person=document?.person_id??input.text('person',{max:100}),categoryId=document?.category_id??input.text('category',{max:100})
 const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',categoryId)
 insist(category,'category_not_found',404)
 insist(await one(env,'SELECT 1 FROM wl_people WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)',person),'person_not_found',404)
 const mode=documentMode(actor,person,categoryId)
 insist(mode===(approval?'approval':'edit'),mode==='approval'?'document_approval_required':'document_read_only',403)
 insist(!input.provided('revision')||input.text('revision')===document?.revision,'stale',409)
 const file=(await input.file('file',{maxBytes:10_000_000}))!,stored=await store(env,file)
 const id=document?.id??newId(),version=newId(),revision=document?.revision??newId(),title=document?.title??input.text('title',{max:160})
 const number=((await one<{n:number}>(env,'SELECT COALESCE(MAX(number),0) AS n FROM wl_document_versions WHERE document_id=?',id))!.n)+1
 const statements=[snapshotFence(env,source),sessionFence(env,actor),
  ...(document?[guard(env,'stale','EXISTS(SELECT 1 FROM wl_documents WHERE id=? AND revision=?)',id,revision)]:[stmt(env,'INSERT INTO wl_documents(id,person_id,category_id,title,revision,created_by,created_at) VALUES(?,?,?,?,?,?,?)',id,person,categoryId,title,revision,actor.id,now())]),
  guard(env,'stale','(SELECT COALESCE(MAX(number),0) FROM wl_document_versions WHERE document_id=?)=?',id,number-1),
  stmt(env,'INSERT INTO wl_document_versions(id,document_id,number,filename,media_type,size,sha256,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?)',version,id,number,stored.filename,stored.mediaType,stored.size,stored.sha256,actor.id,now())]
 if(approval) {
  const change=newId(),after={document:id,version,category:categoryId,title,filename:stored.filename,mediaType:stored.mediaType,size:stored.size,sha256:stored.sha256}
  statements.push(stmt(env,'INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,table_version_id,requested_by,requested_at,due_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)',change,person,'document',id,JSON.stringify(document?{document:id,revision}:null),JSON.stringify(after),revision,null,actor.id,now(),addDays(actor.today,7)),stmt(env,'INSERT INTO wl_document_proposals(version_id,change_id,person_id,document_id,category_id,source_revision) VALUES(?,?,?,?,?,?)',version,change,person,id,categoryId,revision))
  await commit(env,statements,{actor:actor.id,action:'selfChange.request',subject:change,detail:{person,kind:'document'}})
  return {id:change,document:id,version,status:'pending'}
 }
 statements.push(stmt(env,'UPDATE wl_documents SET revision=? WHERE id=?',newId(),id))
 await commit(env,statements,{actor:actor.id,action:document?'document.revise':'document.add',subject:id,detail:{version:number,sha256:stored.sha256}})
 return {id,version,number:await documentNumber(env,id,number),sha256:stored.sha256,mediaType:stored.mediaType}
}
export const proposeDocument=(env:Bindings,actor:Actor,input:Input)=>writeDocument(env,actor,input,true)

export async function documentReviewAuthority(env:Bindings,reviewer:Actor,row:Row) {
 const source=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const current=await fresh(env,reviewer)
 const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',JSON.parse(row.after_json).category)
 insist(category&&canAbout(current,'people.manage',row.person_id)&&readsCategory(current,row.person_id,category),'forbidden',403)
 return [snapshotFence(env,source),sessionFence(env,current)]
}
export async function approveDocumentStatements(env:Bindings,reviewer:Actor,row:Row) {
 const source=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const member=await one(env,`SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?`,row.requested_by)
 insist(member,'document_approval_unavailable',403)
 const requester=await fresh(env,{...reviewer,id:member.id})
 const after=JSON.parse(row.after_json)
 insist(documentMode(requester,row.person_id,after.category)==='approval','document_approval_unavailable',403)
 return [snapshotFence(env,source),guard(env,'document_approval_unavailable',"EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active')",requester.id),guard(env,'stale','EXISTS(SELECT 1 FROM wl_documents WHERE id=? AND revision=?)',after.document,row.source_revision),guard(env,'stale','EXISTS(SELECT 1 FROM wl_document_proposals WHERE change_id=? AND version_id=? AND document_id=? AND category_id=?)',row.id,after.version,after.document,after.category),stmt(env,'UPDATE wl_documents SET revision=? WHERE id=?',newId(),after.document)]
}
