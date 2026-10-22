// Bonus/equity custody is independent of salary, cycle budgets and provider work.
import type { Bindings } from '../../auth.server'
import { actorFor, type Actor } from '../actor'
import { all, auditRead, commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { requireDate } from '../dates'
import { Input } from '../input'
import { levelSessionFence } from '../levels/delegation'
import { canEditCompensation, readsCompensation, type CompensationField } from '../levels/compensation'
import { termsOn } from '../people'
import { activeTemplate, caseStatements } from '../lifecycle'
import { businessVersion, cents, guardBandSnapshot } from './bands'

export type AwardKind = 'bonus' | 'equity'
export interface CompensationRecordPlan {
 kind: AwardKind
 record?: string
 revision?: string
 effectiveDate: string
 amount?: string
 currency?: string
 units?: string
 security?: string
 note: string
}
const KEYS = ['kind', 'record', 'revision', 'effectiveDate', 'amount', 'currency', 'units', 'security', 'note']
const optional = (input: Input, name: string, max: number) => input.text(name, { optional: true, max })

/** Exact decimal equity units are strings throughout; they never pass through float arithmetic. */
function equityUnits(value: string) {
 insist(/^\d{1,15}(\.\d{1,6})?$/.test(value), 'invalid_equity_units')
 const [whole, decimal = ''] = value.split('.')
 const fraction = decimal.replace(/0+$/, '')
 return `${BigInt(whole)}${fraction ? `.${fraction}` : ''}`
}
export function readCompensationRecord(input: Input): CompensationRecordPlan {
 const kind = input.text('kind')
 insist(kind === 'bonus' || kind === 'equity', 'invalid_compensation_record_kind')
 const record = optional(input, 'record', 100), revision = optional(input, 'revision', 100)
 insist(!!record === !!revision, 'compensation_record_revision_required')
 const base = { kind, ...(record ? { record, revision } : {}), effectiveDate: requireDate(input.text('effectiveDate'), 'invalid_effectiveDate'), note: optional(input, 'note', 1000) }
 if (kind === 'bonus') {
  insist(!input.has('units') && !input.has('security'), 'unexpected_equity_values')
  const amount = input.text('amount', { max: 20 }), currency = input.text('currency', { max: 3 })
  cents(amount)
  insist(/^[A-Z]{3}$/.test(currency), 'invalid_currency')
  return { ...base, kind, amount, currency }
 }
 insist(!input.has('amount') && !input.has('currency'), 'unexpected_bonus_values')
 return { ...base, kind, units: equityUnits(input.text('units', { max: 24 })), security: input.text('security', { max: 160 }) }
}
export function parseCompensationRecord(value: unknown): CompensationRecordPlan {
 insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_compensation_record')
 const input = Input.of(value as Record<string, unknown>)
 input.only(KEYS)
 return readCompensationRecord(input)
}

async function recordActor(env: Bindings, actor: Actor) {
 const row = await one(env, 'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?', actor.id)
 insist(row, 'forbidden', 403)
 return actorFor(env, { id: row.id, email: row.email, name: row.name, personId: row.person_id, owner: row.role === 'owner', sessionId: actor.sessionId })
}

/** Only FLOW-004 final execution sets approved; its chain remains the approval authority. */
export async function prepareCompensationRecord(env: Bindings, actor: Actor, person: string, submitted: CompensationRecordPlan, { approved = false, template = '' } = {}) {
 const source = await businessVersion(env)
 actor = await recordActor(env, actor)
 const plan = parseCompensationRecord(submitted)
 insist(actor.personId !== person, 'own_compensation', 403)
 if (!approved) insist(canEditCompensation(actor, person, plan.kind), 'compensation_field_forbidden', 403)
 insist(await one(env, 'SELECT 1 FROM wl_people WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)', person), 'person_not_found', 404)
 const previous = plan.record ? await one(env, 'SELECT * FROM wl_comp_records WHERE record_id=? ORDER BY version DESC LIMIT 1', plan.record) : null
 insist(!plan.record || previous?.person_id === person && previous.kind === plan.kind, 'compensation_record_not_found', 404)
 insist(!previous || previous.revision === plan.revision, 'stale', 409)
 const period = await one(env, 'SELECT * FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?) ORDER BY start_date DESC LIMIT 1', person, plan.effectiveDate, plan.effectiveDate)
 insist(period, 'period_not_found', 404)
 const id = previous?.record_id ?? newId(), revision = newId(), version = (previous?.version ?? 0) + 1
 const opened = template ? await caseStatements(env, actor, await activeTemplate(env, template, 'mover'), person, period.id, plan.effectiveDate, (await termsOn(env, period.id, plan.effectiveDate))?.manager_person_id ?? null) : null
 const guards = [guardBandSnapshot(env, source), levelSessionFence(env, actor),
  guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_periods WHERE id=? AND revision=?)', period.id, period.revision),
  guard(env, 'stale', '(SELECT COALESCE(MAX(version),0) FROM wl_comp_records WHERE record_id=?)=?', id, version - 1)]
 return {
  guards,
  statements: [...guards,
   stmt(env, 'INSERT INTO wl_comp_records(revision,record_id,version,previous_revision,person_id,period_id,kind,effective_date,amount_cents,currency,units,security,note,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', revision, id, version, previous?.revision ?? null, person, period.id, plan.kind, plan.effectiveDate, plan.kind === 'bonus' ? cents(plan.amount!) : null, plan.currency ?? null, plan.units ?? null, plan.security ?? null, plan.note, actor.id, now()),
   ...(opened?.statements ?? [])],
  audit: { actor: actor.id, action: previous ? 'compensation.record.correct' : 'compensation.record.create', subject: id, detail: { person, kind: plan.kind, revision, previous: previous?.revision ?? null, effectiveDate: plan.effectiveDate } },
  result: { id, revision, version, kind: plan.kind, person, effectiveDate: plan.effectiveDate, terms: null, case: opened?.caseId ?? null, period: period.id },
 }
}

export async function writeCompensationRecord(env: Bindings, actor: Actor, input: Input) {
 input.only(['person', ...KEYS, 'returnTo'])
 const prepared = await prepareCompensationRecord(env, actor, input.text('person'), readCompensationRecord(input))
 await commit(env, prepared.statements, prepared.audit)
 return prepared.result
}

const projection = (row: Row) => ({ id: row.record_id, revision: row.revision, version: row.version, source: 'native', kind: row.kind, person: row.person_id, period: row.period_id, effectiveDate: row.effective_date,
 ...(row.kind === 'bonus' ? { amountCents: row.amount_cents, currency: row.currency } : { units: row.units, security: row.security }), note: row.note, recordedAt: row.recorded_at })

/** History never admits a kind the reader cannot see; cycle bonuses remain in native custody. */
export async function records(env: Bindings, actor: Actor, person: string, allow?:(field:CompensationField)=>boolean) {
 const kinds = (['bonus', 'equity'] as const).filter(kind => readsCompensation(actor, person, kind)&&(!allow||allow(kind)))
 const result: { bonus: Row[]; equity: Row[] } = { bonus: [], equity: [] }
 if (!kinds.length) return result
 const history = readsCompensation(actor, person, 'history')&&(!allow||allow('history'))
 const rows = await all(env, `SELECT r.* FROM wl_comp_records r WHERE r.person_id=? AND r.kind IN (${kinds.map(() => '?').join(',')}) ${history ? '' : 'AND r.version=(SELECT MAX(v.version) FROM wl_comp_records v WHERE v.record_id=r.record_id)'} ORDER BY r.effective_date DESC,r.recorded_at DESC,r.version DESC`, person, ...kinds)
 for (const row of rows) result[row.kind as AwardKind].push(projection(row))
 if (kinds.includes('bonus')) {
  const bonuses = await all(env, "SELECT b.*,c.name FROM wl_comp_bonuses b JOIN wl_comp_cycles c ON c.id=b.cycle_id WHERE b.person_id=? AND c.status='published' ORDER BY b.effective_from DESC,b.recorded_at DESC", person)
  result.bonus.push(...bonuses.map(row => ({ id: row.id, revision: row.id, version: 1, source: 'cycle', kind: 'bonus', person: row.person_id, period: row.period_id, effectiveDate: row.effective_from, amountCents: row.amount_cents, currency: 'USD', cycle: row.cycle_id, name: row.name, recordedAt: row.recorded_at })))
  result.bonus.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.recordedAt - a.recordedAt)
 }
 await auditRead(env, actor.id, 'compensation.records.read', person, { kinds, history })
 return result
}
