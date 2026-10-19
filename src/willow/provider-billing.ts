// Billing disclosures contain provider names only, never credential URLs or keys.
import type { Bindings } from '../auth.server'

export function providerBilling(env: Bindings) {
  const mail = env.AUTH_LOCAL === 'true' || env.RER_DEMO === '1' || env.MAIL_PROVIDER === 'development'
    ? 'Local development mail'
    : ({ resend: 'Resend', sendgrid: 'SendGrid', cloudflare: 'Cloudflare Email Service' } as Record<string, string>)[env.MAIL_PROVIDER ?? ''] ?? null
  let model: string | null = null
  try { model = new URL(env.MODELS_ENDPOINT ?? '').hostname } catch { /* Not configured; no endpoint or credential is disclosed. */ }
  return { mail, model }
}
