import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { commit, guard, insist, newId, now, one, sha256Hex, stmt } from '../core'
import type { Input } from '../input'
import { contractorStatus } from '../retention/settings'
import { deliverInvitation } from './mail'
import { application, formSource, hrGuard } from './store'
import type { ApplicantPhase, InvitationRow } from './types'

export async function inviteApplicant(env: Bindings, actor: Actor, input: Input, request: Request) {
  requirePermission(actor, 'people.manage')
  insist(request.method === 'POST', 'method_not_allowed', 405)
  input.only(['application', 'phase', 'expiresAt', 'returnTo'])
  const app = await application(env, input.text('application', { max: 64 }))
  const phase = input.text('phase', { max: 16 }) as ApplicantPhase
  insist(phase === 'pre-offer' || phase === 'post-offer', 'invalid_phase')
  insist(phase === 'pre-offer' ? !app.outcome : app.outcome === 'hired' || !app.outcome && app.stage.trim().toLowerCase() === 'offer', 'application_not_eligible', 409)
  const id = newId(), at = now()
  const expiresAt = input.integer('expiresAt',{optional:true,min:at+1000,max:at+14*86_400_000}) ?? at + 14 * 86_400_000
  const contractor = (await contractorStatus(env, actor.today)).contractor
  const forms = JSON.stringify(formSource(phase, contractor))
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  const hash = await sha256Hex(token)
  const row: InvitationRow = { id, application_id: app.id, phase, token_hash: hash, contact_email: app.contact_email,
    invited_at: at, expires_at: expiresAt, contractor: contractor ? 1 : 0, forms_json: forms }
  await commit(env, [hrGuard(env, actor, app),
    guard(env, 'application_not_eligible', phase === 'pre-offer'
      ? `NOT EXISTS(SELECT 1 FROM wl_hiring_closures WHERE application_id=?) AND NOT EXISTS(SELECT 1 FROM wl_applicant_eeo_invitations WHERE application_id=? AND phase='post-offer')`
      : `EXISTS(SELECT 1 FROM wl_hiring_applications a LEFT JOIN wl_hiring_closures c ON c.application_id=a.id WHERE a.id=?
          AND (c.outcome='hired' OR (c.application_id IS NULL AND lower(trim(a.stage))='offer')))`,
      ...(phase === 'pre-offer' ? [app.id, app.id] : [app.id])),
    guard(env, 'contractor_status_changed', `COALESCE((SELECT contractor FROM wl_contractor_status WHERE effective_from<=? ORDER BY effective_from DESC,id DESC LIMIT 1),0)=?`, actor.today, row.contractor),
    stmt(env, `UPDATE wl_applicant_eeo_invitations SET revoked_at=?,revoked_by=? WHERE application_id=? AND revoked_at IS NULL
      AND (phase=? OR ?='post-offer')`, at, actor.id, app.id, phase, phase),
    stmt(env, `INSERT INTO wl_applicant_eeo_invitations
      (id,application_id,phase,token_hash,contact_email,invited_by,invited_at,invited_on,expires_at,contractor,forms_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, app.id, phase, hash, app.contact_email, actor.id, at, actor.today, expiresAt, row.contractor, forms),
  ], { actor: actor.id, action: 'eeo.applicant.invite', subject: app.id, detail: { invitation: id, phase } })
  const delivery = await deliverInvitation(env, row, token)
  return { id, application: app.id, phase, expiresAt, delivery }
}

export async function revokeApplicantInvitation(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['application', 'invitation', 'returnTo'])
  const app = await application(env, input.text('application', { max: 64 }))
  const id = input.text('invitation', { max: 64 })
  insist(await one(env, 'SELECT 1 FROM wl_applicant_eeo_invitations WHERE id=? AND application_id=?', id, app.id), 'not_found', 404)
  await commit(env, [hrGuard(env, actor, app),
    guard(env, 'not_found', 'EXISTS(SELECT 1 FROM wl_applicant_eeo_invitations WHERE id=? AND application_id=?)', id, app.id),
    stmt(env, 'UPDATE wl_applicant_eeo_invitations SET revoked_at=?,revoked_by=? WHERE id=? AND application_id=? AND revoked_at IS NULL', now(), actor.id, id, app.id),
  ], { actor: actor.id, action: 'eeo.applicant.revoke', subject: app.id, detail: { invitation: id } })
  return { id, application: app.id, revoked: true }
}
