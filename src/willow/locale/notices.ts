import type { Bindings } from '../../auth.server'
import { languageFor } from './store'
import { msg } from './runtime'
/** Only fixed, value-free notification producers use this adapter. Never pass employer prose. */
export async function sendFixedNotice(env:Bindings,kind:string,subject:string,sender:any,message:any) {
 const language=await languageFor(env,kind,subject)
 const text=(part:string)=>part.replace(/^(\s*)([\s\S]*?)(\s*)$/,(_,a,b,c)=>a+msg(b,language)+c)
 const html=message.html?.replace(/>([^<]+)</g,(_:string,value:string)=>'>'+text(value)+'<')
 const plain=message.text?.split('\n').map((line:string)=>{
  for(const prefix of ['Sign in to view it:','Sign in to Willow:','Open your private step:','Invitation issued:','Complete voluntary self-identification:'])if(line.startsWith(prefix))return msg(prefix,language)+line.slice(prefix.length)
  return msg(line,language)
 }).join('\n')
 return sender.send({...message,subject:msg(message.subject,language),html,text:plain})
}
