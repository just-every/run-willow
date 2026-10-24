import { createMailSender } from './modules/mail/index.mjs'

export function operatorMail(env) {
 try {
  return env.RER_DEMO === '1' || env.AUTH_LOCAL === 'true'
   ? createMailSender({ provider: 'development', mode: 'development' })
   : env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'development'
    ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, relayUrl: env.MAIL_RELAY_URL, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) })
    : undefined
 } catch { return undefined }
}
