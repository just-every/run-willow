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
 const wantsJson=request.headers.get('accept')?.includes('application/json') || request.headers.get('content-type')?.startsWith('application/json')
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'strict-origin','x-content-type-options':'nosniff'}})
 try {
  if(!['GET','HEAD','POST'].includes(request.method)) return new Response(null,{status:405,headers:{allow:'GET, HEAD, POST'}})
  if(request.method==='POST') {
   if(request.headers.get('origin')!==env.AUTH_ORIGIN) return json({error:'invalid_origin'},403)
   const input=await Input.from(request)
   const result=found.name==='preboarding' ? await submitPacket(env,found.id,input) : await submitApplicant(env,found.id,input)
   if(wantsJson) return json(result)
   return new Response(null,{status:303,headers:{location:url.pathname+'?notice=Your+answers+were+saved.','cache-control':'no-store','referrer-policy':'strict-origin'}})
  }
  if(found.name==='preboarding') {
   const data=await packetInvitation(env,found.id)
   if(wantsJson) return json(data)
   return invitationPage('preboarding',{...data,expiresAt:data.packet.expiresAt},url.pathname,url)
  }
  const data=await applicantInvitation(env,found.id)
  return wantsJson ? json(data) : invitationPage('applicant',data,url.pathname,url)
 } catch(error) {
  if(!(error instanceof WillowError) && !(error instanceof AuthError)) throw error
  if(wantsJson) return json({error:error.code},error.status)
  const correctable=request.method==='POST' && [400,409].includes(error.status)
  const response=correctable ? page('Could not save your answers',null,h`<h1>Could not save your answers</h1><p>${error.code.replaceAll('_',' ')}.</p><p><a href="${url.pathname}">Return to your form</a></p>`,{status:error.status,showNav:false}) : page('Invitation unavailable',null,h`<h1>Invitation unavailable</h1><p>This invitation cannot be opened. Ask the sender for a current invitation.</p>`,{status:error.status,showNav:false})
  response.headers.set('referrer-policy','strict-origin')
  return response
 }
}
