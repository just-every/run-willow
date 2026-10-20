export type SurveyKind = 'onboarding' | 'lifecycle' | 'pulse' | 'enps'
export type SurveyMode = 'named' | 'anonymous'
export const ANONYMOUS_COMMENT_DISCLOSURE = 'your words are shown as written to HR; leave out names and details that identify you'
export type SurveyQuestion =
  | { key: string; label: string; type: 'score'; optional?: boolean }
  | { key: string; label: string; type: 'text'; optional?: boolean }
  | { key: string; label: string; type: 'choice'; options: string[]; optional?: boolean }

/** Public JSON body shapes; the setup functions consume the shared Input reader. */
export interface CreateSurveyInput {
  name: string
  kind: SurveyKind
  mode: SurveyMode
  questions: SurveyQuestion[]
  members: string[]
  deliveryDate: string
  dueDate: string
  followupOf?: string
}
export interface CreateActionPlanInput {
  survey: string
  theme: string
  plan: string
  ownerMember: string
  dueDate: string
  followupID?: string
}
export interface CompleteActionPlanInput { plan: string; evidence: string }
export interface CloseSurveyInput { survey: string }

export interface Survey {
  id: string
  name: string
  kind: SurveyKind
  mode: SurveyMode
  questions_json: string
  delivery_date: string
  due_date: string
  response_revision: number
  status: 'open' | 'closed'
  created_by: string
  created_at: number
  followup_of: string | null
}
export interface SurveyMember {
  survey_id: string
  member_id: string
  person_id: string
  answered: 0 | 1
  declined: 0 | 1
}
/** Anonymous rows have a random id, null member_id and no response instant. */
export interface SurveyAnswer {
  id: string
  survey_id: string
  member_id: string | null
  answers_json: string
}
export interface SurveyHiddenComment {
  answer_id: string
  reason: string
  hidden_by: string
  hidden_at: number
}
export interface SurveyPlan {
  id: string
  survey_id: string
  theme: string
  plan: string
  owner_member: string
  due_date: string
  followup_id: string | null
  completed_evidence: string | null
  created_by: string
  created_at: number
}
