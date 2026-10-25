// Confidential employer tools exchange a one-time client secret for bounded non-person tokens.
import type { Bindings } from '../../auth.server'
import { commit, now, one, sha256Hex, stmt, WillowError } from '../core'
import { credentialFence, credentialResponse, credentialValid, currentCredentialPrincipal, recordCredentialUse } from './authenticate'
import type { CredentialRow } from './store'

const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff'}})
export async function oauthTokenResponse(env:Bindings,request:Request):Promise<Response> {
 const fail=(error:string,status=400)=>{
  const result=response({error},status)
  if(status===401)result.headers.set('WWW-Authenticate','Basic realm="Willow OAuth"')
  return credentialResponse(request,result)
 }
 if(request.method!=='POST')return new Response(null,{status:405,headers:{allow:'POST','cache-control':'no-store'}})
 if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return fail('invalid_request')
 // Bound parsing even when no Content-Length was supplied. Neither body nor authentication is logged.
 const reader=request.body?.getReader();if(!reader)return fail('invalid_request')
 let size=0;const chunks:Uint8Array[]=[]
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return fail('invalid_request')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const form=new URLSearchParams(new TextDecoder().decode(bytes))
 if([...form.keys()].some(key=>!['grant_type','scope'].includes(key))||[...new Set(form.keys())].some(key=>form.getAll(key).length!==1))return fail('invalid_request')
 let id='',secret=''
 try {
  const header=request.headers.get('authorization')??''
  if(!/^Basic [A-Za-z0-9+/]+=*$/i.test(header)||header.length>1024)return fail('invalid_client',401)
  const decoded=atob(header.slice(6)),split=decoded.indexOf(':')
  if(split<0)return fail('invalid_client',401)
  id=decodeURIComponent(decoded.slice(0,split).replaceAll('+',' '));secret=decodeURIComponent(decoded.slice(split+1).replaceAll('+',' '))
 }catch{return fail('invalid_client',401)}
 const row=await one<CredentialRow>(env,"SELECT * FROM wl_api_credentials WHERE id=? AND token_hash=? AND credential_type='oauth_client'",id,await sha256Hex(secret))
 if(!row||!await credentialValid(env,row.id))return fail('invalid_client',401)
 try {
  await recordCredentialUse(env,row,request,'oauthToken')
  if(form.get('grant_type')!=='client_credentials')return fail('unsupported_grant_type')
  const scopes=['level.read',...JSON.parse(row.write_scopes) as string[]].sort()
  if(form.has('scope')&&form.get('scope')!.split(' ').sort().join(' ')!==scopes.join(' '))return fail('invalid_scope')
  const actor=await currentCredentialPrincipal(env,row.id),time=now(),expiresAt=Math.min(time+3600000,row.expires_at)
  const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
  const token='willow_access_'+crypto.randomUUID().replaceAll('-','')+'_'+random()
  await commit(env,[credentialFence(env,actor),stmt(env,'DELETE FROM wl_oauth_tokens WHERE expires_at<=?',time),stmt(env,'INSERT INTO wl_oauth_tokens(token_hash,client_id,expires_at) VALUES(?,?,?)',await sha256Hex(token),row.id,expiresAt)],{actor:actor.id,action:'oauth.token.read',subject:row.id,detail:{expiresAt}})
  return credentialResponse(request,response({access_token:token,token_type:'Bearer',expires_in:Math.max(0,Math.floor((expiresAt-time)/1000)),scope:scopes.join(' ')}))
 }catch(error){
  if(error instanceof WillowError){if(error.status===429)return fail('temporarily_unavailable',429);return fail('invalid_client',401)}
  throw error
 }
}
