import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { directory } from '../profile'
import { readsLeaveField } from '../levels/leave'
import { aiSettings } from '../ai-provider'
import type { policyAnswer } from '../ai-policy'
import { area, form, h, page, select, table } from './html'

export async function policyAssistantPage(env: Bindings, actor: Actor, url: URL, answer?: Awaited<ReturnType<typeof policyAnswer>>) {
 const settings = await aiSettings(env)
 const people = settings.enabled && settings.policies ? (await directory(env,actor)).filter(person=>readsLeaveField(actor,person.id,'policies')) : []
 const choices = people.map(person=>({value:person.id===actor.personId?'me':person.id,label:person.id===actor.personId?'My leave and policies':person.name}))
 return page('Policy assistant',actor,h`<h1>Policy assistant</h1><p>Ask about leave eligibility, balances or conflicting policy versions. Answers cite HR-included sources available to you.</p>${settings.enabled && settings.policies ? form('policy.answer','/app/policy-assistant',[select('Policy context','person',choices,url.searchParams.get('person')??(actor.personId?'me':''),{blank:'Choose a person'}),area('Question','question'),h`<details><summary>What is shared</summary><p>Your question is reduced to a supported topic in Willow. Only included policy text${settings.data_scope==='policy-and-leave-numbers'?' and your permitted numeric leave inputs':''} goes to OpenAI. Names, private contact details, compensation, absence reasons and your raw question are excluded. Willow keeps no questions or answers. Provider abuse-monitoring retention may apply.</p></details>`],'Ask about policy') : h`<section class="card"><p>The owner has disabled policy answers. Your ordinary leave and policy screens remain available.</p></section>`}
 ${answer ? h`<section class="card" aria-live="polite"><h2>${answer.status==='answered'?'Cited answer':'Ask HR'}</h2>${'message' in answer?h`<p>${answer.message}</p>`:''}${answer.claims.map(claim=>h`<blockquote>${claim.text}</blockquote><p>Leave policy · version ${claim.citation.version} · ${new Date(claim.citation.approvedAt).toISOString().slice(0,10)} · ${claim.citation.versionId}</p>`)}${answer.inputs?.length ? h`<h3>Calculation inputs</h3>${table(['Policy version','Balance (minutes)','Opening (minutes)','Cutover'],answer.inputs.map(input=>[input.policyVersion,'balanceMinutes' in input?input.balanceMinutes:'Withheld','openingMinutes' in input?input.openingMinutes:'Withheld','cutoverDate' in input?input.cutoverDate:'Withheld']))}`:''}<details><summary>Withheld information</summary><p>${answer.withheld.join(', ') || 'Private fields are excluded from every model call.'}</p></details>${answer.needsHr?h`<p>HR must resolve uncertainty before any entitlement or employment decision. <a href="${answer.escalation}">Contact your HR team</a>.</p>`:''}</section>`:''}`,{current:'/app/leave',url})
}
