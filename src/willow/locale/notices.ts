import { sendMobileNotice } from '../mobile/push'
import type { Bindings } from '../../auth.server'
import { languageFor } from './store'
import { msg } from './runtime'
/** Only fixed, value-free notification producers use this adapter. Never pass employer prose. */
export async function sendFixedNotice(env:Bindings,kind:string,subject:string,sender:any,message:any) {
 const language=await languageFor(env,kind,subject)
 const prefixes=['A scheduled report is ready. Sign in to view your permitted report:','Sign in to view it:','Sign in to Willow:','Open your private step:','Invitation issued:','Complete voluntary self-identification:']
 const fragment=(part:string)=>{const prefix=prefixes.find(p=>part.startsWith(p));return prefix?msg(prefix,language)+part.slice(prefix.length):msg(part,language)}
 const text=(part:string)=>part.replace(/^(\s*)([\s\S]*?)(\s*)$/,(_,a,b,c)=>a+fragment(b)+c)
 const html=message.html?.replace(/>([^<]+)</g,(_:string,value:string)=>'>'+text(value)+'<')
 const plain=message.text?.split('\n').map(fragment).join('\n')
 const result=await sender.send({...message,subject:msg(message.subject,language),html,text:plain})
 if(kind==='member')await sendMobileNotice(env,subject).catch(()=>{})
 return result
}
