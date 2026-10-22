// Definition maintenance is employer-wide; scoped fields only admit bounded reads.
import type { Bindings } from '../../auth.server'
import { actorFor, can, type Actor } from '../actor'
import { guard, insist, one } from '../core'
import { requireDate } from '../dates'
import { Input } from '../input'
import { levelSessionFence } from '../levels/delegation'
import { COMPENSATION_RANK, type CompensationMode } from '../levels/compensation'
import { businessVersion, cents, guardBandSnapshot, prepareBand } from './bands'
import { prepareCycle } from './cycles'

export type DefinitionKind = 'bands' | 'cycles'
export interface BandValues { jobTitle: string; level: string; location: string; basis: string; effectiveFrom: string; minimum: string; maximum: string }
export interface CycleValues { name: string; kind: string; effectiveFrom: string; budget: string }
export type DefinitionPlan = { kind: 'bands'; values: BandValues; person?: string } | { kind: 'cycles'; values: CycleValues; person?: string }
const money = (value: string) => (cents(value) / 100).toFixed(2)

export function readCompensationDefinition(kind: DefinitionKind, input: Input): DefinitionPlan {
 const person = input.text('person', { optional: true, max: 100 })
 const effectiveFrom = requireDate(input.text('effectiveFrom'), 'invalid_effectiveFrom')
 if (kind === 'bands') {
  const basis = input.text('basis', { max: 10 })
  insist(basis === 'salary' || basis === 'hourly', 'invalid_basis')
  const minimum = money(input.text('minimum')), maximum = money(input.text('maximum'))
  insist(cents(maximum) >= cents(minimum), 'invalid_band_range')
  return { kind, ...(person ? { person } : {}), values: { jobTitle: input.text('jobTitle', { max: 120 }), level: input.text('level', { max: 120 }), location: input.text('location', { optional: true, max: 100 }), basis, effectiveFrom, minimum, maximum } }
 }
 const cycleKind = input.text('kind')
 insist(['merit', 'promotion', 'bonus'].includes(cycleKind), 'invalid_kind')
 return { kind, ...(person ? { person } : {}), values: { name: input.text('name', { max: 120 }), kind: cycleKind, effectiveFrom, budget: money(input.text('budget')) } }
}

export function parseCompensationDefinition(value: unknown): DefinitionPlan {
 insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_compensation_definition')
 const input = Input.of(value as Record<string, unknown>)
 input.only(['kind', 'values', 'person'])
 const kind = input.text('kind')
 insist(kind === 'bands' || kind === 'cycles', 'invalid_compensation_definition_kind')
 const values = input.json('values')
 insist(values && typeof values === 'object' && !Array.isArray(values), 'invalid_compensation_definition')
 const fields = Input.of(values as Record<string, unknown>)
 fields.only(kind === 'bands' ? ['jobTitle', 'level', 'location', 'basis', 'effectiveFrom', 'minimum', 'maximum'] : ['name', 'kind', 'effectiveFrom', 'budget'])
 return readCompensationDefinition(kind, Input.of({ ...values, person: input.text('person', { optional: true, max: 100 }) }))
}

export const broadDefinitionMaintenance = (actor: Actor) => can(actor, 'people.manage') && can(actor, 'pay.read')
/** An individual scoped Edit cannot maintain an employer-wide definition. */
export function compensationDefinitionMode(actor: Actor, kind: DefinitionKind): CompensationMode {
 if (broadDefinitionMaintenance(actor)) return 'edit'
 return actor.compensationFields.reduce<CompensationMode>((best, grant) => {
  const mode = grant.scope.kind === 'everyone' ? grant.fields.others[kind] ?? 'none' : 'none'
  return COMPENSATION_RANK[mode] > COMPENSATION_RANK[best] ? mode : best
 }, 'none')
}
export const canRequestCompensationDefinition = (actor: Actor, person: string, kind: DefinitionKind) => actor.personId !== person && ['approval', 'edit'].includes(compensationDefinitionMode(actor, kind))
export const readsWholeDefinition = (actor: Actor, kind: DefinitionKind) => can(actor, 'pay.read') || compensationDefinitionMode(actor, kind) !== 'none'
export const hasDefinitionRead = (actor: Actor, kind: DefinitionKind) => readsWholeDefinition(actor, kind) || actor.compensationFields.some(grant => (grant.fields.self[kind] ?? 'none') !== 'none' || (grant.fields.others[kind] ?? 'none') !== 'none') || actor.scoped.some(grant => grant.permissions.has('pay.read'))

export async function freshDefinitionActor(env: Bindings, actor: Actor) {
 const row = await one(env, 'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?', actor.id)
 insist(row, 'forbidden', 403)
 return actorFor(env, { id: row.id, email: row.email, name: row.name, personId: row.person_id, owner: row.role === 'owner', sessionId: actor.sessionId })
}
export async function definitionAuthority(env: Bindings, actor: Actor, kind: DefinitionKind, person?: string, approved = false) {
 const source = await businessVersion(env)
 actor = await freshDefinitionActor(env, actor)
 if (!approved) insist(compensationDefinitionMode(actor, kind) === 'edit', 'compensation_definition_forbidden', 403)
 if (person || approved || !broadDefinitionMaintenance(actor)) {
  insist(person && person !== actor.personId, 'own_compensation', 403)
  insist(await one(env, 'SELECT 1 FROM wl_people WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)', person), 'person_not_found', 404)
 }
 return { actor, guards: [guardBandSnapshot(env, source), levelSessionFence(env, actor), ...(person ? [guard(env, 'person_not_found', 'EXISTS(SELECT 1 FROM wl_people WHERE id=?)', person)] : [])] }
}

/** Wrappers route only Approval to FLOW-004; preparations never publish requests. */
export async function requestDefinition(env: Bindings, actor: Actor, person: string, plan: DefinitionPlan) {
 insist(canRequestCompensationDefinition(actor, person, plan.kind), 'compensation_definition_forbidden', 403)
 const { requestChange } = await import('../change-requests/requests')
 return requestChange(env, actor, Input.of({ person, effectiveFrom: plan.values.effectiveFrom, reason: plan.kind === 'bands' ? 'Compensation band definition' : 'Compensation cycle definition', compensationDefinition: { ...plan, person } }))
}
export async function prepareCompensationDefinition(env: Bindings, actor: Actor, person: string, submitted: DefinitionPlan, { approved = false } = {}) {
 const plan = parseCompensationDefinition(submitted)
 insist(!plan.person || plan.person === person, 'compensation_definition_person_mismatch')
 const input = Input.of({ ...plan.values, person })
 return plan.kind === 'bands' ? prepareBand(env, actor, input, { approved }) : prepareCycle(env, actor, input, { approved })
}
