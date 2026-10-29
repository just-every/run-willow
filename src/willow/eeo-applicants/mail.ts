import { sendFixedNotice } from '../locale/notices'
// The bearer exists only in this delivery call. Neither audit nor action responses carry it.
import type { Bindings } from '../../auth.server'
import { operatorMail } from '../../mail.server.mjs'
import { one, stmt } from '../core'
import { PHASE_ELIGIBLE } from './store'
import type { InvitationRow } from './types'

export interface ApplicantDelivery { status: 'accepted' | 'development' | 'failed' | 'refused'; failure: string | null }
const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export async function deliverInvitation(env: Bindings, row: InvitationRow, token: string): Promise<ApplicantDelivery> {
  const eligible = `i.id=? AND i.token_hash=? AND i.delivery_status='pending' AND i.revoked_at IS NULL
    AND i.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    AND i.contact_email=a.contact_email AND ${PHASE_ELIGIBLE}
    AND EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators p ON lower(p.email)=m.email
      WHERE m.id=i.invited_by AND m.status='active' AND p.status='active' AND
      (p.role='owner' OR EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=m.id AND permission='people.manage')))`
  const joins = `wl_applicant_eeo_invitations i JOIN wl_hiring_applications a ON a.id=i.application_id
    LEFT JOIN wl_hiring_closures c ON c.application_id=a.id`
  let result: ApplicantDelivery = { status: 'failed', failure: 'mail_unavailable' }
  try {
    const current = await one<{ contact_email: string }>(env, `SELECT a.contact_email FROM ${joins} WHERE ${eligible}`, row.id, row.token_hash)
    if (!current) return { status: 'refused', failure: 'invitation_unavailable' }
    const sender = operatorMail(env)
    if (sender && env.MAIL_FROM) {
      const link = new URL(`/applicant-self-id/${token}`, env.AUTH_ORIGIN).href
      const copy = 'You may complete voluntary self-identification in Willow. Your answers are separate from your application, are never shown to the hiring team and do not affect selection.'
      const sent = await sendFixedNotice(env,'applicant',row.application_id,sender,{ deliveryId: row.id, from: env.MAIL_FROM, to: [current.contact_email],
        subject: 'Willow: voluntary self-identification invitation',
        text: `${copy}\n\nComplete voluntary self-identification: ${link}\n\nThis invitation expires in 14 days.`,
        html: `<p>${copy}</p><p><a href="${esc(link)}">Complete voluntary self-identification</a></p><p>This invitation expires in 14 days.</p>`,
        headers: { 'Auto-Submitted': 'auto-generated' } })
      result = sent.status === 'accepted' ? { status: 'accepted', failure: null }
        : sent.status === 'development' && (env.AUTH_LOCAL === 'true' || env.RER_DEMO === '1') ? { status: 'development', failure: null }
        : { status: 'refused', failure: 'mail_refused' }
    }
  } catch { result = { status: 'failed', failure: 'mail_failed' } }
  // A withdrawal, correction, contact change or expiry while sending leaves no usable link.
  try {
    const saved = await stmt(env, `UPDATE wl_applicant_eeo_invitations SET delivery_status=?,delivery_failure=?
      WHERE id=? AND EXISTS(SELECT 1 FROM ${joins} WHERE ${eligible})`, result.status, result.failure, row.id, row.id, row.token_hash).run()
    if (!saved.meta.changes) return { status: 'refused', failure: 'invitation_unavailable' }
  } catch { return { status: 'failed', failure: 'delivery_record_failed' } }
  return result
}
