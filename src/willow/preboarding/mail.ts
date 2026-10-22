import type { Bindings } from '../../auth.server'
import { operatorMail } from '../../mail.server.mjs'
import { commit, stmt } from '../core'

export interface PacketDelivery {
  status: 'accepted' | 'development' | 'refused' | 'failed'
  failure: 'mail_unavailable' | 'mail_refused' | 'mail_failed' | null
}
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

/** Only the mail edge receives the bearer link; no provider response is persisted. */
export async function deliverPacket(env: Bindings, actorId: string, packetId: string, email: string, token: string, sourceOn: string): Promise<PacketDelivery> {
  let delivery: PacketDelivery = { status: 'failed', failure: 'mail_unavailable' }
  try {
    const sender = operatorMail(env)
    if (sender && env.MAIL_FROM) {
      const link = new URL(`/preboarding/${token}`, env.AUTH_ORIGIN).href
      const text = `You have a voluntary self-identification step in Willow.\n\nOpen your private step: ${link}\n\nInvitation issued: ${sourceOn}.\n`
      const result = await sender.send({ deliveryId: packetId, from: env.MAIL_FROM, to: [email],
        subject: 'Willow: your voluntary self-identification step', text,
        html: `<p>You have a voluntary self-identification step in Willow.</p><p><a href="${escape(link)}">Open your private step</a></p><p>Invitation issued: ${sourceOn}.</p>`,
        headers: { 'Auto-Submitted': 'auto-generated' } })
      delivery = result?.status === 'accepted' ? { status: 'accepted', failure: null }
        : result?.status === 'development' && (env.AUTH_LOCAL === 'true' || env.RER_DEMO === '1')
          ? { status: 'development', failure: null } : { status: 'refused', failure: 'mail_refused' }
    }
  } catch { delivery = { status: 'failed', failure: 'mail_failed' } }
  try {
    await commit(env, [stmt(env, 'UPDATE wl_preboard_packets SET delivery_status = ?, delivery_failure = ? WHERE id = ?', delivery.status, delivery.failure, packetId)],
      { actor: actorId, action: 'preboarding.delivery', subject: packetId, detail: delivery })
  } catch { /* Delivery bookkeeping cannot roll back the committed invitation. */ }
  return delivery
}
