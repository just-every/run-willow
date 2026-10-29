// Invitation-scoped native receipt, distinct from voluntary EEO answers and HR approval.
import { PDFDocument,StandardFonts } from 'pdf-lib'
import type { Bindings } from '../../auth.server'
import { commit,guard,insist,now,one,sha256Hex,stmt } from '../core'
import type { Input } from '../input'
import { serve,store } from '../files'
import { CONSENT } from '../sign/custody'
import { locale,msg,inLocale,localeContext,validLanguage } from '../locale/runtime'
import { packetByToken,activeGuard } from './store'
export const RECEIPT='I acknowledge receipt of this preboarding packet. This does not change my voluntary EEO answers.'
async function pdf(name:string,at:number|null) {
 const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica),page=document.addPage([612,792])
 const lines=[msg('Preboarding packet receipt'),msg(RECEIPT),msg(CONSENT),msg('Signature name')+': '+name,msg('Language')+': '+locale(),...(at?[msg('Signed at')+': '+new Date(at).toISOString()]:[])]
 let y=735
 for(const line of lines) {const words=line.split(' ');let current='';for(const word of words){if(font.widthOfTextAtSize(current+' '+word,11)>520){page.drawText(current,{x:40,y,font,size:11});y-=18;current=''}current+=(current?' ':'')+word}page.drawText(current,{x:40,y,font,size:11});y-=30}
 return new Uint8Array(await document.save())
}
export async function packetSignature(env:Bindings,id:string) {
 const row=await one(env,'SELECT name,language,signed_at,certificate FROM wl_preboard_signatures WHERE packet_id=?',id)
 return row?{name:row.name,language:row.language,signedAt:row.signed_at,certificate:JSON.parse(row.certificate)}:null
}
export async function signPacket(env:Bindings,token:string,input:Input,request:Request) {
 input.only(['localeAction','name','consent','signingLanguage','consentDigest'])
 const language=input.text('signingLanguage',{optional:true})||locale();insist(validLanguage(language),'invalid_language')
 if(input.has('consentDigest'))insist(input.text('consentDigest')===await sha256Hex(msg(CONSENT,language)),'signature_changed',409)
 return inLocale({...localeContext()!,language},()=>signInLanguage(env,token,input,request))
}
async function signInLanguage(env:Bindings,token:string,input:Input,request:Request) {
 const packet=await packetByToken(env,token),name=input.text('name',{max:100}),at=now(),consent=msg(CONSENT)
 insist(input.flag('consent'),'signature_consent_required')
 insist(!await packetSignature(env,packet.id),'signature_closed',409)
 const stored=await store(env,{filename:'preboarding-signed.pdf',bytes:await pdf(name,at)})
 const certificate={packet:packet.id,language:locale(),consent,name,sha256:stored.sha256,signedAt:at,authentication:'scoped-invitation',ip:request.headers.get('cf-connecting-ip'),device:(request.headers.get('user-agent')??'').slice(0,300)}
 await commit(env,[activeGuard(env,packet),guard(env,'signature_closed','NOT EXISTS(SELECT 1 FROM wl_preboard_signatures WHERE packet_id=?)',packet.id),stmt(env,'INSERT INTO wl_preboard_signatures VALUES(?,?,?,?,?,?,?,?)',packet.id,name,locale(),consent,at,stored.sha256,stored.size,JSON.stringify(certificate))],{actor:'preboarding:'+packet.id,action:'preboarding.signature',subject:packet.id,detail:{language:locale(),sha256:stored.sha256}})
 return {signed:true,certificate}
}
export async function packetSignatureFile(env:Bindings,token:string,signed:boolean) {
 const packet=await packetByToken(env,token)
 if(!signed)return new Response(await pdf(packet.name,null) as BodyInit,{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="preboarding.pdf"','cache-control':'no-store'}})
 const row=await one(env,'SELECT * FROM wl_preboard_signatures WHERE packet_id=?',packet.id);insist(row,'not_found',404)
 return serve(env,{sha256:row.sha256,size:row.size,filename:'preboarding-signed.pdf',mediaType:'application/pdf'},{download:true})
}
