// Confidential employer apps retain a non-person principal through every grant.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import type { Input } from '../input'
import { commit, guard, insist, now, one, sha256Hex, stmt, WillowError } from '../core'
import { credentialGrantFence, credentialResponse, credentialValid, recordCredentialUse } from './authenticate'
import { administratorAuthority, credentialCeiling, type CredentialRow } from './store'

const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff'}})
const opaque=(kind:string)=>'willow_'+kind+'_'+crypto.randomUUID().replaceAll('-','')+'_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
export const oauthScopes=(row:CredentialRow)=>['level.read',...JSON.parse(row.write_scopes) as string[]].sort().join(' ')
const challenge=async(verifier:string)=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')

/** Validate locally before displaying consent or allowing a redirect to a partner. */
export async function oauthConsent(env:Bindings,actor:Actor,input:Input) {
 const authority=await administratorAuthority(env,actor),id=input.text('client'),redirectUri=input.text('redirectUri',{max:1000}),pkce=input.text('codeChallenge')
 insist(input.text('codeChallengeMethod')==='S256'&&/^[A-Za-z0-9_-]{43}$/.test(pkce),'invalid_code_challenge')
 input.text('state',{max:500})
 const row=await one<CredentialRow>(env,"SELECT * FROM wl_api_credentials WHERE id=? AND credential_type='oauth_client'",id)
 insist(row&&row.redirect_uri===redirectUri&&await credentialValid(env,id,true),'invalid_client',401)
 await credentialCeiling(env,authority.actor,row.level_id,JSON.parse(row.write_scopes))
 return {authority,row}
}

/** Explicit employer installation consent; never employee impersonation or automatic outbound navigation. */
export async function authorizeOAuth(env:Bindings,actor:Actor,input:Input) {
 input.only(['client','redirectUri','codeChallenge','codeChallengeMethod','state','reason'])
 const {authority,row}=await oauthConsent(env,actor,input),id=row.id,redirectUri=input.text('redirectUri'),pkce=input.text('codeChallenge'),state=input.text('state',{max:500}),reason=input.text('reason',{max:400})
 const code=opaque('code'),expiresAt=Math.min(now()+300000,row.expires_at)
 await commit(env,[authority.fence,credentialGrantFence(env,id,true),stmt(env,'DELETE FROM wl_oauth_codes WHERE expires_at<=?',now()),stmt(env,'INSERT INTO wl_oauth_codes(code_hash,client_id,redirect_uri,challenge,expires_at) VALUES(?,?,?,?,?)',await sha256Hex(code),id,redirectUri,pkce,expiresAt)],{actor:actor.id,action:'oauth.authorize',subject:id,detail:{requester:row.issued_by,installer:actor.id,level:row.level_id,version:row.level_version,rights:oauthScopes(row),reason}})
 const redirect=new URL(redirectUri);redirect.searchParams.set('code',code);redirect.searchParams.set('state',state)
 return {redirectUri:redirect.href,expiresAt}
}

export async function oauthTokenResponse(env:Bindings,request:Request):Promise<Response> {
 const fail=(error:string,status=400)=>{
  const result=response({error},status)
  if(status===401)result.headers.set('WWW-Authenticate','Basic realm="Willow OAuth"')
  return credentialResponse(request,result)
 }
 if(request.method!=='POST')return credentialResponse(request,new Response(null,{status:405,headers:{allow:'POST','cache-control':'no-store'}}))
 if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return fail('invalid_request')
 const reader=request.body?.getReader();if(!reader)return fail('invalid_request')
 let size=0;const chunks:Uint8Array[]=[]
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return fail('invalid_request')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const form=new URLSearchParams(new TextDecoder().decode(bytes))
 if([...form.keys()].some(key=>!['grant_type','scope','code','redirect_uri','code_verifier','refresh_token'].includes(key))||[...new Set(form.keys())].some(key=>form.getAll(key).length!==1))return fail('invalid_request')
 let id='',secret=''
 try {
  const header=request.headers.get('authorization')??''
  if(!/^Basic [A-Za-z0-9+/]+=*$/i.test(header)||header.length>1024)return fail('invalid_client',401)
  const decoded=atob(header.slice(6)),split=decoded.indexOf(':')
  if(split<0)return fail('invalid_client',401)
  id=decodeURIComponent(decoded.slice(0,split).replaceAll('+',' '));secret=decodeURIComponent(decoded.slice(split+1).replaceAll('+',' '))
 }catch{return fail('invalid_client',401)}
 const grant=form.get('grant_type'),pending=grant==='authorization_code'||grant==='refresh_token'
 const row=await one<CredentialRow>(env,"SELECT * FROM wl_api_credentials WHERE id=? AND token_hash=? AND credential_type='oauth_client'",id,await sha256Hex(secret))
 if(!row||!await credentialValid(env,row.id,pending))return fail('invalid_client',401)
 try {
  await recordCredentialUse(env,row,request,'oauthToken',pending)
  if(!['client_credentials','authorization_code','refresh_token'].includes(grant??''))return fail('unsupported_grant_type')
  const granted=oauthScopes(row)
  if(form.has('scope')&&form.get('scope')!.split(' ').sort().join(' ')!==granted)return fail('invalid_scope')
  const time=now(),expiresAt=Math.min(time+3600000,row.expires_at),statements=[credentialGrantFence(env,row.id,pending)]
  if(grant==='authorization_code'){
   if(!row.redirect_uri||form.get('redirect_uri')!==row.redirect_uri||!/^[A-Za-z0-9._~-]{43,128}$/.test(form.get('code_verifier')??''))return fail('invalid_grant')
   const hash=await sha256Hex(form.get('code')??''),pkce=await challenge(form.get('code_verifier')!)
   const sql='SELECT 1 FROM wl_oauth_codes WHERE code_hash=? AND client_id=? AND redirect_uri=? AND challenge=? AND consumed_at IS NULL AND expires_at>?'
   if(!await one(env,sql,hash,row.id,row.redirect_uri,pkce,time))return fail('invalid_grant')
   statements.push(guard(env,'access_changed',`EXISTS(${sql})`,hash,row.id,row.redirect_uri,pkce,time),stmt(env,'UPDATE wl_oauth_codes SET consumed_at=? WHERE code_hash=?',time,hash))
  }else if(grant==='refresh_token'){
   if(!row.redirect_uri)return fail('invalid_grant')
   const hash=await sha256Hex(form.get('refresh_token')??''),sql='SELECT 1 FROM wl_oauth_refresh WHERE token_hash=? AND client_id=? AND consumed_at IS NULL AND expires_at>?'
   if(!await one(env,sql,hash,row.id,time))return fail('invalid_grant')
   statements.push(guard(env,'access_changed',`EXISTS(${sql})`,hash,row.id,time),stmt(env,'UPDATE wl_oauth_refresh SET consumed_at=? WHERE token_hash=?',time,hash))
  }
  const token=opaque('access'),refresh=pending?opaque('refresh'):null
  statements.push(stmt(env,'DELETE FROM wl_oauth_tokens WHERE expires_at<=?',time),stmt(env,'INSERT INTO wl_oauth_tokens(token_hash,client_id,expires_at) VALUES(?,?,?)',await sha256Hex(token),row.id,expiresAt))
  if(refresh)statements.push(stmt(env,'DELETE FROM wl_oauth_refresh WHERE expires_at<=?',time),stmt(env,'INSERT INTO wl_oauth_refresh(token_hash,client_id,expires_at) VALUES(?,?,?)',await sha256Hex(refresh),row.id,Math.min(time+30*86400000,row.expires_at)))
  await commit(env,statements,{actor:'credential:'+row.id,action:'oauth.token.read',subject:row.id,detail:{grant,expiresAt}})
  return credentialResponse(request,response({access_token:token,token_type:'Bearer',expires_in:Math.max(0,Math.floor((expiresAt-time)/1000)),scope:granted,...(refresh?{refresh_token:refresh}:{})}))
 }catch(error){
  if(error instanceof WillowError){if(error.status===429)return fail('temporarily_unavailable',429);return fail('invalid_client',401)}
  throw error
 }
}
