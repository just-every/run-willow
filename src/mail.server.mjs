import { createMailSender } from './modules/mail/index.mjs'
import { demoEffect } from './modules/demo/index.mjs'

export function operatorMail(env) {
 try {
  const sender = env.RER_DEMO === '1' || env.AUTH_LOCAL === 'true'
   ? createMailSender({ provider: 'development', mode: 'development' })
   : env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'development'
    ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) })
    : undefined
  return sender && {
   send: message => demoEffect(() => sender.send(message), () => ({ provider: env.MAIL_PROVIDER === 'development' ? 'resend' : env.MAIL_PROVIDER ?? 'resend', status: 'accepted', providerMessageId: `demo_${crypto.randomUUID()}` })),
  }
 } catch { return undefined }
}
