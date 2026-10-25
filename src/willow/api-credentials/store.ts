// Administrator-managed credential custody. Only the issuing response carries bearer bytes.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, auditRead, commit, guard, insist, newId, now, one, sha256Hex, stmt, WillowError } from '../core'
import type { Input } from '../input'
import { currentLevelAdmin, validateDelegation } from '../levels/delegation'
import { levels } from '../levels/store'
import { READ_PERMISSIONS } from './principal'

export interface CredentialRow {
 id:string; name:string; credential_type:'key'|'oauth_client'; token_hash:string; level_id:string; level_version:number;
 issued_by:string; issuer_operator:string; issuer_version:number; issued_at:number; expires_at:number;
 last_used_at:number|null; revoked_at:number|null; revocation_reason:string|null; replaced_by:string|null; write_scopes:string; needs_approval:number; approved_by:string|null; approval_reason:string|null; redirect_uri?:string|null;
}
export const credentialMetadata=(row:CredentialRow)=>({id:row.id,name:row.name,credentialType:row.credential_type,level:row.level_id,levelVersion:row.level_version,issuedBy:row.issued_by,issuedAt:row.issued_at,expiresAt:row.expires_at,lastUsedAt:row.last_used_at,revokedAt:row.revoked_at,revocationReason:row.revocation_reason,replacedBy:row.replaced_by,approvalRequired:!!row.needs_approval,approvedBy:row.approved_by,redirectUri:row.redirect_uri??null,readOnly:JSON.parse(row.write_scopes).length===0,writeScopes:JSON.parse(row.write_scopes) as string[]})
export type CredentialMetadata=ReturnType<typeof credentialMetadata>

const businessSnapshot=async(env:Bindings)=>(await one<{seq:number}>(env,"SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit WHERE action NOT LIKE '%.read' AND action<>'document.download'"))!.seq
export async function administratorAuthority(env:Bindings,actor:Actor) {
 const snapshot=await businessSnapshot(env)
 actor=await currentLevelAdmin(env,actor)
 const row=await one<{id:string;version:number}>(env,`SELECT o.id,o.version FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email)
 WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?`,actor.sessionId,actor.id,now())
 insist(row,'access_administrator_required',403)
 return {actor,row,fence:guard(env,'access_changed',`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email)
 WHERE s.id=? AND m.id=? AND m.status='active' AND o.id=? AND o.version=? AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?) AND (SELECT COALESCE(MAX(seq),0) FROM wl_audit WHERE action NOT LIKE '%.read' AND action<>'document.download')=?`,actor.sessionId,actor.id,row.id,row.version,now(),snapshot)}
}
export async function credentialCeiling(env:Bindings,actor:Actor,id:string,writeScopes:string[]) {
 const data=await levels(env,actor),level=data.levels.find(level=>level.id===id)
 insist(level,'level_not_found',404)
 // Only the facets a non-person principal can carry enter its issuance ceiling.
 const view=(rules:Record<string,string>,scope?:string)=>Object.fromEntries(Object.entries(rules).map(([field,mode])=>[field,mode==='none'?'none':scope&&writeScopes.includes(scope)&&['approval','edit'].includes(mode)?'approval':'view']))
 const definition={...level,kind:'level' as const,level:id,permissions:level.permissions.filter(p=>READ_PERMISSIONS.includes(p)),settings:[],approvals:[],selfFields:{},followOwnChanges:false,performanceFields:{self:{},others:{}},
  jobFields:{self:{},others:view(level.jobFields.others,'job.approval')},leaveFields:{self:{},others:view(level.leaveFields.others,'leave.approval')},compensationFields:{self:{},others:view(level.compensationFields.others,'compensation.approval')},
  otherFields:Object.fromEntries(Object.entries(level.otherFields).map(([field,mode])=>[field,writeScopes.includes('personal.approval')&&mode==='approval'?'approval':mode==='none'?'none':'view'])),
  documentCategories:{self:{},others:view(level.documentCategories.others)}}
 await validateDelegation(env,actor,definition as Parameters<typeof validateDelegation>[2],data,true)
 const sensitive=level.permissions.some(p=>['pay.read','payroll.handoff','people.private','documents.private'].includes(p)) || Object.values(level.compensationFields.others).some(mode=>mode!=='none') || Object.entries(level.otherFields).some(([field,mode])=>!['legalName','preferredName'].includes(field)&&mode!=='none') || Object.values(level.documentCategories.others).some(mode=>mode!=='none')
 return !actor.owner&&sensitive
}
async function audited<T>(env:Bindings,actor:Actor,operation:string,run:()=>Promise<T>) {
 try{return await run()}catch(error){if(error instanceof WillowError)await auditRead(env,actor.id,'apiKey.denied.read',actor.id,{operation,reason:error.code});throw error}
}
function expiry(input:Input) {
 const value=input.text('expiresAt',{max:40})
 insist(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value),'invalid_expiresAt')
 const date=Date.parse(value)
 insist(Number.isSafeInteger(date)&&date>now()&&new Date(`${value.slice(0,10)}T00:00:00.000Z`).toISOString().slice(0,10)===value.slice(0,10),'invalid_expiresAt')
 return date
}
async function material(env:Bindings,actor:Actor,name:string,level:string,expiresAt:number,issuer:{id:string;version:number},writeScopes:string[]=[],needsApproval=false,credentialType:CredentialRow['credential_type']='key',redirectUri:string|null=null) {
 const selected=await one<{id:string;version:number}>(env,'SELECT id,version FROM wl_levels WHERE id=?',level)
 insist(selected,'level_not_found',404)
 const id=newId(),bytes=crypto.getRandomValues(new Uint8Array(32)),token=`${credentialType==='key'?'willow_key':'willow_client'}_${id.replaceAll('-','')}_${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`
 const row:CredentialRow={id,name,credential_type:credentialType,token_hash:await sha256Hex(token),level_id:level,level_version:selected.version,issued_by:actor.id,issuer_operator:issuer.id,issuer_version:issuer.version,issued_at:now(),expires_at:expiresAt,last_used_at:null,revoked_at:null,revocation_reason:null,replaced_by:null,write_scopes:JSON.stringify(writeScopes),needs_approval:needsApproval?1:0,approved_by:null,approval_reason:null,redirect_uri:redirectUri}
 insist(expiresAt>row.issued_at,'invalid_expiresAt')
 return {row,token,statements:[guard(env,'access_changed','EXISTS(SELECT 1 FROM wl_levels WHERE id=? AND version=?)',level,selected.version),stmt(env,`INSERT INTO wl_api_credentials(id,name,token_hash,level_id,level_version,issued_by,issuer_operator,issuer_version,issued_at,expires_at,write_scopes,needs_approval,credential_type,redirect_uri) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,name,row.token_hash,level,selected.version,actor.id,issuer.id,issuer.version,row.issued_at,expiresAt,row.write_scopes,row.needs_approval,credentialType,redirectUri)]}
}
export async function issueCredential(env:Bindings,actor:Actor,input:Input) {
 return audited(env,actor,'issue',async()=>{
  input.only(['name','level','expiresAt','writeScopes','credentialType','redirectUri','returnTo'])
  const credentialType=input.text('credentialType',{optional:true})||'key'
  insist(credentialType==='key'||credentialType==='oauth_client','invalid_credential_type')
  const redirectUri=input.text('redirectUri',{optional:true,max:1000})||null
  if(redirectUri){let uri:URL;try{uri=new URL(redirectUri)}catch{throw new WillowError('invalid_redirect_uri',400)};insist(credentialType==='oauth_client'&&uri.protocol==='https:'&&!uri.username&&!uri.password&&!uri.hash,'invalid_redirect_uri')}
  const writeScopes=input.provided('writeScopes')?input.json('writeScopes'):[]
  insist(Array.isArray(writeScopes)&&new Set(writeScopes).size===writeScopes.length&&writeScopes.every(scope=>['personal.approval','job.approval','compensation.approval','leave.approval','webhooks.manage'].includes(scope)),'invalid_write_scopes')
  const authority=await administratorAuthority(env,actor),level=input.text('level')
  const needsApproval=await credentialCeiling(env,authority.actor,level,writeScopes as string[])
  const prepared=await material(env,authority.actor,input.text('name'),level,expiry(input),authority.row,writeScopes as string[],needsApproval,credentialType,redirectUri)
  await commit(env,[authority.fence,...prepared.statements],{actor:actor.id,action:'apiKey.issue',subject:prepared.row.id,detail:{level,expiresAt:prepared.row.expires_at,needsApproval}})
  return {...credentialMetadata(prepared.row),token:prepared.token}
 })
}
export async function approveCredential(env:Bindings,actor:Actor,input:Input) {
 return audited(env,actor,'approve',async()=>{
  input.only(['credential','reason','returnTo'])
  const authority=await administratorAuthority(env,actor),id=input.text('credential'),reason=input.text('reason',{max:400})
  const row=await one<CredentialRow>(env,'SELECT * FROM wl_api_credentials WHERE id=?',id)
  insist(row,'not_found',404)
  insist(row.issued_by!==actor.id,'independent_approval_required',403)
  insist(row.needs_approval&&!row.approved_by&&!row.revoked_at&&row.expires_at>now(),'credential_inactive',409)
  await credentialCeiling(env,authority.actor,row.level_id,JSON.parse(row.write_scopes))
  const definition=(await levels(env,authority.actor)).levels.find(level=>level.id===row.level_id)!
  const view=(rules:Record<string,string>,scope?:string)=>Object.fromEntries(Object.entries(rules).map(([field,mode])=>[field,mode==='none'?'none':scope&&JSON.parse(row.write_scopes).includes(scope)&&['approval','edit'].includes(mode)?'approval':'view']))
  const approvedScope={level:row.level_id,version:row.level_version,scope:definition.scope,permissions:definition.permissions.filter(p=>READ_PERMISSIONS.includes(p)),jobFields:view(definition.jobFields.others,'job.approval'),leaveFields:view(definition.leaveFields.others,'leave.approval'),compensationFields:view(definition.compensationFields.others,'compensation.approval'),otherFields:Object.fromEntries(Object.entries(definition.otherFields).map(([field,mode])=>[field,JSON.parse(row.write_scopes).includes('personal.approval')&&mode==='approval'?'approval':mode==='none'?'none':'view'])),documentCategories:view(definition.documentCategories.others),reports:definition.reports,writeScopes:JSON.parse(row.write_scopes)}
  await commit(env,[authority.fence,guard(env,'access_changed',`EXISTS(SELECT 1 FROM wl_api_credentials c JOIN wl_levels l ON l.id=c.level_id JOIN oa_operators o ON o.id=c.issuer_operator JOIN wl_members m ON m.id=c.issued_by WHERE c.id=? AND c.revoked_at IS NULL AND c.approved_by IS NULL AND c.expires_at>? AND l.version=c.level_version AND o.version=c.issuer_version AND o.status='active' AND m.status='active' AND (o.role='owner' OR (EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=m.id AND permission='people.manage') AND EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=m.id AND permission='access.admin'))))`,id,now()),stmt(env,'UPDATE wl_api_credentials SET approved_by=?,approval_reason=?,approver_operator=?,approver_version=?,approval_scope=? WHERE id=?',actor.id,reason,authority.row.id,authority.row.version,JSON.stringify(approvedScope),id)],{actor:actor.id,action:'apiKey.approve',subject:id,detail:{requester:row.issued_by,issuer:row.issued_by,approver:actor.id,reason,...approvedScope}})
  return {id,approved:true}
 })
}
export async function listCredentials(env:Bindings,actor:Actor) {
 const authority=await administratorAuthority(env,actor)
 const rows=await all<CredentialRow>(env,'SELECT * FROM wl_api_credentials ORDER BY issued_at DESC,id')
 await commit(env,[authority.fence],{actor:actor.id,action:'apiKey.list.read',subject:'credentials'})
 return rows.map(credentialMetadata)
}
export async function revokeCredential(env:Bindings,actor:Actor,input:Input) {
 input.only(['credential','reason','returnTo'])
 const authority=await administratorAuthority(env,actor),id=input.text('credential'),row=await one<CredentialRow>(env,'SELECT * FROM wl_api_credentials WHERE id=?',id)
 insist(row,'not_found',404)
 insist(authority.actor.owner||row.issued_by===actor.id||row.approved_by===actor.id,'credential_owner_required',403)
 await commit(env,[authority.fence,stmt(env,"UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,?),revocation_reason=COALESCE(revocation_reason,'owner_revoked') WHERE id=?",now(),id)],{actor:actor.id,action:'apiKey.revoke',subject:id,detail:{requester:row.issued_by,approver:row.approved_by,reason:input.text('reason',{optional:true,max:400})||'Explicit credential revocation',level:row.level_id,version:row.level_version}})
 return {id,revoked:true}
}
export async function rotateCredential(env:Bindings,actor:Actor,input:Input) {
 input.only(['credential','expiresAt','returnTo'])
 const authority=await administratorAuthority(env,actor),id=input.text('credential'),row=await one<CredentialRow>(env,'SELECT * FROM wl_api_credentials WHERE id=?',id)
 insist(row,'not_found',404)
 insist(authority.actor.owner||row.issued_by===actor.id,'credential_owner_required',403)
 insist(!row.revoked_at&&row.expires_at>now(),'credential_inactive',409)
 const needsApproval=await credentialCeiling(env,authority.actor,row.level_id,JSON.parse(row.write_scopes))
 const prepared=await material(env,authority.actor,row.name,row.level_id,expiry(input),authority.row,JSON.parse(row.write_scopes),needsApproval,row.credential_type,row.redirect_uri??null)
 await commit(env,[authority.fence,guard(env,'stale','EXISTS(SELECT 1 FROM wl_api_credentials WHERE id=? AND revoked_at IS NULL AND expires_at>?)',id,now()),...prepared.statements,stmt(env,"UPDATE wl_api_credentials SET revoked_at=?,revocation_reason='rotated',replaced_by=? WHERE id=?",now(),prepared.row.id,id)],{actor:actor.id,action:'apiKey.rotate',subject:id,detail:{replacement:prepared.row.id}})
 return {...credentialMetadata(prepared.row),token:prepared.token}
}
