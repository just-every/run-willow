import { requireSetting } from './levels/settings'
import { demoEffect } from '../modules/demo/index.mjs'
import { operatorAuth, type Bindings } from '../auth.server'
import { requireOwner, type Actor } from './actor'
import { all, commit, insist, WillowError, newId, one, stmt } from './core'
import type { Input } from './input'
import { operatorMail } from '../mail.server.mjs'
import { identityConfiguration } from '../identity.server'
import { providerBilling } from './provider-billing'

export const connectionSettings = async (env: Bindings) => await one(env, 'SELECT * FROM wl_connections WHERE singleton = 1') ?? { notices: 0, oidc: 0, model: null, revision: null }

export async function connectionOverview(env:Bindings,actor:Actor) {
 requireSetting(actor,'integrations')
 const settings=await connectionSettings(env),identity=identityConfiguration(env)
 return {notices:!!settings.notices,mailConfigured:!!operatorMail(env)&&!!env.MAIL_FROM,identity:{enabled:!!settings.oidc,state:identity.state,providers:identity.providers.map(provider=>({id:provider.id,label:provider.label??provider.id}))},model:{selected:settings.model,configured:!!env.MODELS_ENDPOINT&&!!env.MODELS_KEY}}
}
export async function connections(env: Bindings, actor: Actor) {
  requireOwner(actor)
  const settings = (await connectionSettings(env))!
  const identity = identityConfiguration(env)
  const links = await all(env, 'SELECT provider_id, status, issuer, client_id, pending_issuer, pending_client_id FROM oa_identity_providers')
  const health = await all(env, 'SELECT provider_id, failing_since, hard_failure_at FROM oa_identity_provider_health')
  const tokenHealth = await all(env, `SELECT h.provider_id, h.failed, h.observed_at FROM wl_identity_token_health h JOIN oa_identity_providers p ON p.provider_id = h.provider_id AND p.issuer = h.issuer AND p.client_id = h.client_id AND p.token_endpoint = h.token_endpoint AND p.linked_at = h.linked_at WHERE p.status = 'linked'`)
  const notices = await all(env, 'SELECT id, kind, status, failure, created_at FROM wl_notices ORDER BY created_at DESC LIMIT 30')
  return { billing: providerBilling(env), notices: !!settings.notices, mailConfigured: !!operatorMail(env) && !!env.MAIL_FROM, history: notices,
    identity: { enabled: !!settings.oidc, state: identity.state, providers: identity.providers.map(p => ({ id: p.id, label: p.label ?? p.id })), links, health, tokenHealth },
    model: { selected: settings.model, configured: !!env.MODELS_ENDPOINT && !!env.MODELS_KEY, failures: await all(env, "SELECT id, failure, proposed_at FROM wl_model_drafts WHERE status = 'failed' ORDER BY proposed_at DESC LIMIT 10") } }
}

export async function configureNotices(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  const enabled = input.flag('enabled')
  await commit(env, [stmt(env, 'INSERT INTO wl_connections(singleton,notices,revision) VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET notices=excluded.notices,revision=excluded.revision', enabled ? 1 : 0, newId())], { actor: actor.id, action: 'notices.configure', subject: 'connections', detail: { enabled } })
  return { enabled }
}

export async function configureModel(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  const model = input.text('model', { optional: true, max: 120 })
  insist(!model || /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model), 'invalid_model')
  insist(!model || (env.MODELS_ENDPOINT && env.MODELS_KEY), 'models_binding_required')
  await commit(env, [stmt(env, 'INSERT INTO wl_connections(singleton,model,revision) VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET model=excluded.model,revision=excluded.revision', model || null, newId())], { actor: actor.id, action: 'model.configure', subject: 'connections', detail: { enabled: !!model } })
  return { enabled: !!model }
}

export async function configureIdentity(env: Bindings, actor: Actor, input: Input, request: Request) {
  requireOwner(actor)
  insist(identityConfiguration(env).state === 'configured', 'oidc_invalid_configuration', 503)
  const operation = input.text('operation'), provider = input.text('provider', { max: 32 })
  insist(operation === 'relink' || operation === 'unlink', 'invalid_operation')
  const auth = operatorAuth(env)
  // Base checks owner authority and fresh app-local email proof for each operation.
  let result
  try {
    result = await demoEffect(
      () => operation === 'relink' ? auth.relinkProvider(request, { provider }) : auth.unlinkProvider(request, { provider }),
      async () => {
        // The demo owner needs no emailed proof. Discovery is still a real
        // public read; only this throwaway installation's provider pin changes.
        insist(auth.providers?.ids.includes(provider), 'unknown_provider')
        if (operation === 'relink') await auth.providers!.relink(provider)
        else await auth.providers!.unlink(provider)
        return auth.providers!.links()
      },
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code.startsWith('oidc_')) throw new WillowError(error.code, 502)
    throw error
  }
  if (operation === 'relink') await auth.setIdentitySettings(request, { idpSignIn: true })
  await commit(env, [stmt(env, 'INSERT INTO wl_connections(singleton,oidc,revision) VALUES(1,1,?) ON CONFLICT(singleton) DO UPDATE SET oidc=1,revision=excluded.revision', newId())], { actor: actor.id, action: `identity.${operation}`, subject: provider })
  return result
}
