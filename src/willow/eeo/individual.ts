// EEO compliance: one person's EEO record at a time for `eeo.individual` holders, with each
// answer's source, audited reads that carry no values, and HR-recorded categories from employment
// records for people who declined, left a question unanswered or gave no filing category.
import type { Bindings } from '../../auth.server'
import { canAbout, requireOwner, type Actor } from '../actor'
import { all, auditRead, commit, guard, insist, now, one, stmt } from '../core'
import type { Input } from '../input'
import { RULE_VERSION } from './forms'
import { FILING_RACE_ETHNICITY, FILING_SEX, hasFilingRace, hasFilingSex } from './rule'
import { ANSWER_COLUMNS, projection, recordedFor, type AnswerRow } from './self'
import { RACE_ETHNICITY, SEX, type EeoPerson, type EeoRevision, type FilingValue } from './types'

const label = (choices: readonly { value: string; label: string }[], value: string) => choices.find(choice => choice.value === value)?.label ?? value

/** The value EEO-1 uses: the person's latest answer when it has a filing category, otherwise the HR-recorded category. */
export function filing(history: EeoRevision[], recorded: { dimension: string; category: string; recordedOn: string }[]): EeoPerson['filing'] {
  const latest = history[0]
  const pick = (dimension: 'race_ethnicity' | 'sex', own: string | null | undefined, has: (value: string | null) => boolean, choices: readonly { value: string; label: string }[]): FilingValue | null => {
    if (latest && has(own ?? null)) return { value: own!, label: label(choices, own!), source: `self-identified (form version ${latest.formVersion}, ${latest.recordedOn})` }
    const hr = recorded.find(row => row.dimension === dimension)
    return hr ? { value: hr.category, label: label(choices, hr.category), source: `HR-recorded from employment records (${hr.recordedOn})` } : null
  }
  return { raceEthnicity: pick('race_ethnicity', latest?.raceEthnicity, hasFilingRace, RACE_ETHNICITY), sex: pick('sex', latest?.sex, hasFilingSex, SEX) }
}

async function employee(env: Bindings, personId: string) {
  const person = await one<{ id: string; legal_name: string }>(env, 'SELECT p.id, p.legal_name FROM wl_people p WHERE p.id = ? AND EXISTS (SELECT 1 FROM wl_periods e WHERE e.person_id = p.id)', personId)
  insist(person, 'not_found', 404)
  return person
}

function requireEeo(actor: Actor, personId: string) {
  insist(canAbout(actor, 'eeo.individual', personId), 'forbidden', 403)
}

export async function eeoPerson(env: Bindings, actor: Actor, personId: string): Promise<EeoPerson> {
  requireEeo(actor, personId)
  const person = await employee(env, personId)
  const history = (await all<AnswerRow>(env, `SELECT ${ANSWER_COLUMNS} FROM wl_eeo_answers WHERE person_id = ? ORDER BY sequence DESC`, personId)).map(projection)
  const recorded = await recordedFor(env, personId, { names: true })
  const latest = history[0]
  await auditRead(env, actor.id, 'eeo.individual.read', personId)
  return { person: { id: person.id, name: person.legal_name }, ruleVersion: RULE_VERSION, current: latest ?? null, history, recorded, filing: filing(history, recorded),
    mayRecord: { raceEthnicity: !hasFilingRace(latest?.raceEthnicity ?? null), sex: !hasFilingSex(latest?.sex ?? null) } }
}

export async function eeoPeople(env: Bindings, actor: Actor) {
  insist(actor.permissions.has('eeo.individual') || actor.scoped.some(grant => grant.permissions.has('eeo.individual')), 'forbidden', 403)
  return (await all<{ id: string; name: string }>(env, 'SELECT p.id, p.legal_name AS name FROM wl_people p WHERE EXISTS (SELECT 1 FROM wl_periods e WHERE e.person_id = p.id) ORDER BY p.legal_name'))
    .filter(row => canAbout(actor, 'eeo.individual', row.id))
}

/** A category from employment records, for someone who has no self-identified filing category; never for an applicant, never over their own answer. */
export async function recordEeoCategory(env: Bindings, actor: Actor, input: Input) {
  input.only(['person', 'dimension', 'category', 'employmentRecord', 'ruleVersion', 'returnTo'])
  const personId = input.text('person', { max: 64 })
  requireEeo(actor, personId)
  await employee(env, personId)
  const dimension = input.text('dimension', { max: 16 })
  insist(dimension === 'race_ethnicity' || dimension === 'sex', 'invalid_dimension')
  const category = input.text('category', { max: 40 })
  insist((dimension === 'sex' ? FILING_SEX : FILING_RACE_ETHNICITY).includes(category as never), 'invalid_category')
  const reference = input.text('employmentRecord', { max: 200 })
  insist(input.text('ruleVersion', { max: 40 }) === RULE_VERSION, 'unknown_rule_version')
  const latest = await one<{ sequence: number; race_ethnicity: string | null; sex: string | null }>(env, 'SELECT sequence, race_ethnicity, sex FROM wl_eeo_answers WHERE person_id = ? ORDER BY sequence DESC LIMIT 1', personId)
  const own = dimension === 'sex' ? latest?.sex ?? null : latest?.race_ethnicity ?? null
  insist(!(dimension === 'sex' ? hasFilingSex(own) : hasFilingRace(own)), 'self_identified_category_exists', 409)
  const previous = (await one<{ sequence: number | null }>(env, 'SELECT MAX(sequence) AS sequence FROM wl_eeo_recorded WHERE person_id = ?', personId))?.sequence ?? 0
  await commit(env, [
    guard(env, 'stale', 'COALESCE((SELECT MAX(sequence) FROM wl_eeo_recorded WHERE person_id = ?), 0) = ?', personId, previous),
    guard(env, 'stale', 'COALESCE((SELECT MAX(sequence) FROM wl_eeo_answers WHERE person_id = ?), 0) = ?', personId, latest?.sequence ?? 0),
    stmt(env, 'INSERT INTO wl_eeo_recorded (person_id, sequence, dimension, category, employment_record, rule_version, recorded_by, recorded_at, recorded_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      personId, previous + 1, dimension, category, reference, RULE_VERSION, actor.id, now(), actor.today),
  ], { actor: actor.id, action: 'eeo.record', subject: personId, detail: { dimension } })
  return { sequence: previous + 1 }
}

/** The owner assigns or removes EEO compliance for any active member, including themselves; nothing else implies it. */
export async function grantEeo(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['member', 'enabled', 'returnTo'])
  const member = input.text('member', { max: 100 }), enabled = input.flag('enabled')
  insist(await one(env, "SELECT 1 FROM wl_members WHERE id = ? AND status = 'active'", member), 'member_not_found', 404)
  await commit(env, [enabled
    ? stmt(env, 'INSERT INTO wl_permissions (member_id, permission, granted_by, granted_at) VALUES (?, ?, ?, ?) ON CONFLICT(member_id, permission) DO NOTHING', member, 'eeo.individual', actor.id, now())
    : stmt(env, "DELETE FROM wl_permissions WHERE member_id = ? AND permission = 'eeo.individual'", member)],
  { actor: actor.id, action: enabled ? 'eeo.grant' : 'eeo.revoke', subject: member })
  return { member, enabled }
}
