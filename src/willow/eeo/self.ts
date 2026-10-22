import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, auditRead, commit, guard, insist, json, now, one, stmt } from '../core'
import type { Input } from '../input'
import { RULE_VERSION } from './forms'
import { parseEeoSubmission } from './submission'
import { type EeoAnswers, type EeoRecorded, type EeoRevision, type EeoSelf } from './types'
import { contractorStatus } from '../retention/settings'

export interface AnswerRow {
  sequence: number
  source?: EeoRevision['source']
  source_packet_id?: string | null
  source_sequence?: number | null
  contractor_forms?: string | null
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

export const ANSWER_COLUMNS = 'sequence, recorded_at, recorded_on, race_ethnicity, sex, form_version, hispanic, races, rule_version, veteran, veteran_classes, disability, source, source_packet_id, source_sequence, contractor_forms'

export function projection(row: AnswerRow): EeoRevision {
  return { sequence: row.sequence, source: row.source ?? 'employee/self-identified', sourcePacketId: row.source_packet_id ?? null, sourceSequence: row.source_sequence ?? null, contractorForms: row.contractor_forms ? json<Record<string,string>>(row.contractor_forms,{}) : null, recordedAt: row.recorded_at, recordedOn: row.recorded_on, raceEthnicity: row.race_ethnicity, sex: row.sex,
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

/** Each voluntary submission is a complete immutable snapshot, including blanks. */
export async function writeEeoSelf(env: Bindings, actor: Actor, input: Input): Promise<EeoRevision> {
  insist(actor.personId, 'self_id_requires_person', 403)
  const parsed = await parseEeoSubmission(env, actor.today, input)
  const { raceEthnicity, sex, hispanic, races, ruleVersion: rule, veteran, veteranClasses, disability, contractorForms, formVersion: version } = parsed.columns
  const previous = await one<{ sequence: number }>(env, 'SELECT MAX(sequence) AS sequence FROM wl_eeo_answers WHERE person_id = ?', actor.personId)
  const priorSequence = previous?.sequence ?? 0
  const sequence = priorSequence + 1, recordedAt = now(), recordedOn = actor.today
  await commit(env, [
    guard(env, 'stale', 'COALESCE((SELECT MAX(sequence) FROM wl_eeo_answers WHERE person_id = ?), 0) = ?', actor.personId, priorSequence),
    guard(env, 'self_id_access_changed', "EXISTS (SELECT 1 FROM wl_members WHERE id = ? AND person_id = ? AND status = 'active')", actor.id, actor.personId),
    stmt(env, `INSERT INTO wl_eeo_answers (person_id, sequence, race_ethnicity, sex, recorded_at, recorded_on, recorded_by, form_version, hispanic, races, rule_version, veteran, veteran_classes, disability, contractor_forms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, actor.personId, sequence, raceEthnicity, sex, recordedAt, recordedOn, actor.id, version, hispanic, races, rule,
      veteran, veteranClasses, disability, contractorForms),
  ], { actor: actor.id, action: 'eeo.self.write', subject: actor.personId })
  // No answer values or submitted field names enter audit details or notices.
  return projection({ sequence, recorded_at: recordedAt, recorded_on: recordedOn, race_ethnicity: raceEthnicity, sex, form_version: version, hispanic, races: races, rule_version: rule,
    veteran, veteran_classes: veteranClasses, disability, contractor_forms: contractorForms })
}
