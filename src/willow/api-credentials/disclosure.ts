// Browser-only handoff: bearer bytes stay encrypted in a short-lived, session-bound
// cookie. The audit claim makes even a replayed cookie disclose at most once.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { commit, guard, now, sha256Hex, WillowError } from '../core'
import { administratorAuthority, type CredentialMetadata } from './store'

const path = '/app/api-credentials'
const lifetime = 120
const encoder = new TextEncoder()
type IssuedCredential = CredentialMetadata & { token: string }
export const credentialDisclosureRequest = (request: Request) => request.method === 'GET' && request.headers.get('purpose') !== 'prefetch' && !request.headers.get('sec-purpose')?.includes('prefetch')

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
// Cookies ignore ports, so separate concurrent local installations by origin.
const cookieName = (env: Bindings) => 'willow_issued_credential_' + encode(encoder.encode(new URL(env.AUTH_ORIGIN).origin))
const binding = (env: Bindings, actor: Actor) => encoder.encode(JSON.stringify([new URL(env.AUTH_ORIGIN).origin, actor.id, actor.sessionId]))
async function key(env: Bindings) {
 const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(`willow:credential-disclosure:${env.SESSION_SECRET}`))
 return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
function cookie(env: Bindings, value: string, age: number) {
 return `${cookieName(env)}=${value}; Path=${path}; Max-Age=${age}; HttpOnly; SameSite=Strict${new URL(env.AUTH_ORIGIN).protocol === 'https:' ? '; Secure' : ''}`
}
export function clearCredentialDisclosure(env: Bindings, response: Response) {
 response.headers.append('set-cookie', cookie(env, '', 0))
 response.headers.set('cache-control', 'no-store')
 return response
}
export async function redirectIssuedCredential(env: Bindings, actor: Actor, result: IssuedCredential) {
 const iv = crypto.getRandomValues(new Uint8Array(12))
 const plaintext = encoder.encode(JSON.stringify({ id: result.id, token: result.token, expiresAt: now() + lifetime * 1000 }))
 const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: binding(env, actor) }, await key(env), plaintext))
 return new Response(null, { status: 303, headers: {
  location: path, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
  'set-cookie': cookie(env, `${encode(iv)}.${encode(sealed)}`, lifetime),
 } })
}
export async function takeIssuedCredential(env: Bindings, actor: Actor, request: Request, credentials: CredentialMetadata[]): Promise<IssuedCredential | null> {
 // HEAD and speculative prefetches must not spend the one-time disclosure.
 if (!credentialDisclosureRequest(request)) return null
 const name = cookieName(env)
 const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1)
 if (!value) return null
 let payload: { id: string; token: string; expiresAt: number }
 try {
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(parts[0]), additionalData: binding(env, actor) }, await key(env), decode(parts[1]))
  payload = JSON.parse(new TextDecoder().decode(plaintext))
  if (typeof payload.id !== 'string' || typeof payload.token !== 'string' || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now()) return null
 } catch { return null }
 const result = credentials.find(row => row.id === payload.id && !row.revokedAt && row.expiresAt > now())
 if (!result) return null
 const authority = await administratorAuthority(env, actor)
 try {
  await commit(env, [authority.fence, guard(env, 'stale', `
   NOT EXISTS(SELECT 1 FROM wl_audit WHERE action='apiKey.reveal.read' AND subject=?)
   AND EXISTS(SELECT 1 FROM wl_api_credentials WHERE id=? AND token_hash=? AND issued_by=? AND revoked_at IS NULL AND expires_at>?)`,
   result.id, result.id, await sha256Hex(payload.token), actor.id, now())],
   { actor: actor.id, action: 'apiKey.reveal.read', subject: result.id })
 } catch (error) {
  if (error instanceof WillowError && error.code === 'stale') return null
  throw error
 }
 return { ...result, token: payload.token }
}
