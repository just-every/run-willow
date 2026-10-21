// The pinned EEO-1 rule: deriving the filing category from the two-question form, and choosing
// the filing value from self-identified answers and HR-recorded categories.
import type { RaceEthnicity, Sex } from './types'

export const FILING_RACE_ETHNICITY: readonly RaceEthnicity[] = ['hispanic_latino', 'white', 'black_african_american', 'asian', 'native_hawaiian_pacific_islander', 'american_indian_alaska_native', 'two_or_more']
export const FILING_SEX: readonly Sex[] = ['female', 'male']

/** Hispanic or Latino; otherwise the one race chosen; otherwise Two or More Races. A declined ethnicity files no category. */
export function derive(hispanic: 'yes' | 'no' | 'declined' | null, races: readonly string[]): RaceEthnicity | null {
  if (hispanic === null) return null
  if (hispanic === 'declined') return 'declined'
  if (hispanic === 'yes') return 'hispanic_latino'
  const chosen = races.filter(race => race !== 'declined')
  if (chosen.length === 0) return races.length ? 'declined' : null
  return chosen.length === 1 ? chosen[0] as RaceEthnicity : 'two_or_more'
}

export const hasFilingRace = (value: string | null): value is RaceEthnicity => FILING_RACE_ETHNICITY.includes(value as RaceEthnicity)
export const hasFilingSex = (value: string | null): value is Sex => FILING_SEX.includes(value as Sex)
