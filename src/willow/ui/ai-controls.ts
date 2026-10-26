import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { aiControls } from '../ai-provider'
import { aiPolicySources } from '../ai-policy'
import { can } from '../actor'
import { POLICY_CONSENT, WORKFLOW_CONSENT } from '../ai-consent'
import { field, form, h, hidden, select, table } from './html'

export async function aiControlsSection(env: Bindings, actor: Actor) {
 const sources = can(actor,'leave.manage') ? await aiPolicySources(env,actor) : []
 const inclusion = h`<details><summary>Policy inclusion</summary>${sources.length?sources.map(source=>h`<p>Version ${source.version}: ${source.summary}</p>${form('ai.policy.include','/app/settings',[hidden('version',source.id),hidden('included',!source.included)],source.included?'Exclude policy version':'Include policy version')}`):h`<p>No approved policy versions.</p>`}</details>`
 if(!actor.owner) return h`<section class="card"><h2>Policy assistant sources</h2>${inclusion}</section>`
 const { settings:s,calls }=await aiControls(env,actor)
 return h`<section class="card"><h2>Policy and workflow assistant</h2><p>Provider: OpenAI. One model request per run, with a maximum reserved cost shown in the call history. The owner can disable both capabilities immediately.</p><details><summary>Configure assistant</summary>${form('ai.configure','/app/connections',[
 select('Assistant','enabled',[{value:'false',label:'Disabled'},{value:'true',label:'Enabled'}],String(!!s.enabled)),
 select('Policy answers','policies',[{value:'false',label:'Disabled'},{value:'true',label:'Enabled'}],String(!!s.policies)),
 select('Workflow drafts','workflows',[{value:'false',label:'Disabled'},{value:'true',label:'Enabled'}],String(!!s.workflows)),
 select('Model','model',[{value:'gpt-4.1-nano',label:'GPT-4.1 nano'},{value:'gpt-4.1-mini',label:'GPT-4.1 mini'}],s.model),
 field('Maximum spend per run (USD)','capUsd',{value:s.cap_microusd/1000000}),
 select('Data scope','dataScope',[{value:'policies-only',label:'Included policy clauses only'},{value:'policy-and-leave-numbers',label:'Included policies and permitted leave numbers'}],s.data_scope),
 select('Willow retention','retention',[{value:'no-content',label:'No prompt or answer content retained'}],s.retention),
 select('Provider retention consent','providerRetention',[{value:'unapproved',label:'Not approved: calls denied'},{value:'standard',label:'Approve standard provider retention'}],s.provider_retention),
 h`<details><summary>Policy handling consent</summary><p>${POLICY_CONSENT}</p><label class="check"><input type="checkbox" name="policyConsent" value="true"> I attest to the policy handling statement</label></details>`,
 h`<details><summary>Workflow handling consent</summary><p>${WORKFLOW_CONSENT}</p><label class="check"><input type="checkbox" name="workflowConsent" value="true"> I attest to the workflow handling statement</label></details>`],'Apply assistant controls')}</details>${inclusion}
 <details><summary>Call history</summary>${table(['Feature','Provider and model','State','Reserved USD','Actual USD','Response'],calls.map(call=>[call.feature,`${call.provider} ${call.model}`,call.failure??call.status,(call.reserved_microusd/1000000).toFixed(6),call.actual_microusd===null?'Unknown':(call.actual_microusd/1000000).toFixed(6),call.response_id??'None']))}</details></section>`
}
