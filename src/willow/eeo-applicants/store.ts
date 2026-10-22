import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { guard, insist, one, sha256Hex } from '../core'
import { CC305, CONTRACTOR_FORMS, RULE_SOURCE, RULE_VERSION, VETERAN_INVITATION } from '../eeo/forms'
import type { ApplicantFormSource, ApplicantPhase, ApplicationRow, InvitationRow } from './types'

export const APPLICATION_JOIN = `wl_hiring_applications a JOIN wl_hiring_openings o ON o.id=a.opening_id
  LEFT JOIN wl_hiring_closures c ON c.application_id=a.id`
export const APPLICATION_COLUMNS = `a.id,a.opening_id,a.name,a.contact_email,a.stage,a.revision,
  o.revision AS opening_revision,o.name AS opening_name,c.outcome,c.closed_at`

export async function application(env: Bindings, id: string): Promise<ApplicationRow> {
  const row = await one<ApplicationRow>(env, `SELECT ${APPLICATION_COLUMNS} FROM ${APPLICATION_JOIN} WHERE a.id=?`, id)
  insist(row, 'not_found', 404)
  return row
}

/** Authority is employer-wide HR, never a team role or scoped worker permission. */
export function hrGuard(env: Bindings, actor: Actor, row: ApplicationRow) {
  requirePermission(actor, 'people.manage')
  return guard(env, 'applicant_access_changed', `EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators p ON lower(p.email)=m.email
    WHERE m.id=? AND m.status='active' AND p.status='active' AND
    (p.role='owner' OR EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=m.id AND permission='people.manage')))
    AND EXISTS(SELECT 1 FROM wl_hiring_applications a JOIN wl_hiring_openings o ON o.id=a.opening_id
    WHERE a.id=? AND a.revision=? AND a.stage=? AND a.contact_email=? AND o.revision=?)`,
    actor.id, row.id, row.revision, row.stage, row.contact_email, row.opening_revision)
}

/** The only named-stage meaning is the post-offer invitation's literal Offer stage. */
export const PHASE_ELIGIBLE = `((i.phase='pre-offer' AND c.application_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM wl_applicant_eeo_invitations later WHERE later.application_id=a.id AND later.phase='post-offer'))
  OR (i.phase='post-offer' AND (c.outcome='hired' OR (c.application_id IS NULL AND lower(trim(a.stage))='offer'))))`
export const INVITATION_LIVE = `i.revoked_at IS NULL AND i.delivery_status IN ('accepted','development')
  AND i.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  AND i.contact_email=a.contact_email AND ${PHASE_ELIGIBLE}`

export async function invitation(env: Bindings, token: string): Promise<InvitationRow> {
  insist(/^[a-f0-9]{64}$/.test(token), 'invitation_unavailable', 404)
  const hash = await sha256Hex(token)
  const row = await one<InvitationRow>(env, `SELECT i.* FROM wl_applicant_eeo_invitations i
    JOIN wl_hiring_applications a ON a.id=i.application_id LEFT JOIN wl_hiring_closures c ON c.application_id=a.id
    WHERE i.token_hash=? AND ${INVITATION_LIVE}`, hash)
  insist(row, 'invitation_unavailable', 404)
  return row
}

export function invitationGuard(env: Bindings, row: InvitationRow) {
  return guard(env, 'invitation_unavailable', `EXISTS(SELECT 1 FROM wl_applicant_eeo_invitations i
    JOIN wl_hiring_applications a ON a.id=i.application_id LEFT JOIN wl_hiring_closures c ON c.application_id=a.id
    WHERE i.id=? AND i.token_hash=? AND i.application_id=? AND i.phase=? AND ${INVITATION_LIVE})`,
    row.id, row.token_hash, row.application_id, row.phase)
}

export function formSource(phase: ApplicantPhase, contractor: boolean): ApplicantFormSource {
  return { phase, version: 2, rule: { version: RULE_VERSION, url: RULE_SOURCE.url, read: RULE_SOURCE.read }, contractor,
    cc305: contractor ? { form: CC305.formNumber, expires: CC305.expires, ...CC305.source } : null,
    veteran: contractor ? { version: CONTRACTOR_FORMS.veteran, phase, url: VETERAN_INVITATION.source.url, read: VETERAN_INVITATION.source.read } : null }
}

export const identity = (row: ApplicationRow) => ({ id: row.id, name: row.name, opening: row.opening_name })
