// Native template definitions retain an exact shared-file version. Approval never sends requests.
import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt, type Row } from '../core'
import type { Input } from '../input'
import { serve } from '../files'

const SESSION=`SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email)
 WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?
 AND (o.role='owner' OR EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission='people.manage'))`
const authority=(env:Bindings,actor:Actor)=>guard(env,'signature_authority_changed',`EXISTS(${SESSION})`,actor.sessionId,actor.id,now())
const currentSource=`EXISTS(SELECT 1 FROM wl_company_file_versions v JOIN wl_company_files f ON f.id=v.file_id JOIN wl_company_folder_versions folder ON folder.folder_id=f.folder_id
 WHERE v.id=? AND v.sha256=? AND v.version=(SELECT MAX(version) FROM wl_company_file_versions WHERE file_id=v.file_id)
 AND folder.version=(SELECT MAX(version) FROM wl_company_folder_versions WHERE folder_id=folder.folder_id) AND folder.retired=0)`
const currentTemplate=`NOT EXISTS(SELECT 1 FROM wl_sign_templates newer WHERE newer.family=? AND newer.version>?)`
const digest=(row:Row)=>sha256Hex(JSON.stringify({id:row.id,family:row.family,version:row.version,title:row.title,source:row.source_version,sha256:row.source_sha256,category:row.category_id,signers:JSON.parse(row.signers_json),fields:JSON.parse(row.fields_json)}))

function configuration(input:Input) {
 const signers=input.json('signers'),fields=input.json('fields')
 insist(Array.isArray(signers)&&signers.length>0&&signers.length<=4,'invalid_signers')
 insist(signers.every((role:unknown)=>role==='employee'||role==='hr')&&new Set(signers).size===signers.length,'invalid_signers')
 insist(Array.isArray(fields)&&fields.length>0&&fields.length<=40,'invalid_signature_fields')
 const normalized=fields.map((value:unknown)=>{
  insist(value&&typeof value==='object'&&!Array.isArray(value),'invalid_signature_field')
  const row=value as Record<string,unknown>
  insist(Object.keys(row).length===7&&Object.keys(row).every(key=>['signer','kind','page','x','y','width','height'].includes(key)),'invalid_signature_field')
  insist(Number.isInteger(row.signer)&&Number(row.signer)>=0&&Number(row.signer)<signers.length,'invalid_signature_signer')
  insist(typeof row.kind==='string'&&['signature','initial','date','text','employee_name','job_title','compensation'].includes(row.kind),'invalid_signature_field_kind')
  insist(Number.isInteger(row.page)&&Number(row.page)>0&&Number(row.page)<=1000,'invalid_signature_page')
  for(const key of ['x','y','width','height']) insist(typeof row[key]==='number'&&Number.isFinite(row[key])&&Number(row[key])>=0&&Number(row[key])<=1,'invalid_signature_position')
  insist(Number(row.width)>0&&Number(row.height)>0&&Number(row.x)+Number(row.width)<=1&&Number(row.y)+Number(row.height)<=1,'invalid_signature_position')
  return {signer:Number(row.signer),kind:String(row.kind),page:Number(row.page),x:Number(row.x),y:Number(row.y),width:Number(row.width),height:Number(row.height)}
 })
 insist(signers.every((_,index)=>normalized.some(field=>field.signer===index&&field.kind==='signature')),'signer_signature_required')
 return {signers,fields:normalized}
}

export async function writeSignatureTemplate(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 input.only(['template','source','title','category','signers','fields','returnTo'])
 const prior=input.text('template',{optional:true,max:100})
 const old=prior?await one(env,'SELECT * FROM wl_sign_templates WHERE id=?',prior):null
 insist(!prior||old,'signature_template_not_found',404)
 if(old) insist(await one(env,'SELECT 1 WHERE '+currentTemplate,old.family,old.version),'signature_template_changed',409)
 const source=await one(env,'SELECT * FROM wl_company_file_versions WHERE id=?',input.text('source',{max:100}))
 insist(source,'signature_source_not_found',404)
 insist(source.media_type==='application/pdf','signature_pdf_required')
 const category=input.text('category',{max:100})
 insist(await one(env,'SELECT 1 FROM wl_doc_categories WHERE id=?',category),'category_not_found',404)
 const config=configuration(input),id=newId(),family=old?.family??id,version=(old?.version??0)+1
 await commit(env,[authority(env,actor),guard(env,'signature_source_changed',currentSource,source.id,source.sha256),
  guard(env,'signature_template_changed','NOT EXISTS(SELECT 1 FROM wl_sign_templates WHERE family=? AND version>=?)',family,version),
  stmt(env,'INSERT INTO wl_sign_templates(id,family,version,title,source_version,source_sha256,category_id,signers_json,fields_json,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,family,version,input.text('title',{max:160}),source.id,source.sha256,category,JSON.stringify(config.signers),JSON.stringify(config.fields),actor.id,now())],
  {actor:actor.id,action:'signature.template.draft',subject:id,detail:{family,version,source:source.id,category}})
 return {id,family,version}
}

/** Exact bytes and placement configuration must be reviewed before this version is approved. */
export async function approveSignatureTemplate(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 input.only(['template','digest','reviewed','returnTo'])
 insist(input.flag('reviewed'),'signature_review_required')
 const row=await one(env,'SELECT * FROM wl_sign_templates WHERE id=?',input.text('template',{max:100}))
 insist(row,'signature_template_not_found',404)
 const source=await one(env,'SELECT * FROM wl_company_file_versions WHERE id=?',row.source_version)
 insist(source,'signature_source_not_found',404)
 await serve(env,{filename:source.filename,mediaType:source.media_type,size:source.size,sha256:source.sha256},{download:true})
 const hash=await digest(row)
 insist(input.text('digest',{max:64})===hash,'signature_template_changed',409)
 insist(!await one(env,'SELECT 1 FROM wl_sign_template_approvals WHERE template_id=?',row.id),'signature_already_approved',409)
 await commit(env,[authority(env,actor),guard(env,'signature_source_changed',currentSource,row.source_version,row.source_sha256),
  guard(env,'signature_template_changed',currentTemplate,row.family,row.version),
  guard(env,'signature_already_approved','NOT EXISTS(SELECT 1 FROM wl_sign_template_approvals WHERE template_id=?)',row.id),
  stmt(env,'INSERT INTO wl_sign_template_approvals(template_id,approved_by,approved_at,digest) VALUES(?,?,?,?)',row.id,actor.id,now(),hash)],
  {actor:actor.id,action:'signature.template.approve',subject:row.id,detail:{digest:hash}})
 return {id:row.id,approved:true,digest:hash}
}

export async function signatureTemplates(env:Bindings,actor:Actor) {
 requirePermission(actor,'people.manage')
 const rows=await all(env,`SELECT t.*,a.approved_at FROM wl_sign_templates t LEFT JOIN wl_sign_template_approvals a ON a.template_id=t.id ORDER BY t.recorded_at,t.id`)
 return Promise.all(rows.map(async row=>({id:row.id,family:row.family,version:row.version,title:row.title,sourceVersion:row.source_version,sourceSha256:row.source_sha256,sourceUrl:'/app/company/files/'+row.source_version+'?download=1',category:row.category_id,signers:JSON.parse(row.signers_json),fields:JSON.parse(row.fields_json),digest:await digest(row),approvedAt:row.approved_at,current:!!await one(env,'SELECT 1 WHERE '+currentTemplate+' AND '+currentSource,row.family,row.version,row.source_version,row.source_sha256)})))
}
