import { msg } from '../locale/runtime'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { translationHome } from '../locale/store'
import { area,form,h,hidden,page,select } from './html'
export async function translationsPage(env:Bindings,actor:Actor,url:URL) {
 const data=await translationHome(env,actor)
 return page(msg('Employer translations'),actor,h`<h1>Employer translations</h1><p>Translations apply to this exact source version. Changing the original requires a new translation. Values and permissions stay the same.</p>${data.sources.map(s=>h`<details><summary>${s.kind}: ${s.original.slice(0,100)}</summary>${form('translation.write','/app/translations',[hidden('kind',s.kind),hidden('source',s.source),hidden('field',s.field),hidden('original',s.original),select('Language','language',data.languages.filter(l=>l.value!=='en')),area('Translation','translated',data.translations.find(t=>t.kind===s.kind&&t.source===s.source&&t.field===s.field&&t.language==='es-US'&&t.original===s.original)?.translated??'')],'Save translation')}</details>`)}`,{url})
}
