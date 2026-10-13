import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { draftSources, modelAvailable, modelDraft, modelDrafts } from '../model-drafts'
import { form, h, hidden, select, table } from './html'

export async function modelDraftSection(env: Bindings, actor: Actor, url: URL) {
  const available = await modelAvailable(env), rows = await modelDrafts(env, actor)
  const id = url.searchParams.get('draft'), draft = id ? await modelDraft(env, actor, id) : null
  return h`${available ? h`<section class="card"><h2>Draft a checklist</h2><p>Uses the template's structured responsibilities and due dates. No free-form prompt or employee data is sent.</p>${form('model.draft','/app/proposals?draft={id}',select('Template revision','template',(await draftSources(env,actor)).map(t=>({value:t.id,label:`${t.name} · version ${t.version}`}))),'Request draft')}</section>` : ''}
${rows.length ? h`<section class="card"><h2>Model proposals</h2>${table(['Template','Model','Status'],rows.map(r=>[h`<a href="/app/proposals?draft=${r.id}">View checklist proposal</a>`,r.model,r.failure ?? r.status]))}</section>` : ''}
${draft ? h`<section class="card"><h2>Checklist proposal</h2><p>${draft.status} · ${draft.model}</p><p>Source: template ${draft.source.id}, revision ${draft.source.version} (${draft.source.kind}).</p>${draft.failure ? h`<p role="alert">Draft failed: ${draft.failure.replaceAll('_',' ')}. Request a new draft when the connection is ready.</p>` : h`<ol>${draft.content?.items.map((item:any)=>h`<li>${item.text}</li>`)}</ol><p>Human review required. This text does not complete tasks or change employment or leave.</p>`}${draft.status==='pending' ? h`${form('model.decide',`/app/proposals?draft=${draft.id}`,[hidden('proposal',draft.id),hidden('decision','accept')],'Accept checklist draft')}${form('model.decide',`/app/proposals?draft=${draft.id}`,[hidden('proposal',draft.id),hidden('decision','decline')],'Decline',{secondary:true})}` : ''}</section>` : ''}`
}
