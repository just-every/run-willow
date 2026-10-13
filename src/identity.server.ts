// Optional identity configuration is isolated from local email authentication.
// Invalid provider input is reported as such, never logged or serialized.
import type { Bindings } from './auth.server'
// @ts-expect-error Base's internal validator has no declaration; it is server-only.
import { configure } from './modules/operator-auth/identity/oidc/config.mjs'

export function identityConfiguration(env: Bindings): { state: string; providers: any[] } {
  if (!env.OIDC_PROVIDERS) return { state: 'not_configured', providers: [] }
  try {
    const providers = JSON.parse(env.OIDC_PROVIDERS)
    if (env.OIDC_TRANSACTION_SECRET === env.SESSION_SECRET) throw new Error()
    configure({ origin: env.AUTH_ORIGIN, local: env.AUTH_LOCAL === 'true', transactionSecret: env.OIDC_TRANSACTION_SECRET, providers })
    return { state: 'configured', providers }
  } catch { return { state: 'invalid_configuration', providers: [] } }
}
