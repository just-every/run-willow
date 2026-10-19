import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, auditRead, commit, guard, insist, now, one, stmt } from '../core'
import type { Input } from '../input'
import { RACE_ETHNICITY, SEX, type EeoAnswers, type EeoRevision, type EeoSelf } from './types'

interface AnswerRow {
  sequence: number
  recorded_at: number
  recorded_on: string
  race_ethnicity: EeoAnswers['raceEthnicity']
  sex: EeoAnswers['sex']
}

function projection(row: AnswerRow): EeoRevision {
  return { sequence: row.sequence, recordedAt: row.recorded_at, recordedOn: row.recorded_on,
    raceEthnicity: row.race_ethnicity, sex: row.sex }
}

/** No target-person argument: even owners and HR may read only their own answers. */
export async function eeoSelf(env: Bindings, actor: Actor): Promise<EeoSelf> {
  insist(actor.personId, 'self_id_requires_person', 403)
  const rows = await all<AnswerRow>(env, `SELECT sequence, recorded_at, recorded_on, race_ethnicity, sex
    FROM wl_eeo_answers WHERE person_id = ? ORDER BY sequence DESC`, actor.personId)
  await auditRead(env, actor.id, 'eeo.self.read', actor.personId)
  const history = rows.map(projection)
  return { current: history[0] ?? null, history }
}

function optionalChoice<T extends string>(input: Input, name: string, choices: readonly { value: T }[]): T | null {
  const value = input.text(name, { optional: true, max: 64 })
  insist(value === '' || choices.some(choice => choice.value === value), `invalid_${name}`)
  return value === '' ? null : value as T
}

/** Each voluntary submission is a complete immutable snapshot, including blanks. */
export async function writeEeoSelf(env: Bindings, actor: Actor, input: Input): Promise<EeoRevision> {
  insist(actor.personId, 'self_id_requires_person', 403)
  // Reject person/actor overrides and unexpected free text before reading values.
  input.only(['raceEthnicity', 'sex', 'returnTo'])
  const raceEthnicity = optionalChoice(input, 'raceEthnicity', RACE_ETHNICITY)
  const sex = optionalChoice(input, 'sex', SEX)
  const previous = await one<{ sequence: number }>(env, 'SELECT MAX(sequence) AS sequence FROM wl_eeo_answers WHERE person_id = ?', actor.personId)
  const priorSequence = previous?.sequence ?? 0
  const sequence = priorSequence + 1, recordedAt = now(), recordedOn = actor.today
  await commit(env, [
    guard(env, 'stale', 'COALESCE((SELECT MAX(sequence) FROM wl_eeo_answers WHERE person_id = ?), 0) = ?', actor.personId, priorSequence),
    guard(env, 'self_id_access_changed', "EXISTS (SELECT 1 FROM wl_members WHERE id = ? AND person_id = ? AND status = 'active')", actor.id, actor.personId),
    stmt(env, `INSERT INTO wl_eeo_answers (person_id, sequence, race_ethnicity, sex, recorded_at, recorded_on, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, actor.personId, sequence, raceEthnicity, sex, recordedAt, recordedOn, actor.id),
  ], { actor: actor.id, action: 'eeo.self.write', subject: actor.personId })
  // No answer values or submitted field names enter audit details or notices.
  return { sequence, recordedAt, recordedOn, raceEthnicity, sex }
}
