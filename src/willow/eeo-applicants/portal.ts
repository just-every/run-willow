// This bearer door deliberately has no currentActor/member/person admission path.
import type { Bindings } from '../../auth.server'
import { employerZone } from '../actor'
import { commit, guard, insist, one, stmt } from '../core'
import { today } from '../dates'
import { RULE_VERSION } from '../eeo/forms'
import { parseEeoSubmission } from '../eeo/submission'
import type { Input } from '../input'
import { answers, invitationForms } from './answers'
import { application, identity, invitation, invitationGuard } from './store'
import type { ApplicantInvitation, EeoApplicantRevision } from './types'

export async function applicantInvitation(env: Bindings, token: string): Promise<ApplicantInvitation> {
  const invite = await invitation(env, token)
  const app = await application(env, invite.application_id)
  const history = await answers(env, app.id, invite.phase)
  await commit(env, [invitationGuard(env, invite)], { actor: 'applicant', action: 'eeo.applicant.self.read', subject: app.id })
  return { application: identity(app), phase: invite.phase, expiresAt: invite.expires_at, current: history[0] ?? null, history,
    form: { version: 2, ruleVersion: RULE_VERSION, contractor: !!invite.contractor, source: invitationForms(invite.forms_json) } }
}

/** Complete snapshots append within one application and phase, even when a link is corrected. */
export async function submitApplicant(env: Bindings, token: string, input: Input): Promise<EeoApplicantRevision> {
  const invite = await invitation(env, token)
  insist(invite.phase !== 'pre-offer' || input.list('veteranClasses').length === 0, 'veteran_classes_not_offered', 400)
  const recordedOn = today(await employerZone(env))
  const parsed = await parseEeoSubmission(env, recordedOn, input)
  const c = parsed.columns
  insist(!!invite.contractor === (c.contractorForms !== null), 'contractor_status_changed', 409)
  const prior = (await one<{ sequence: number }>(env, 'SELECT COALESCE(MAX(sequence),0) AS sequence FROM wl_applicant_eeo_answers WHERE application_id=? AND phase=?', invite.application_id, invite.phase))!.sequence
  const sequence = prior + 1
  const classes = invite.phase === 'pre-offer' ? null : c.veteranClasses
  await commit(env, [invitationGuard(env, invite),
    guard(env, 'stale', '(SELECT COALESCE(MAX(sequence),0) FROM wl_applicant_eeo_answers WHERE application_id=? AND phase=?)=?', invite.application_id, invite.phase, prior),
    guard(env, 'contractor_status_changed', `COALESCE((SELECT contractor FROM wl_contractor_status WHERE effective_from<=? ORDER BY effective_from DESC,id DESC LIMIT 1),0)=?`, recordedOn, invite.contractor),
    stmt(env, `INSERT INTO wl_applicant_eeo_answers
      (application_id,phase,sequence,invitation_id,recorded_at,recorded_on,form_version,race_ethnicity,sex,hispanic,races,rule_version,veteran,veteran_classes,disability,contractor_forms,forms_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, invite.application_id, invite.phase, sequence, invite.id,
      parsed.revision.recordedAt, recordedOn, c.formVersion, c.raceEthnicity, c.sex, c.hispanic, c.races, c.ruleVersion,
      c.veteran, classes, c.disability, c.contractorForms, invite.forms_json),
  ], { actor: 'applicant', action: 'eeo.applicant.submit', subject: invite.application_id })
  return { ...parsed.revision, sequence, veteranClasses: invite.phase === 'pre-offer' ? null : parsed.revision.veteranClasses,
    phase: invite.phase, source: 'applicant self-identification', invitedAt: invite.invited_at,
    submittedAt: parsed.revision.recordedAt, forms: invitationForms(invite.forms_json) }
}
