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
  { value: 'declined', label: 'Prefer not to answer' },
] as const

export const SEX = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Nonbinary' },
  { value: 'declined', label: 'Prefer not to answer' },
] as const

export type RaceEthnicity = typeof RACE_ETHNICITY[number]['value']
export type Sex = typeof SEX[number]['value']

export interface EeoAnswers {
  raceEthnicity: RaceEthnicity | null
  sex: Sex | null
}

export interface EeoRevision extends EeoAnswers {
  sequence: number
  recordedAt: number
  /** Employer-local calendar date on which the person submitted this version. */
  recordedOn: string
}

export interface EeoSelf {
  current: EeoRevision | null
  /** Newest submission first. Available only on the explicit self-ID door. */
  history: EeoRevision[]
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
  total: number | null
  suppressed: boolean
  minimumCellSize: number
  calculation: string
  raceEthnicity: DiversityCell[]
  sex: DiversityCell[]
}
