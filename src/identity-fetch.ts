import type { Bindings } from './auth.server'

// Observe the actual pinned token exchange. Discovery health does not prove
// that this client can exchange a code. Never store a request or response body.
export function identityFetch(env: Bindings, providerId?: string): typeof fetch {
  return async (input, init) => {
    const uri = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const link = providerId && method === 'POST' ? await env.DB.prepare(
      "SELECT provider_id, issuer, client_id, token_endpoint, linked_at FROM oa_identity_providers WHERE provider_id = ? AND token_endpoint = ? AND status = 'linked'",
    ).bind(providerId, uri).first<{ provider_id: string; issuer: string; client_id: string; token_endpoint: string; linked_at: number }>() : null
    const observedAt = Date.now()
    const record = async (failed: boolean) => {
      if (!link) return
      await env.DB.prepare(`INSERT INTO wl_identity_token_health(provider_id, issuer, client_id, token_endpoint, linked_at, failed, observed_at)
        SELECT provider_id, issuer, client_id, token_endpoint, linked_at, ?, ? FROM oa_identity_providers
        WHERE provider_id = ? AND issuer = ? AND client_id = ? AND token_endpoint = ? AND linked_at = ? AND status = 'linked'
        ON CONFLICT(provider_id) DO UPDATE SET issuer=excluded.issuer, client_id=excluded.client_id,
        token_endpoint=excluded.token_endpoint, linked_at=excluded.linked_at, failed=excluded.failed, observed_at=excluded.observed_at
        WHERE excluded.observed_at >= wl_identity_token_health.observed_at`)
        .bind(failed ? 1 : 0, observedAt, link.provider_id, link.issuer, link.client_id, link.token_endpoint, link.linked_at).run()
    }
    let response: Response
    try { response = await fetch(input, { ...init, redirect: 'manual' }) }
    catch (error) { await record(true); throw error }
    if (link) await record(!await acceptedTokenResponse(response))
    // workerd supports manual redirects. Never forward credentials to a redirect.
    if (response.status >= 300 && response.status < 400) throw new Error('oidc_provider_unavailable')
    return response
  }
}

// Match the exchange envelope Base accepts, without persisting token bytes.
// Bound the cloned read just as Base bounds its own network read.
async function acceptedTokenResponse(response: Response): Promise<boolean> {
  if (response.status !== 200 || !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return false
  const reader = response.clone().body?.getReader()
  if (!reader) return false
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) return false
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return !!body && typeof body === 'object' && !Array.isArray(body) && !Object.hasOwn(body, 'error')
      && typeof body.id_token === 'string'
      && (body.access_token === undefined || typeof body.access_token === 'string' && /^[\x21-\x7e]+$/.test(body.access_token))
      && (body.token_type === undefined && body.access_token === undefined || typeof body.token_type === 'string' && body.token_type.toLowerCase() === 'bearer')
  } catch { return false }
  finally { void reader.cancel().catch(() => {}) }
}
