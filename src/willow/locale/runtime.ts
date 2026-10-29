// Display-only request state. Never translates an interpolated record or mutates a stored value.
import { AsyncLocalStorage } from 'node:async_hooks'
import catalogs from './catalogs'
export const languages = Object.entries(catalogs).map(([value, c]) => ({value,label:c.name}))
export const validLanguage = (value: string) => Object.hasOwn(catalogs,value)
export function normalizeLanguage(value:string):string {
 for(const part of value.split(',')){
  const requested=part.split(';')[0].trim().toLowerCase()
  const exact=languages.find(item=>item.value.toLowerCase()===requested)
  if(exact)return exact.value
  const base=languages.find(item=>item.value.split('-')[0].toLowerCase()===requested.split('-')[0])
  if(base)return base.value
 }
 return 'en'
}
export interface LocaleContext { language: string; translations: Translation[]; path: string; invitation?: boolean }
export interface Translation { kind: string; source: string; field: string; original: string; language: string; translated: string }
const context = new AsyncLocalStorage<LocaleContext>()
export const inLocale = <T>(state:LocaleContext,run:()=>T):T => context.run(state,run)
export const locale = () => context.getStore()?.language ?? 'en'
export const localeContext = () => context.getStore()
export function msg(text:string,language=locale()):string {
 if(text.startsWith('\u2060'))return text.slice(1)
 const catalog=catalogs[language as keyof typeof catalogs]
 return catalog?.messages[text as keyof typeof catalog.messages] ?? text
}
export function errorMessage(code:string) {
 const catalog=catalogs[locale() as keyof typeof catalogs]
 const exact=catalog?.messages[code as keyof typeof catalog.messages]
 if(exact)return exact
 if(locale()!=='en')return msg(code.startsWith('missing_')?'Complete the required fields.':code.startsWith('too_long_')?'The value is too long.':code.startsWith('invalid_')?'Review the entered values.':'The request could not be completed. Review the details and try again.')
 return code.replaceAll('_',' ')+'.'
}
export function translated(kind:string,source:string,field:string,original:string) {
 if(locale()==='en')return {text:original,untranslated:false}
 const found=context.getStore()?.translations.find(t=>t.kind===kind&&t.source===source&&t.field===field&&t.original===original&&t.language===locale())
 return {text:found?.translated??original,untranslated:!found}
}
// Translate only literal HTML text and accessibility labels. Interpolations are opaque
// sentinels here, so a person named “Home” or employer prose is never translated.
export function literalParts(strings:TemplateStringsArray):string[] {
 if(locale()==='en')return [...strings]
 const marker='\u0000',joined=strings.join(marker)
 const text=(value:string)=>value.split(marker).map(part=>part.replace(/^(\s*)([\s\S]*?)(\s*)$/,(_,a,b,c)=>a+msg(b)+c)).join(marker)
 return joined.replace(/(^|>)([^<]+)/g,(_,lead,value)=>lead+text(value))
 .replace(/(aria-label|placeholder|data-label)="([^"\x00]*)"/g,(_,key,value)=>key+'="'+msg(value).replaceAll('&','&amp;').replaceAll('"','&quot;')+'"').split(marker)
}
