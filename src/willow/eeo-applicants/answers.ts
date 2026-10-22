import type { Bindings } from '../../auth.server'
import { all } from '../core'
import { projection, type AnswerRow } from '../eeo/self'
import type { ApplicantFormSource, ApplicantPhase, EeoApplicantRevision } from './types'

interface ApplicantAnswerRow extends AnswerRow { phase: ApplicantPhase; invited_at: number; forms_json: string }

export async function answers(env: Bindings, applicationId: string, phase?: ApplicantPhase): Promise<EeoApplicantRevision[]> {
  const rows = await all<ApplicantAnswerRow>(env, `SELECT r.*,i.invited_at FROM wl_applicant_eeo_answers r
    JOIN wl_applicant_eeo_invitations i ON i.id=r.invitation_id AND i.application_id=r.application_id AND i.phase=r.phase
    WHERE r.application_id=? ${phase ? 'AND r.phase=?' : ''}
    ORDER BY r.recorded_at DESC,r.phase ASC,r.sequence DESC`, ...(phase ? [applicationId, phase] : [applicationId]))
  return rows.map(row => ({ ...projection(row), phase: row.phase, source: 'applicant self-identification',
    invitedAt: row.invited_at, submittedAt: row.recorded_at, forms: JSON.parse(row.forms_json) as ApplicantFormSource }))
}

export function invitationForms(serialized: string): ApplicantFormSource {
  return JSON.parse(serialized) as ApplicantFormSource
}
