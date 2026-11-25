import type { MailSender } from './modules/operator-auth/index.mjs'
import type { Bindings } from './auth.server'
export function mailOff(env: Bindings): boolean
export function operatorMail(env: Bindings): MailSender | undefined
