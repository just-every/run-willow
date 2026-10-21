import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, auditRead, commit, guard, insist, json, now, one, stmt } from '../core'
import type { Input } from '../input'
import { CONTRACTOR_FORMS, HISPANIC, RACES, RULE_VERSION, VETERAN_CHOICES, VETERAN_CLASSES, DISABILITY } from './forms'
import { derive } from './rule'
import { RACE_ETHNICITY, SEX, type EeoAnswers, type EeoRecorded, type EeoRevision, type EeoSelf } from './types'
import { contractorStatus } from '../retention/settings'

export interface AnswerRow {
  sequence: number
  recorded_at: number
  recorded_on: string
  race_ethnicity: EeoAnswers['raceEthnicity']
  sex: EeoAnswers['sex']
  form_version: 1 | 2
  hispanic: EeoRevision['hispanic']
  races: string | null
  rule_version: string | null
  veteran: EeoRevision['veteran']
  veteran_classes: string | null
  disability: EeoRevision['disability']
}

export const ANSWER_COLUMNS = 'sequence, recorded_at, recorded_on, race_ethnicity, sex, form_version, hispanic, races, rule_version, veteran, veteran_classes, disability'

export function projection(row: AnswerRow): EeoRevision {
  return { sequence: row.sequence, recordedAt: row.recorded_at, recordedOn: row.recorded_on, raceEthnicity: row.race_ethnicity, sex: row.sex,
    formVersion: row.form_version, hispanic: row.hispanic, races: row.races ? json<string[]>(row.races, []) : null, ruleVersion: row.rule_version,
    veteran: row.veteran, veteranClasses: row.veteran_classes ? json<string[]>(row.veteran_classes, []) : null, disability: row.disability }
}

export async function recordedFor(env: Bindings, personId: string, { names = false } = {}): Promise<EeoRecorded[]> {
  const rows = await all<{ sequence: number; dimension: EeoRecorded['dimension']; category: string; employment_record: string; rule_version: string; recorded_on: string; recorded_by: string }>(env,
    'SELECT sequence, dimension, category, employment_record, rule_version, recorded_on, recorded_by FROM wl_eeo_recorded WHERE person_id = ? ORDER BY sequence DESC', personId)
  const members = names ? new Map((await all<{ id: string; name: string }>(env, 'SELECT id, name FROM wl_members')).map(row => [row.id, row.name])) : new Map<string, string>()
  return rows.map(row => ({ sequence: row.sequence, dimension: row.dimension, category: row.category, employmentRecord: row.employment_record, ruleVersion: row.rule_version,
    recordedBy: names ? members.get(row.recorded_by) ?? null : null, recordedOn: row.recorded_on, label: 'HR-recorded from employment records' }))
}

/** No target-person argument: even owners and HR may read only their own answers. */
export async function eeoSelf(env: Bindings, actor: Actor): Promise<EeoSelf> {
  insist(actor.personId, 'self_id_requires_person', 403)
  const rows = await all<AnswerRow>(env, `SELECT ${ANSWER_COLUMNS} FROM wl_eeo_answers WHERE person_id = ? ORDER BY sequence DESC`, actor.personId)
  await auditRead(env, actor.id, 'eeo.self.read', actor.personId)
  const history = rows.map(projection)
  return { current: history[0] ?? null, history, recorded: await recordedFor(env, actor.personId), form: { version: 2, ruleVersion: RULE_VERSION, contractor: (await contractorStatus(env, actor.today)).contractor } }
}

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

/** Each voluntary submission is a complete immutable snapshot, including blanks. */
export async function writeEeoSelf(env: Bindings, actor: Actor, input: Input): Promise<EeoRevision> {
  insist(actor.personId, 'self_id_requires_person', 403)
  // Reject person/actor overrides and unexpected free text before reading values.
  input.only(['raceEthnicity', 'hispanic', 'races', 'sex', 'veteran', 'veteranClasses', 'disability', 'returnTo'])
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
  const contractor = (await contractorStatus(env, actor.today)).contractor
  const veteran = optionalChoice(input, 'veteran', VETERAN_CHOICES), disability = optionalChoice(input, 'disability', DISABILITY)
  const classes = subset(input, 'veteranClasses', VETERAN_CLASSES)
  insist(contractor || (veteran === null && disability === null && classes.length === 0), 'contractor_forms_not_offered', 409)
  insist(veteran === 'protected' || classes.length === 0, 'invalid_veteranClasses')
  const previous = await one<{ sequence: number }>(env, 'SELECT MAX(sequence) AS sequence FROM wl_eeo_answers WHERE person_id = ?', actor.personId)
  const priorSequence = previous?.sequence ?? 0
  const sequence = priorSequence + 1, recordedAt = now(), recordedOn = actor.today
  const version = legacy ? 1 : 2, rule = legacy ? null : RULE_VERSION
  await commit(env, [
    guard(env, 'stale', 'COALESCE((SELECT MAX(sequence) FROM wl_eeo_answers WHERE person_id = ?), 0) = ?', actor.personId, priorSequence),
    guard(env, 'self_id_access_changed', "EXISTS (SELECT 1 FROM wl_members WHERE id = ? AND person_id = ? AND status = 'active')", actor.id, actor.personId),
    stmt(env, `INSERT INTO wl_eeo_answers (person_id, sequence, race_ethnicity, sex, recorded_at, recorded_on, recorded_by, form_version, hispanic, races, rule_version, veteran, veteran_classes, disability, contractor_forms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, actor.personId, sequence, raceEthnicity, sex, recordedAt, recordedOn, actor.id, version, hispanic, races === null ? null : JSON.stringify(races), rule,
      veteran, veteran === 'protected' ? JSON.stringify(classes) : null, disability, contractor ? JSON.stringify(CONTRACTOR_FORMS) : null),
  ], { actor: actor.id, action: 'eeo.self.write', subject: actor.personId })
  // No answer values or submitted field names enter audit details or notices.
  return projection({ sequence, recorded_at: recordedAt, recorded_on: recordedOn, race_ethnicity: raceEthnicity, sex, form_version: version, hispanic, races: races === null ? null : JSON.stringify(races), rule_version: rule,
    veteran, veteran_classes: veteran === 'protected' ? JSON.stringify(classes) : null, disability })
}
