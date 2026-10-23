// Owner-managed credential custody. Only the issuing response carries bearer bytes.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, sha256Hex, stmt } from '../core'
import type { Input } from '../input'

export interface CredentialRow {
 id:string; name:string; token_hash:string; level_id:string; level_version:number;
 issued_by:string; issuer_operator:string; issuer_version:number; issued_at:number; expires_at:number;
 last_used_at:number|null; revoked_at:number|null; revocation_reason:string|null; replaced_by:string|null; write_scopes:string;
}
export const credentialMetadata=(row:CredentialRow)=>({id:row.id,name:row.name,level:row.level_id,levelVersion:row.level_version,issuedBy:row.issued_by,issuedAt:row.issued_at,expiresAt:row.expires_at,lastUsedAt:row.last_used_at,revokedAt:row.revoked_at,revocationReason:row.revocation_reason,replacedBy:row.replaced_by,readOnly:JSON.parse(row.write_scopes).length===0,writeScopes:JSON.parse(row.write_scopes) as string[]})
export type CredentialMetadata=ReturnType<typeof credentialMetadata>

async function ownerAuthority(env:Bindings,actor:Actor) {
 const row=await one<{id:string;version:number}>(env,`SELECT o.id,o.version FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email)
 WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND o.role='owner' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?`,actor.sessionId,actor.id,now())
 insist(actor.owner&&row,'owner_required',403)
 return {row,fence:guard(env,'access_changed',`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email)
 WHERE s.id=? AND m.id=? AND m.status='active' AND o.id=? AND o.version=? AND o.status='active' AND o.role='owner' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`,actor.sessionId,actor.id,row.id,row.version,now())}
}
function expiry(input:Input) {
 const value=input.text('expiresAt',{max:40})
 insist(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value),'invalid_expiresAt')
 const date=Date.parse(value)
 insist(Number.isSafeInteger(date)&&date>now()&&new Date(`${value.slice(0,10)}T00:00:00.000Z`).toISOString().slice(0,10)===value.slice(0,10),'invalid_expiresAt')
 return date
}
async function material(env:Bindings,actor:Actor,name:string,level:string,expiresAt:number,issuer:{id:string;version:number},writeScopes:string[]=[]) {
 const selected=await one<{id:string;version:number}>(env,'SELECT id,version FROM wl_levels WHERE id=?',level)
 insist(selected,'level_not_found',404)
 const id=newId(),bytes=crypto.getRandomValues(new Uint8Array(32)),token=`willow_key_${id.replaceAll('-','')}_${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`
 const row:CredentialRow={id,name,token_hash:await sha256Hex(token),level_id:level,level_version:selected.version,issued_by:actor.id,issuer_operator:issuer.id,issuer_version:issuer.version,issued_at:now(),expires_at:expiresAt,last_used_at:null,revoked_at:null,revocation_reason:null,replaced_by:null,write_scopes:JSON.stringify(writeScopes)}
 insist(expiresAt>row.issued_at,'invalid_expiresAt')
 return {row,token,statements:[guard(env,'access_changed','EXISTS(SELECT 1 FROM wl_levels WHERE id=? AND version=?)',level,selected.version),stmt(env,`INSERT INTO wl_api_credentials(id,name,token_hash,level_id,level_version,issued_by,issuer_operator,issuer_version,issued_at,expires_at,write_scopes) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,id,name,row.token_hash,level,selected.version,actor.id,issuer.id,issuer.version,row.issued_at,expiresAt,row.write_scopes)]}
}
export async function issueCredential(env:Bindings,actor:Actor,input:Input) {
 input.only(['name','level','expiresAt','writeScopes','returnTo'])
 const writeScopes=input.provided('writeScopes')?input.json('writeScopes'):[]
 insist(Array.isArray(writeScopes)&&new Set(writeScopes).size===writeScopes.length&&writeScopes.every(scope=>['personal.approval','webhooks.manage'].includes(scope)),'invalid_write_scopes')
 const authority=await ownerAuthority(env,actor),prepared=await material(env,actor,input.text('name'),input.text('level'),expiry(input),authority.row,writeScopes as string[])
 await commit(env,[authority.fence,...prepared.statements],{actor:actor.id,action:'apiKey.issue',subject:prepared.row.id,detail:{level:prepared.row.level_id,expiresAt:prepared.row.expires_at}})
 return {...credentialMetadata(prepared.row),token:prepared.token}
}
export async function listCredentials(env:Bindings,actor:Actor) {
 const authority=await ownerAuthority(env,actor)
 const rows=await all<CredentialRow>(env,'SELECT * FROM wl_api_credentials ORDER BY issued_at DESC,id')
 await commit(env,[authority.fence],{actor:actor.id,action:'apiKey.list.read',subject:'credentials'})
 return rows.map(credentialMetadata)
}
export async function revokeCredential(env:Bindings,actor:Actor,input:Input) {
 input.only(['credential','returnTo'])
 const authority=await ownerAuthority(env,actor),id=input.text('credential'),row=await one<CredentialRow>(env,'SELECT * FROM wl_api_credentials WHERE id=?',id)
 insist(row,'not_found',404)
 await commit(env,[authority.fence,stmt(env,"UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,?),revocation_reason=COALESCE(revocation_reason,'owner_revoked') WHERE id=?",now(),id)],{actor:actor.id,action:'apiKey.revoke',subject:id})
 return {id,revoked:true}
}
export async function rotateCredential(env:Bindings,actor:Actor,input:Input) {
 input.only(['credential','expiresAt','returnTo'])
 const authority=await ownerAuthority(env,actor),id=input.text('credential'),row=await one<CredentialRow>(env,'SELECT * FROM wl_api_credentials WHERE id=?',id)
 insist(row,'not_found',404)
 insist(!row.revoked_at&&row.expires_at>now(),'credential_inactive',409)
 const prepared=await material(env,actor,row.name,row.level_id,expiry(input),authority.row,JSON.parse(row.write_scopes))
 await commit(env,[authority.fence,guard(env,'stale','EXISTS(SELECT 1 FROM wl_api_credentials WHERE id=? AND revoked_at IS NULL AND expires_at>?)',id,now()),...prepared.statements,stmt(env,"UPDATE wl_api_credentials SET revoked_at=?,revocation_reason='rotated',replaced_by=? WHERE id=?",now(),prepared.row.id,id)],{actor:actor.id,action:'apiKey.rotate',subject:id,detail:{replacement:prepared.row.id}})
 return {...credentialMetadata(prepared.row),token:prepared.token}
}
