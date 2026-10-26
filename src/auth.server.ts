import { initializeProvisionedDoor } from './willow/movein/authority'
import { createOwnerClaimHandler } from './modules/owner-claim/index.mjs'
import { identityFetch } from './identity-fetch'
import { firstRunResponse } from './base/setup'
import { fontDocumentResponse } from './base/font-response'
import { createOperatorAuth, createAuthHandler, createSignInHandler, type AuthConfig } from './modules/operator-auth/index.mjs'
import { operatorMail } from './mail.server.mjs'
import branding from './branding.json'
import { identityConfiguration } from './identity.server'
import { recoverMemberIdentities } from './willow/recover-access'

// The edition's declared theme (public/rer-theme.css), as Base frames link it.
const theme = { href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor }

export interface Bindings {
 ASSETS?: Fetcher
 RER_DEMO?: string
 RER_DEPLOY_SOURCE?: string
 RER_DEPLOY_FINGERPRINT?: string
 RER_VERSION?: { id: string }
 DB: D1Database
 /** Content-addressed private document bytes. */
 FILES: R2Bucket
 AUTH_ORIGIN: string
 AUTH_LOCAL?: string
 RER_DEV_ORIGIN?: string
 /** Local runtimes only: the checkout's key gate and dev identity switch. Deploy refuses both. */
 RER_DEV_KEY?: string
 RER_DEV_IDENTITY?: string
 RER_INSTALLATION_ID?: string
 RER_MANAGEMENT_ORIGIN?: string
 RER_OWNER_CLAIM_ISSUER?: string
 RER_OWNER_CLAIM_INSTALLATION_ID?: string
 RER_OWNER_CLAIM_PUBLIC_KEYS?: string
 RER_IMPORT_DOOR?: string
 OWNER_EMAIL: string
 SESSION_SECRET: string
 SETUP_TOKEN?: string
 MAIL_PROVIDER?: 'development' | 'resend' | 'sendgrid' | 'cloudflare' | 'rer'
 MAIL_FROM?: string
 MAIL_RELAY_URL?: string
 MAIL_API_KEY?: string
 MAIL_ACCOUNT_ID?: string
 OIDC_PROVIDERS?: string
 OIDC_TRANSACTION_SECRET?: string
 OKTA_ORG_URL?: string
 OKTA_API_TOKEN?: string
 MODELS_ENDPOINT?: string
 MODELS_KEY?: string
}

export const runtimeBindings = (env: Bindings): Bindings => env.RER_DEV_ORIGIN && env.AUTH_LOCAL === 'true' ? { ...env, AUTH_ORIGIN: env.RER_DEV_ORIGIN } : env
export const authConfig = (env: Bindings): AuthConfig => ({ origin: env.AUTH_ORIGIN, local: env.AUTH_LOCAL === 'true', OWNER_EMAIL: env.OWNER_EMAIL, SESSION_SECRET: env.SESSION_SECRET, SETUP_TOKEN: env.SETUP_TOKEN, MAIL_FROM: env.MAIL_FROM, branding: { productName: branding.name, accentColor: branding.primaryColor, signInPath: '/signin', theme: theme.href } })
export function operatorAuth(env: Bindings, tokenProvider?: string) {
 const providers = identityConfiguration(env).providers
 return createOperatorAuth({
  db: env.DB,
  fetch: identityFetch(env, tokenProvider),
  config: { ...authConfig(env), providers, OIDC_TRANSACTION_SECRET: env.OIDC_TRANSACTION_SECRET },
  hooks: { afterConfirm: async ({ operator, method }) => {
   if (method === 'oidc') {
    const member = await env.DB.prepare("SELECT 1 FROM wl_members WHERE email = ? AND status = 'active'").bind(operator.email.toLowerCase()).first()
    if (!member) throw new Error('not_a_member')
   }
  } },
  mailSender: operatorMail(env),
  clientIp: request => request.headers.get('CF-Connecting-IP') ?? '',
 })
}


export async function authResponse(request: Request, original: Bindings): Promise<Response | null> {
 const env = runtimeBindings(original), url = new URL(request.url)
 if (env.RER_OWNER_CLAIM_PUBLIC_KEYS) {
  const claim = await createOwnerClaimHandler({ db: env.DB, authConfig: authConfig(env), clientIp: req => req.headers.get('CF-Connecting-IP') ?? '', issuer: env.RER_OWNER_CLAIM_ISSUER ?? '', installationId: env.RER_OWNER_CLAIM_INSTALLATION_ID ?? '', appOrigin: env.AUTH_ORIGIN, expectedEmail: env.OWNER_EMAIL, publicKeys: JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS) })(request)
  if (claim) { if(claim.status===303) await initializeProvisionedDoor(env); return claim }
 }
 // The shared server-rendered sign-in page: plain forms that work before any script.
 const identity = identityConfiguration(env)
 const identityEnabled = async () => !!(await env.DB.prepare('SELECT oidc FROM wl_connections WHERE singleton = 1').first<{oidc: number}>())?.oidc
 const linkedEnvironment = async () => {
  const linked = (await env.DB.prepare('SELECT provider_id FROM oa_identity_providers').all<{provider_id:string}>()).results
  return { ...env, OIDC_PROVIDERS: JSON.stringify(identity.providers.filter(p => linked.some(l => l.provider_id === p.id))) }
 }
 if (url.pathname === '/signin') {
  const page = await createSignInHandler(operatorAuth(await linkedEnvironment()), {
   defaultReturnTo: '/setup',
  })(request)
  if (page) return fontDocumentResponse(page)
 }
 if (url.pathname === '/auth/magic-link' && request.method === 'POST' && request.headers.get('origin') === env.AUTH_ORIGIN && url.origin === env.AUTH_ORIGIN) await recoverMemberIdentities(env)
 // Willow keeps email-link admission available: domain-required SSO is outside its contract.
 if (url.pathname.startsWith('/auth/domain')) return Response.json({ error: 'optional_identity_only' }, { status: 403 })
 if (url.pathname.startsWith('/auth/providers') && request.method === 'POST') return Response.json({ error: 'use_connections_owner_action' }, { status: 403 })
 // Base validates each callback URI, including custom paths. Observe only the
 // provider whose configured callback matches this request's canonical origin.
 const callbackProvider = identity.providers.find(p => (p.redirectUri ?? `${env.AUTH_ORIGIN}/auth/oidc/${p.id}/callback`) === url.origin + url.pathname)?.id
 if (url.pathname.startsWith('/auth/oidc/') || callbackProvider) {
  if (!await identityEnabled() || identity.state !== 'configured') return request.headers.get('accept')?.includes('text/html') ? Response.redirect(`${env.AUTH_ORIGIN}/signin?notice=oidc_unavailable`,303) : Response.json({ error: 'oidc_unavailable' }, { status: 503 })
  return fontDocumentResponse(await createAuthHandler(operatorAuth(await linkedEnvironment(), callbackProvider))(request))
 }
 if (url.pathname.startsWith('/auth/')) return fontDocumentResponse(await createAuthHandler(operatorAuth(env))(request))
 if (url.pathname === '/setup' || url.pathname === '/app' || url.pathname.startsWith('/app/')) {
  const setup = await firstRunResponse(request, env, operatorAuth(env), { theme })
  if (setup) return setup
 }
 return null
}
