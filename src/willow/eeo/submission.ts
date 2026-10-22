// One voluntary snapshot parser for employees, preboarding hires and application-bound invitations.
import type { Bindings } from '../../auth.server'
import { insist, now } from '../core'
import type { Input } from '../input'
import { contractorStatus } from '../retention/settings'
import { CONTRACTOR_FORMS, HISPANIC, RACES, RULE_VERSION, VETERAN_CHOICES, VETERAN_CLASSES, DISABILITY } from './forms'
import { derive } from './rule'
import { RACE_ETHNICITY, SEX, type EeoAnswers, type EeoRevision } from './types'
export const SUBMISSION_FIELDS = ['raceEthnicity', 'hispanic', 'races', 'sex', 'veteran', 'veteranClasses', 'disability', 'returnTo']

function optionalChoice<T extends string>(input: Input, name: string, choices: readonly { value: T }[]): T | null {
  const value = input.text(name, { optional: true, max: 64 })
  insist(value === '' || choices.some(choice => choice.value === value), `invalid_${name}`)
  return value === '' ? null : value as T
}

function subset(input: Input, name: string, choices: readonly { value: string }[]): string[] {
  const values = [...new Set(input.list(name))]
  insist(values.every(value => choices.some(choice => choice.value === value)), `invalid_${name}`)
  return values
}


export async function parseEeoSubmission(env: Bindings, today: string, input: Input, allowed = SUBMISSION_FIELDS) {
  // Reject person/actor overrides and unexpected free text before reading values.
  input.only(allowed)
  const legacy = input.provided('raceEthnicity') && !input.provided('hispanic') && !input.provided('races')
  insist(!input.provided('raceEthnicity') || legacy, 'invalid_raceEthnicity')
  let raceEthnicity: EeoAnswers['raceEthnicity'], hispanic: EeoRevision['hispanic'] = null, races: string[] | null = null
  if (legacy) raceEthnicity = optionalChoice(input, 'raceEthnicity', RACE_ETHNICITY)
  else {
    hispanic = optionalChoice(input, 'hispanic', HISPANIC)
    races = subset(input, 'races', RACES)
    insist(!races.includes('declined') || races.length === 1, 'invalid_races')
    insist(hispanic !== null || races.length === 0, 'hispanic_required_before_race')
    raceEthnicity = derive(hispanic, races)
    if (hispanic === null) races = null
  }
  const sex = optionalChoice(input, 'sex', SEX)
  const contractor = (await contractorStatus(env, today)).contractor
  const veteran = optionalChoice(input, 'veteran', VETERAN_CHOICES), disability = optionalChoice(input, 'disability', DISABILITY)
  const classes = subset(input, 'veteranClasses', VETERAN_CLASSES)
  insist(contractor || (veteran === null && disability === null && classes.length === 0), 'contractor_forms_not_offered', 409)
  insist(veteran === 'protected' || classes.length === 0, 'invalid_veteranClasses')
  const recordedAt = now(), formVersion = legacy ? 1 as const : 2 as const, ruleVersion = legacy ? null : RULE_VERSION
  const columns = { raceEthnicity, sex, hispanic, races: races === null ? null : JSON.stringify(races), ruleVersion,
    veteran, veteranClasses: veteran === 'protected' ? JSON.stringify(classes) : null, disability,
    contractorForms: contractor ? JSON.stringify(CONTRACTOR_FORMS) : null, formVersion }
  const revision: EeoRevision = { sequence: 1, recordedAt, recordedOn: today, raceEthnicity, sex, formVersion, hispanic, races, ruleVersion,
    veteran, veteranClasses: veteran === 'protected' ? classes : null, disability }
  return { revision, columns }
}
