import { CONSENT } from './sign/custody'
import { sha256Hex } from './core'
import { inLocale,localeContext,locale,normalizeLanguage,errorMessage,msg } from './locale/runtime'
import { languageFor,languageStatement } from './locale/store'
import { packetByToken,activeGuard } from './preboarding/store'
import { invitation as applicantToken,invitationGuard } from './eeo-applicants/store'
import { commit } from './core'
import { packetSignature,signPacket,packetSignatureFile } from './preboarding/signing'
// Public invitation authority is scoped to one EEO record, never a Willow session.
import type { Bindings } from '../auth.server'
import { AuthError } from '../modules/operator-auth/index.mjs'
import { WillowError } from './core'
import { INVITATION_DOORS, match } from './doors'
import { Input } from './input'
import { packetInvitation, submitPacket } from './preboarding'
import { applicantInvitation, submitApplicant } from './eeo-applicants'
import { invitationPage } from './ui/eeo-invitations'
import { h, page } from './ui/html'

export async function invitationResponse(env: Bindings,request: Request,url: URL): Promise<Response|null> {
 const found=match(INVITATION_DOORS,url.pathname)
 if(!found) return null
 const identity=found.name==='preboarding'?await packetByToken(env,found.id).catch(()=>null):await applicantToken(env,found.id).catch(()=>null)
 const subject=identity?('application_id' in identity?identity.application_id:identity.id):''
 const language=subject?await languageFor(env,found.name,subject,request.headers.get('accept-language')??'en'):normalizeLanguage(request.headers.get('accept-language')??'en')
 return inLocale({...localeContext()!,language,path:url.pathname,invitation:true},()=>localizedInvitation(env,request,url,found,identity,subject))
}
async function localizedInvitation(env:Bindings,request:Request,url:URL,found:{name:string;id:string},identity:any,subject:string):Promise<Response> {
 const wantsJson=request.headers.get('accept')?.includes('application/json') || request.headers.get('content-type')?.startsWith('application/json')
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'strict-origin','x-content-type-options':'nosniff'}})
 try {
  if(!['GET','HEAD','POST'].includes(request.method)) return new Response(null,{status:405,headers:{allow:'GET, HEAD, POST'}})
  if(request.method==='POST') {
   if(request.headers.get('origin')!==env.AUTH_ORIGIN) return json({error:'invalid_origin'},403)
   const input=await Input.from(request)
   if(input.has('localeAction')) {
    if(!identity)throw new WillowError('invitation_unavailable',404)
    const action=input.text('localeAction')
    if(action==='choose'){input.only(['localeAction','language']);await commit(env,[found.name==='preboarding'?activeGuard(env,identity):invitationGuard(env,identity),languageStatement(env,found.name,subject,input.text('language'))],{actor:found.name+':'+subject,action:'language.choose',subject})}
    else if(action==='sign'&&found.name==='preboarding'){const result=await signPacket(env,found.id,input,request);if(wantsJson)return json(result)}
    else throw new WillowError('unexpected_input')
    return new Response(null,{status:303,headers:{location:url.pathname,'cache-control':'no-store'}})
   }
   const result=found.name==='preboarding' ? await submitPacket(env,found.id,input) : await submitApplicant(env,found.id,input)
   if(wantsJson) return json(result)
   return new Response(null,{status:303,headers:{location:url.pathname+'?notice=Your+answers+were+saved.','cache-control':'no-store','referrer-policy':'strict-origin'}})
  }
  if(found.name==='preboarding') {
   if(url.searchParams.has('document'))return packetSignatureFile(env,found.id,url.searchParams.get('document')==='signed')
   const data=await packetInvitation(env,found.id)
   const signature=await packetSignature(env,data.packet.id)
   if(wantsJson) return json({...data,language:locale(),signature})
   return invitationPage('preboarding',{...data,signature,consentDigest:await sha256Hex(msg(CONSENT)),expiresAt:data.packet.expiresAt},url.pathname,url)
  }
  const data=await applicantInvitation(env,found.id)
  return wantsJson ? json({...data,language:locale()}) : invitationPage('applicant',data,url.pathname,url)
 } catch(error) {
  if(!(error instanceof WillowError) && !(error instanceof AuthError)) throw error
  if(wantsJson) return json({error:error.code,message:errorMessage(error.code)},error.status)
  const correctable=request.method==='POST' && [400,409].includes(error.status)
  const response=correctable ? page(msg('Could not save your answers'),null,h`<h1>Could not save your answers</h1><p>${errorMessage(error.code)}</p><p><a href="${url.pathname}">Return to your form</a></p>`,{status:error.status,showNav:false}) : page(msg('Invitation unavailable'),null,h`<h1>Invitation unavailable</h1><p>This invitation cannot be opened. Ask the sender for a current invitation.</p>`,{status:error.status,showNav:false})
  response.headers.set('referrer-policy','strict-origin')
  return response
 }
}
