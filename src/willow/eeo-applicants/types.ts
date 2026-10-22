import type { EeoRevision } from '../eeo/types'

export type ApplicantPhase = 'pre-offer' | 'post-offer'
export type ApplicationOutcome = 'hired' | 'rejected' | 'withdrawn'
export interface ApplicantFormSource {
  phase: ApplicantPhase
  version: 2
  rule: { version: string; url: string; read: string }
  contractor: boolean
  cc305: { form: string; expires: string; url: string; read: string; sha256: string } | null
  veteran: { version: string; phase: ApplicantPhase; url: string; read: string } | null
}
export interface EeoApplicantRevision extends EeoRevision {
  phase: ApplicantPhase
  source: 'applicant self-identification'
  invitedAt: number
  submittedAt: number
  forms: ApplicantFormSource
}
export interface ApplicantIdentity { id: string; name: string; opening: string }
export interface ApplicantInvitation {
  application: ApplicantIdentity
  phase: ApplicantPhase
  expiresAt: number
  current: EeoApplicantRevision | null
  history: EeoApplicantRevision[]
  form: { version: 2; ruleVersion: string; contractor: boolean; source: ApplicantFormSource }
}
export interface ApplicantRecord {
  application: ApplicantIdentity
  closed: { outcome: ApplicationOutcome; closedAt: number }
  current: EeoApplicantRevision | null
  history: EeoApplicantRevision[]
}
export interface ApplicationRow {
  id: string; opening_id: string; name: string; contact_email: string; stage: string
  revision: number; opening_revision: number; opening_name: string
  outcome: ApplicationOutcome | null; closed_at: number | null
}
export interface InvitationRow {
  id: string; application_id: string; phase: ApplicantPhase; contact_email: string
  token_hash: string; invited_at: number; expires_at: number; contractor: number; forms_json: string
}
