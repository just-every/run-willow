// Fixed self-identification choices. Unknown is derived from an unanswered
// optional field; declining is a separate, deliberate answer.
export const RACE_ETHNICITY = [
  { value: 'hispanic_latino', label: 'Hispanic or Latino' },
  { value: 'white', label: 'White (not Hispanic or Latino)' },
  { value: 'black_african_american', label: 'Black or African American (not Hispanic or Latino)' },
  { value: 'asian', label: 'Asian (not Hispanic or Latino)' },
  { value: 'native_hawaiian_pacific_islander', label: 'Native Hawaiian or Other Pacific Islander (not Hispanic or Latino)' },
  { value: 'american_indian_alaska_native', label: 'American Indian or Alaska Native (not Hispanic or Latino)' },
  { value: 'two_or_more', label: 'Two or more races (not Hispanic or Latino)' },
  { value: 'declined', label: 'I do not wish to self-identify' },
] as const

export const SEX = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Nonbinary' },
  { value: 'declined', label: 'I do not wish to self-identify' },
] as const

export type RaceEthnicity = typeof RACE_ETHNICITY[number]['value']
export type Sex = typeof SEX[number]['value']

export interface EeoAnswers {
  raceEthnicity: RaceEthnicity | null
  sex: Sex | null
}

export interface EeoRevision extends EeoAnswers {
  sequence: number
  source?: 'employee/self-identified' | 'preboarding/self-identified' | 'applicant self-identification'
  sourcePacketId?: string | null
  sourceSequence?: number | null
  contractorForms?: Record<string,string> | null
  recordedAt: number
  /** Employer-local calendar date on which the person submitted this version. */
  recordedOn: string
  formVersion: 1 | 2
  hispanic: 'yes' | 'no' | 'declined' | null
  races: string[] | null
  ruleVersion: string | null
  veteran: 'protected' | 'not_protected' | 'declined' | null
  veteranClasses: string[] | null
  disability: 'yes' | 'no' | 'declined' | null
}

/** A category HR recorded from employment records: never the employee's answer. */
export interface EeoRecorded {
  sequence: number
  dimension: 'race_ethnicity' | 'sex'
  category: string
  employmentRecord: string
  ruleVersion: string
  recordedBy: string | null
  recordedOn: string
  label: 'HR-recorded from employment records'
}

export interface EeoSelf {
  current: EeoRevision | null
  /** Newest submission first. Available only on the explicit self-ID door. */
  history: EeoRevision[]
  /** Categories HR recorded from employment records about this person, shown apart from their answers. */
  recorded: EeoRecorded[]
  form: { version: 2; ruleVersion: string; contractor: boolean }
}

export interface FilingValue { value: string; label: string; source: string }
export interface EeoPerson {
  person: { id: string; name: string }
  ruleVersion: string
  current: EeoRevision | null
  history: EeoRevision[]
  recorded: EeoRecorded[]
  /** The value EEO-1 uses for each dimension and where it came from; null when there is no filing category. */
  filing: { raceEthnicity: FilingValue | null; sex: FilingValue | null }
  mayRecord: { raceEthnicity: boolean; sex: boolean }
}

export interface DiversityCell {
  category: string
  label: string
  count: number | null
  suppressed: boolean
}

export interface DiversityReport {
  scope: 'employer'
  asOf: string
  /** Erased people whose retained employment would have counted on this date; they are in custody, never here. */
  excludesErased: number
  total: number | null
  suppressed: boolean
  minimumCellSize: number
  calculation: string
  raceEthnicity: DiversityCell[]
  sex: DiversityCell[]
}
