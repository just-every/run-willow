import { session } from '../sign/custody'
import { authorityGuard } from '../preboarding/store'
import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all,commit,guard,insist,now,one,stmt } from '../core'
import type { Input } from '../input'
import { languages,normalizeLanguage,validLanguage,type Translation } from './runtime'
export async function languageFor(env:Bindings,kind:string,subject:string,fallback='en') {
 const own=await one(env,'SELECT language FROM wl_display_languages WHERE kind=? AND subject=?',kind,subject)
 if(own)return normalizeLanguage(own.language)
 if(kind==='member'){
  const inherited=await one(env,"SELECT l.language FROM wl_members m JOIN wl_preboard_packets p ON p.linked_person_id=m.person_id JOIN wl_display_languages l ON l.kind='preboarding' AND l.subject=p.id WHERE m.id=? ORDER BY p.created_at DESC LIMIT 1",subject)
  if(inherited)return normalizeLanguage(inherited.language)
 }
 return normalizeLanguage(fallback)
}
export const translationData=(env:Bindings)=>all<Translation>(env,'SELECT kind,source,field,original,language,translated FROM wl_translations')
export function languageStatement(env:Bindings,kind:string,subject:string,language:string) {
 insist(validLanguage(language),'invalid_language')
 return stmt(env,'INSERT INTO wl_display_languages(kind,subject,language) VALUES(?,?,?) ON CONFLICT(kind,subject) DO UPDATE SET language=excluded.language',kind,subject,language)
}
export async function chooseLanguage(env:Bindings,actor:Actor,input:Input) {
 input.only(['language','returnTo'])
 const language=input.text('language',{max:40})
 await commit(env,[session(env,actor),languageStatement(env,'member',actor.id,language)],{actor:actor.id,action:'language.choose',subject:actor.id})
 return {language}
}
// Every target is an existing employer-authored source. A translation is bound to its
// exact text/version; editing the source immediately makes the translation fall back.
export async function translationSources(env:Bindings,actor:Actor) {
 requirePermission(actor,'people.manage')
 const sources:{kind:string;source:string;field:string;original:string}[]=[]
 const add=(kind:string,source:string,field:string,original:string)=>sources.push({kind,source,field,original})
 for(const row of await all(env,'SELECT id,label,validation_json FROM wl_custom_field_versions')) {
  add('customField',row.id,'label',row.label)
  for(const option of JSON.parse(row.validation_json).options??[])add('customField',row.id,'option:'+option.value,option.label)
 }
 for(const row of await all(env,'SELECT id,title,body FROM wl_company_announcement_versions')) {add('announcement',row.id,'title',row.title);add('announcement',row.id,'body',row.body)}
 for(const row of await all(env,'SELECT id,name FROM wl_templates'))add('workflow',row.id,'name',row.name)
 for(const row of await all(env,'SELECT id,template_id,position,title FROM wl_template_tasks'))add('task',row.template_id+':'+row.position,'title',row.title)
 for(const row of await all(env,'SELECT id,title,cover_text FROM wl_sign_templates')){add('signatureTemplate',row.id,'title',row.title);if(row.cover_text)add('signatureTemplate',row.id,'cover',row.cover_text)}
 for(const row of await all(env,'SELECT id,name,questions_json FROM wl_surveys')) {add('survey',row.id,'name',row.name);for(const q of JSON.parse(row.questions_json)){add('survey',row.id,'question:'+q.key,q.label);for(const option of q.options??[])add('survey',row.id,'option:'+q.key+':'+option,option)}}
 for(const row of await all(env,'SELECT p.opening_id,p.description,o.name FROM wl_career_publications p JOIN wl_hiring_openings o ON o.id=p.opening_id')){add('career',row.opening_id,'name',row.name);add('career',row.opening_id,'description',row.description)}
 return sources
}
export async function translationHome(env:Bindings,actor:Actor) {return {languages,sources:await translationSources(env,actor),translations:await translationData(env)}}
export async function writeTranslation(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 input.only(['kind','source','field','language','original','translated','returnTo'])
 const kind=input.text('kind',{max:40}),source=input.text('source',{max:100}),field=input.text('field',{max:500}),language=input.text('language',{max:40}),original=input.text('original',{max:20000}),translated=input.text('translated',{max:20000})
 insist(language!=='en'&&validLanguage(language),'invalid_language')
 const sequence=(await one(env,'SELECT COALESCE(MAX(seq),0) AS n FROM wl_audit'))!.n
 insist((await translationSources(env,actor)).some(s=>s.kind===kind&&s.source===source&&s.field===field&&s.original===original),'translation_source_changed',409)
 await commit(env,[session(env,actor),authorityGuard(env,actor,'people.manage'),guard(env,'translation_source_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',sequence),
 stmt(env,'INSERT INTO wl_translations VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(kind,source,field,language) DO UPDATE SET original=excluded.original,translated=excluded.translated,recorded_by=excluded.recorded_by,recorded_at=excluded.recorded_at',kind,source,field,original,language,translated,actor.id,now())],{actor:actor.id,action:'translation.write',subject:source,detail:{kind,field,language}})
 return {source,field,language}
}
