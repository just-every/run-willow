import type { Bindings } from '../auth.server'
import { actorFor, requireOwner, requirePermission, type Actor } from './actor'
import { all, commit, guard, insist, newId, now, one, stmt, WillowError } from './core'
import type { Input } from './input'

// Prices per million tokens in USD; supported fixed-price models only.
const MODELS: Record<string, [number, number]> = { 'gpt-4.1-nano': [0.1, 0.4], 'gpt-4.1-mini': [0.4, 1.6] }
export const aiSettings = async (env: Bindings) => await one(env, 'SELECT * FROM wl_ai_settings WHERE singleton=1') ?? { enabled: 0, policies: 0, workflows: 0, model: 'gpt-4.1-nano', cap_microusd: 10000, data_scope: 'policies-only', retention: 'no-content', provider_retention: 'unapproved', revision: '' }

export async function freshAiActor(env: Bindings, actor: Actor) {
 const session = await one(env, `SELECT o.role FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version AND o.status='active'`, actor.sessionId, now())
 insist(session, 'ai_authority_changed',409)
 return actorFor(env,{...actor,owner:session.role==='owner'})
}

export async function configureAi(env: Bindings, actor: Actor, input: Input) {
 requireOwner(actor)
 input.only(['enabled','policies','workflows','model','capUsd','dataScope','retention','providerRetention','policyConsent','workflowConsent','returnTo'])
 const enabled = input.flag('enabled'), model = input.text('model'), scope = input.text('dataScope'), retention = input.text('retention'), providerRetention = input.text('providerRetention')
 const cap = Number(input.text('capUsd')) * 1_000_000
 insist(Object.hasOwn(MODELS,model) && ['policies-only','policy-and-leave-numbers'].includes(scope) && retention === 'no-content' && ['unapproved','standard'].includes(providerRetention), 'invalid_ai_configuration')
 insist(Number.isSafeInteger(cap) && cap > 0 && cap <= 50000, 'invalid_ai_cap')
 insist(!enabled || providerRetention === 'standard' && !!env.MODELS_KEY && env.MODELS_ENDPOINT === 'https://api.openai.com/v1/chat/completions', 'ai_consent_or_binding_required', 409)
 insist(!enabled || (!input.flag('policies') || input.flag('policyConsent')) && (!input.flag('workflows') || input.flag('workflowConsent')), 'ai_explicit_consent_required', 409)
 await commit(env, [stmt(env, `INSERT INTO wl_ai_settings(singleton,enabled,policies,workflows,model,cap_microusd,data_scope,retention,provider_retention,revision) VALUES(1,?,?,?,?,?,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET enabled=excluded.enabled,policies=excluded.policies,workflows=excluded.workflows,model=excluded.model,cap_microusd=excluded.cap_microusd,data_scope=excluded.data_scope,retention=excluded.retention,provider_retention=excluded.provider_retention,revision=excluded.revision`, Number(enabled), Number(input.flag('policies')), Number(input.flag('workflows')), model, cap, scope, retention, providerRetention, newId())], { actor: actor.id, action: 'ai.configure', subject: 'connections', detail: { enabled, model, scope, retention, providerRetention, capMicrousd: cap } })
 return { enabled }
}

export async function aiControls(env: Bindings, actor: Actor) {
 requireOwner(actor)
 return { settings: await aiSettings(env), calls: await all(env, 'SELECT id,feature,provider,model,status,response_id,failure,cap_microusd,reserved_microusd,actual_microusd,created_at FROM wl_ai_calls ORDER BY created_at DESC LIMIT 30') }
}

export async function rejectAiCall(env: Bindings, id: string, error: unknown) {
 const code = error instanceof WillowError ? error.code : 'ai_output_rejected'
 await stmt(env,"UPDATE wl_ai_calls SET status='failed',failure=? WHERE id=?",code,id).run()
}

export async function callModel(env: Bindings, actor: Actor, feature: string, context: unknown, instruction: string, custody: { person?: string; sequence?: number; sources?: {id:string;revision:number}[]; fields?: string[] } = {}) {
 actor = await freshAiActor(env,actor)
 if(feature.includes('workflow'))requirePermission(actor,'people.manage')
 const settings = await aiSettings(env)
 const capability = feature.includes('workflow') ? settings.workflows : settings.policies
 insist(settings.enabled && capability && settings.provider_retention === 'standard', 'ai_disabled', 409)
 insist(env.MODELS_ENDPOINT === 'https://api.openai.com/v1/chat/completions' && env.MODELS_KEY, 'ai_provider_unavailable', 409)
 insist(Object.hasOwn(MODELS,settings.model), 'invalid_ai_model')
 const content = JSON.stringify(context), maxTokens = 1800
 const bytes = new TextEncoder().encode(content + instruction).byteLength
 insist(bytes <= 18000, 'ai_context_too_large')
 const [inputRate, outputRate] = MODELS[settings.model]
 // UTF-8 bytes bound input tokens conservatively; output is bounded in the request.
 const reserve = Math.ceil((bytes + 256) * inputRate + maxTokens * outputRate)
 insist(reserve <= settings.cap_microusd, 'ai_spend_cap', 409)
 const id = newId()
 await commit(env, [guard(env,'ai_authority_changed',`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email) WHERE s.id=? AND m.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version AND o.status='active' AND m.status='active')`,actor.sessionId,actor.id,now()), ...(custody.sequence===undefined?[]:[guard(env,'ai_source_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',custody.sequence)]), guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_ai_settings WHERE revision=? AND enabled=1)', settings.revision), stmt(env, `INSERT INTO wl_ai_calls(id,actor,feature,model,provider,settings_revision,cap_microusd,reserved_microusd,status,created_at,person_id) VALUES(?,?,?,?,'OpenAI',?,?,?,'pending',?,?)`, id, actor.id, feature, settings.model, settings.revision, settings.cap_microusd, reserve, now(), custody.person ?? null)], { actor: actor.id, action: 'ai.call', subject: id, detail: { feature, model: settings.model, provider: 'OpenAI', consentVersion: settings.revision, sources: custody.sources ?? [], inputFields: custody.fields ?? [], capMicrousd: settings.cap_microusd } })
 try {
  const response = await fetch(env.MODELS_ENDPOINT, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', authorization: `Bearer ${env.MODELS_KEY}`, 'x-models-feature': feature }, body: JSON.stringify({ model: settings.model, store: false, max_tokens: maxTokens, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: instruction }, { role: 'user', content }] }) })
  if (!response.ok) throw new WillowError(`ai_provider_http_${response.status}`, 502)
  const reader = response.body!.getReader(), decoder = new TextDecoder(); let text = '', size = 0
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 40000) { await reader.cancel(); throw new WillowError('ai_response_too_large',502) } text += decoder.decode(part.value,{stream:true}) }
  const body = JSON.parse(text), usage = body.usage
  insist(typeof body.id === 'string' && body.id.length < 200 && /^[\w.-]+$/.test(body.id), 'ai_invalid_response', 502)
  const cost = usage && Number.isSafeInteger(usage.prompt_tokens) && Number.isSafeInteger(usage.completion_tokens) && usage.prompt_tokens >= 0 && usage.completion_tokens >= 0 ? Math.ceil(usage.prompt_tokens * inputRate + usage.completion_tokens * outputRate) : reserve
  insist(cost <= reserve, 'ai_usage_exceeded_reservation', 502)
  const value = JSON.parse(body.choices?.[0]?.message?.content)
  await stmt(env, "UPDATE wl_ai_calls SET status='completed',response_id=?,actual_microusd=? WHERE id=?", body.id, cost, id).run()
  insist((await aiSettings(env)).revision === settings.revision, 'ai_settings_changed', 409)
  return { value, callId: id, responseId: body.id as string, model: settings.model as string }
 } catch (error) {
  const code = error instanceof WillowError ? error.code : 'ai_call_failed'
  await stmt(env, "UPDATE wl_ai_calls SET status='failed',failure=? WHERE id=?", code, id).run()
  throw new WillowError(code, error instanceof WillowError ? error.status : 502)
 }
}
