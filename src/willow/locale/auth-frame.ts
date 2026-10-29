// Base auth remains byte-for-byte upstream. Only the seed's fixed presentation copy is adapted.
import { normalizeLanguage,msg,languages,inLocale } from './runtime'
import { h,select,hidden } from '../ui/html'
export const browserLanguage=(request:Request)=>normalizeLanguage(request.headers.get('cookie')?.match(/(?:^|;\s*)wl_language=([^;]+)/)?.[1]??request.headers.get('accept-language')??'en')
export function languageCookie(language:string) {return 'wl_language='+language+'; Path=/; HttpOnly; Secure; SameSite=Lax'}
export async function authFrame(response:Response,request?:Request) {
 if(!request)return response
 const language=browserLanguage(request)
 const menu=inLocale({language,path:'/signin',translations:[]},()=>h`<form class="language-choice" method="get" action="/signin">${hidden('returnTo',new URL(request.url).searchParams.get('returnTo')??'/app')}${select('Display language','language',languages,language)}<button type="submit">Save language</button></form>`)
 const rewriter=new HTMLRewriter().on('html',{element(element){element.setAttribute('lang',language)}})
 if(new URL(request.url).pathname==='/signin')rewriter.on('main',{element(element){element.append(menu.html,{html:true})}})
 // The seed knows these are fixed auth sentences. No employee record projection enters this frame.
 rewriter.on('h1,h2,label,button,a,p,title',{text(chunk){
  const original=chunk.text,trimmed=original.trim()
  let translated=msg(trimmed,language)
  if(/^Sign in to /.test(trimmed))translated=msg('Sign in to',language)+' '+trimmed.slice(11)
  if(translated!==trimmed)chunk.replace(original.replace(trimmed,translated))
 }})
 return rewriter.transform(response)
}
