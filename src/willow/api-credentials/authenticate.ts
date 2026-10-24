// Authentication is independent from operator sessions. A supplied credential never falls through to cookies.
import { V1_API_DOORS, match } from '../doors'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { WillowError, auditRead, commit, guard, insist, now, one, sha256Hex, stmt } from '../core'
import { compileCredentialPrincipal, credentialContext } from './principal'
import type { CredentialRow } from './store'

const limits=new WeakMap<Request,{count:number;reset:number}>()
export function credentialResponse(request:Request,response:Response) {
 const state=limits.get(request),reset=Math.max(0,Math.ceil(((state?.reset??(Math.floor(now()/60000)+1)*60000)-now())/1000))
 const headers=new Headers(response.headers)
 headers.set('RateLimit-Limit','120');headers.set('RateLimit-Remaining',String(Math.max(0,120-(state?.count??120))));headers.set('RateLimit-Reset',String(reset));headers.set('RateLimit-Policy','120;w=60')
 if(response.status===429)headers.set('Retry-After',String(reset))
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers})
}

export const CREDENTIAL_API_DOORS:[RegExp,string][]=[
 [/^people$/,'people'],[/^people\/[\w-]+$/,'person'],[/^organization$/,'organization'],
 [/^custom-fields$/,'customFields'],[/^record-tables$/,'recordTables'],[/^record-tables\/[a-z][a-z0-9_]*$/,'recordReport'],
 [/^leave\/[\w-]+$/,'leave'],[/^policies$/,'policies'],
 [/^builtin-reports$/,'builtinReports'],[/^builtin-reports\/[\w-]+$/,'builtinReport'],
]
export function credentialDoor(request:Request):string|null {
 if(request.method==='POST'&&['/api/willow/v1/changes','/api/willow/v1/webhooks'].includes(new URL(request.url).pathname))return 'v1Write'
 if(request.method!=='GET')return null
 const url=new URL(request.url),prefix='/api/willow/'
 if(!url.pathname.startsWith(prefix))return null
 const path=url.pathname.slice(prefix.length)
 // "me" is a human alias even on otherwise permitted person doors.
 if(path.split('/').includes('me'))return null
 if(path.startsWith('v1/'))return match(V1_API_DOORS,path.slice(3))?.name??null
 return CREDENTIAL_API_DOORS.find(([pattern])=>pattern.test(path))?.[1]??null
}
const sourceSnapshot=async(env:Bindings)=>(await one<{seq:number}>(env,"SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit WHERE action NOT LIKE '%.read' AND action<>'document.download'"))!.seq
const VALID=`c.revoked_at IS NULL AND c.expires_at>? AND l.version=c.level_version
 AND m.status='active' AND o.status='active' AND (o.role='owner' OR (EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=m.id AND permission='access.admin') AND EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=m.id AND permission='people.manage'))) AND (c.needs_approval=0 OR c.approved_by IS NOT NULL) AND o.version=c.issuer_version AND lower(o.email)=m.email`
const ADMISSION=`FROM wl_api_credentials c JOIN wl_levels l ON l.id=c.level_id JOIN wl_members m ON m.id=c.issued_by JOIN oa_operators o ON o.id=c.issuer_operator`
async function invalid(env:Bindings,id:string|null):Promise<never> {
 if(id)await auditRead(env,`credential:${id}`,'apiKey.denied.read',id,{outcome:'invalid'})
 throw new WillowError('invalid_credential',401)
}
async function credentialValid(env:Bindings,id:string) {
 return !!await one(env,`SELECT c.id ${ADMISSION} WHERE c.id=? AND ${VALID}`,id,now())
}
async function permanentlyInvalidate(env:Bindings,id:string) {
 // The write is conditional so a concurrent owner revocation retains its original cause.
 await commit(env,[stmt(env,`UPDATE wl_api_credentials SET revoked_at=COALESCE(revoked_at,?),revocation_reason=COALESCE(revocation_reason,'authority_lost') WHERE id=?`,now(),id)],{actor:`credential:${id}`,action:'apiKey.invalidate',subject:id})
}
export async function credentialActor(env:Bindings,request:Request):Promise<Actor|null> {
 const header=request.headers.get('authorization')
 if(header===null)return null
 const bearer=/^Bearer (willow_key_[a-f0-9]{32}_[a-f0-9]{64})$/i.exec(header)
 if(!bearer)return invalid(env,null)
 const row=await one<CredentialRow>(env,'SELECT * FROM wl_api_credentials WHERE token_hash=?',await sha256Hex(bearer[1]))
 if(!row)return invalid(env,null)
 if(!await credentialValid(env,row.id)) {
  if(row.revoked_at===null&&!(row.needs_approval&&!row.approved_by))await permanentlyInvalidate(env,row.id)
  return invalid(env,row.id)
 }
 const door=credentialDoor(request)
 const snapshot=await sourceSnapshot(env),actor=await compileCredentialPrincipal(env,row,snapshot),time=now(),window=Math.floor(time/60_000)
 try {
  await commit(env,[
   guard(env,'invalid_credential',`EXISTS(SELECT 1 ${ADMISSION} WHERE c.id=? AND ${VALID})`,row.id,time),
   guard(env,'credential_source_changed',"(SELECT COALESCE(MAX(seq),0) FROM wl_audit WHERE action NOT LIKE '%.read' AND action<>'document.download')=?",snapshot),
   stmt(env,`INSERT INTO wl_api_credential_limits(credential_id,window,count) VALUES(?,?,1) ON CONFLICT(credential_id) DO UPDATE SET window=excluded.window,count=CASE WHEN wl_api_credential_limits.window=excluded.window THEN wl_api_credential_limits.count+1 ELSE 1 END`,row.id,window),
   stmt(env,'UPDATE wl_api_credentials SET last_used_at=? WHERE id=?',time,row.id),
  ],{actor:actor.id,action:'apiKey.read',subject:row.id,detail:{door}})
 }catch(error) {
  // wl_guard deliberately collapses unknown guard names; inspect current admission before mapping to 401.
  if(error instanceof WillowError&&!await credentialValid(env,row.id))return invalid(env,row.id)
  throw error
 }
 const limit=await one<{count:number}>(env,'SELECT count FROM wl_api_credential_limits WHERE credential_id=?',row.id)
 limits.set(request,{count:limit!.count,reset:(window+1)*60000})
 if(limit!.count>120) {
  await auditRead(env,actor.id,'apiKey.rate_limited.read',row.id)
  throw new WillowError('credential_rate_limited',429)
 }
 if(!door) {
  await auditRead(env,`credential:${row.id}`,'apiKey.denied.read',row.id,{outcome:'door_forbidden'})
  throw new WillowError('credential_read_only',403)
 }
 return actor
}

/** Call after the real native projection and before returning bytes. Read audits do not invalidate it. */
export async function assertCredentialCurrent(env:Bindings,actor:Actor) {
 const context=credentialContext(actor)
 if(!context)return
 if(!await credentialValid(env,context.id))return invalid(env,context.id)
 insist(await sourceSnapshot(env)===context.snapshot,'credential_source_changed',409)
}

/** Recompile non-person requesters at HR decision time; no member is impersonated. */
export async function currentCredentialPrincipal(env:Bindings,id:string,instant?:number) {
 const row=await one<CredentialRow>(env,'SELECT * FROM wl_api_credentials WHERE id=?',id)
 if(!row||!await credentialValid(env,id))return invalid(env,id)
 return compileCredentialPrincipal(env,row,await sourceSnapshot(env),instant)
}
export function credentialFence(env:Bindings,actor:Actor) {
 const context=credentialContext(actor)
 insist(context,'invalid_credential',401)
 return guard(env,'access_changed',`EXISTS(SELECT 1 ${ADMISSION} WHERE c.id=? AND ${VALID}) AND (SELECT COALESCE(MAX(seq),0) FROM wl_audit WHERE action NOT LIKE '%.read' AND action<>'document.download')=?`,context.id,now(),context.snapshot)
}
