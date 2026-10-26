import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, auditRead, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from '../core'
import type { Input } from '../input'
import { serve, store } from '../files'
import { CONSENT, SEQUENCE, bytes, draw, pending, readable, rowFor, session } from './custody'
import { signatureRequest } from './requests'

export async function prepareSignature(env:Bindings,actor:Actor,input:Input) {
 input.only(['request','revision','digest','name','initial','text','returnTo'])
 const sequence=(await one(env,'SELECT '+SEQUENCE+' AS n'))!.n
 const row=await rowFor(env,input.text('request',{max:100}))
 insist(row&&readable(actor,row),'not_found',404)
 const detail=await signatureRequest(env,actor,row.id)
 insist(pending(row)&&row.expires_at>now(),'signature_closed',409)
 insist(detail.canSign,'signature_order',403)
 insist(input.integer('revision')===row.revision&&input.text('digest',{max:64})===row.rendered_sha256,'signature_changed',409)
 const values={signature:input.text('name',{max:100}),initial:input.text('initial',{optional:true,max:16}),text:input.text('text',{optional:true,max:160}),date:new Date(now()).toISOString().slice(0,10)}
 const pdf=await PDFDocument.load(await bytes(env,row.rendered_sha256,row.rendered_size)),font=await pdf.embedFont(StandardFonts.Helvetica)
 for(const field of detail.fields.filter((f:Row)=>f.signer===detail.signer&&['signature','initial','date','text'].includes(f.kind))) {
  const value=values[field.kind as keyof typeof values]
  insist(value,'signature_field_required')
  draw(pdf.getPage(field.page-1),font,value,field)
 }
 const stored=await store(env,{filename:'signing-review.pdf',bytes:await pdf.save()}),id=newId()
 const review=await one(env,'SELECT snapshot FROM wl_sign_reviews WHERE id=?',row.cohort)
 const approvedDigest=row.approved_sha256??JSON.parse(review!.snapshot).recipients.find((r:Row)=>r.id===row.person_id)?.sha256
 insist(approvedDigest,'signature_approved_bytes_missing',409)
 const sessionBinding=await sha256Hex(actor.sessionId)
 await commit(env,[session(env,actor),guard(env,'signature_inputs_changed',SEQUENCE+'=?',sequence),
  stmt(env,'INSERT INTO wl_sign_payloads VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)',id,row.id,actor.id,sessionBinding,row.revision,row.rendered_sha256,approvedDigest,stored.sha256,stored.size,JSON.stringify(values),'en',now()),
  stmt(env,'INSERT INTO wl_sign_files(id,request_id,person_id,sha256,size,created_at) VALUES(?,?,?,?,?,?)',newId(),row.id,row.person_id,stored.sha256,stored.size,now())],
  {actor:actor.id,action:'signature.prepare',subject:row.id,detail:{review:id,template:row.template_id,revision:row.revision,sourceDigest:row.rendered_sha256,payloadDigest:stored.sha256}})
 return {id,request:row.id,revision:row.revision,digest:row.rendered_sha256,sha256:stored.sha256,values,language:'en',consent:CONSENT,title:row.title,category:row.category_id,expiresAt:Math.min(row.expires_at,now()+15*60000)}
}

export async function consumePayload(env:Bindings,actor:Actor,input:Input,row:Row,detail:Row,statements:D1PreparedStatement[]) {
 const id=input.text('payload',{max:100}),binding=await sha256Hex(actor.sessionId)
 const payload=await one(env,'SELECT * FROM wl_sign_payloads WHERE id=?',id)
 insist(payload&&payload.request_id===row.id&&payload.member_id===actor.id&&payload.session_binding===binding&&!payload.used_at&&payload.created_at>now()-15*60000,'signature_payload_expired',409)
 insist(payload.request_revision===row.revision&&payload.source_sha256===row.rendered_sha256&&detail.canSign,'signature_payload_changed',409)
 await bytes(env,payload.sha256,payload.size)
 statements.push(guard(env,'signature_payload_used','EXISTS(SELECT 1 FROM wl_sign_payloads WHERE id=? AND used_at IS NULL AND session_binding=?)',id,binding),stmt(env,'UPDATE wl_sign_payloads SET used_at=? WHERE id=?',now(),id))
 return {sha256:payload.sha256,size:payload.size,values:JSON.parse(payload.values_json),approvedDigest:payload.approved_sha256,sessionBinding:binding,language:payload.language}
}

export async function signaturePayloadFile(env:Bindings,actor:Actor,id:string) {
 const payload=await one(env,'SELECT * FROM wl_sign_payloads WHERE id=?',id)
 const row=payload?await rowFor(env,payload.request_id):null
 insist(row&&readable(actor,row)&&payload!.member_id===actor.id&&payload!.session_binding===await sha256Hex(actor.sessionId)&&!payload!.used_at&&payload!.created_at>now()-15*60000&&pending(row)&&row.expires_at>now()&&row.revision===payload!.request_revision,'not_found',404)
 await auditRead(env,actor.id,'signature.payload.download',row.id,{review:id})
 return serve(env,{sha256:payload!.sha256,size:payload!.size,filename:'signing-review.pdf',mediaType:'application/pdf'},{download:true})
}
