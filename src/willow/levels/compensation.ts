// ROLE-005: compensation is explicit, including self reads; approval stays separate.
import type { Bindings } from '../../auth.server'
import type { Actor, Permission } from '../actor'
import { all, insist } from '../core'
import type { Input } from '../input'
import { EVERYONE, levelScopes, scopeMembers, type Scope } from './scope'

export const COMPENSATION_FIELDS = ['pay', 'history', 'bands', 'bonus', 'equity', 'cycles'] as const
export type CompensationField = typeof COMPENSATION_FIELDS[number]
export type CompensationMode = 'none' | 'view' | 'approval' | 'edit'
export type CompensationSelfMode = 'none' | 'view'
export interface CompensationRules { self: Partial<Record<CompensationField, CompensationSelfMode>>; others: Partial<Record<CompensationField, CompensationMode>> }
export interface CompensationGrant { level: string; fields: CompensationRules; scope: Scope; members: Set<string> }
export type CompensationActor = Pick<Actor, 'owner' | 'permissions' | 'personId' | 'reports' | 'scoped'> & { compensationFields: CompensationGrant[] }
export const COMPENSATION_RANK: Record<CompensationMode, number> = { none: 0, view: 1, approval: 2, edit: 3 }
export const COMPENSATION_LABELS: Record<CompensationField, string> = { pay: 'Pay in force', history: 'Pay history', bands: 'Compensation bands', bonus: 'Bonus records', equity: 'Equity records', cycles: 'Compensation cycles' }
export const COMPENSATION_INPUTS = ['compensationFields', ...(['self', 'others'] as const).flatMap(relation => COMPENSATION_FIELDS.map(field => `compensationMode.${relation}.${field}`))]
export const emptyCompensationRules = (): CompensationRules => ({ self: {}, others: {} })

/** Omitted input preserves saved rules; supplied input replaces the definition. */
export function readCompensationRules(input: Input): CompensationRules | undefined {
 if (!COMPENSATION_INPUTS.some(name => input.provided(name))) return undefined
 const raw = input.provided('compensationFields') ? input.json('compensationFields') : Object.fromEntries((['self', 'others'] as const).map(relation => [relation, Object.fromEntries(COMPENSATION_FIELDS.filter(field => input.provided(`compensationMode.${relation}.${field}`)).map(field => [field, input.text(`compensationMode.${relation}.${field}`)]))]))
 insist(raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).every(key => key === 'self' || key === 'others'), 'invalid_compensation_fields')
 const result = emptyCompensationRules()
 for (const relation of ['self', 'others'] as const) {
  const value = (raw as Record<string, unknown>)[relation]
  if (value === undefined) continue
  insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_compensation_fields')
  for (const [field, mode] of Object.entries(value)) {
   insist((COMPENSATION_FIELDS as readonly string[]).includes(field) && typeof mode === 'string' && Object.hasOwn(COMPENSATION_RANK, mode) && (relation === 'others' || mode === 'none' || mode === 'view'), 'invalid_compensation_fields')
   if (relation === 'self') result.self[field as CompensationField] = mode as CompensationSelfMode
   else result.others[field as CompensationField] = mode as CompensationMode
  }
 }
 return result
}

export interface CompensationRuleRow { level_id: string; relation: 'self' | 'others'; field: CompensationField; mode: CompensationMode }
export const compensationRuleRows = (env: Bindings) => all<CompensationRuleRow>(env, 'SELECT * FROM wl_level_compensation_fields')

export async function compensationGrants(env: Bindings, member: string, person: string | null, date: string): Promise<CompensationGrant[]> {
 const rows = await all<CompensationRuleRow>(env, 'SELECT f.* FROM wl_level_compensation_fields f JOIN wl_member_levels a ON a.level_id=f.level_id WHERE a.member_id=?', member)
 if (!rows.length) return []
 const scopes = await levelScopes(env)
 return Promise.all([...new Set(rows.map(row => row.level_id))].map(async level => {
  const scope = scopes.get(level) ?? EVERYONE, fields = emptyCompensationRules()
  for (const row of rows.filter(row => row.level_id === level)) {
   if (row.relation === 'self') fields.self[row.field] = row.mode as CompensationSelfMode
   else fields.others[row.field] = row.mode
  }
  return { level, fields, scope, members: scope.kind === 'everyone' ? new Set<string>() : await scopeMembers(env, date, scope, person) }
 }))
}

/** Levels add independent rights; their scope never affects their self rules. */
export function compensationMode(actor: CompensationActor, person: string, field: CompensationField): CompensationMode {
 const self = actor.personId === person
 return actor.compensationFields.reduce<CompensationMode>((best, grant) => {
  if (!self && grant.scope.kind !== 'everyone' && !grant.members.has(person)) return best
  const mode = (self ? grant.fields.self : grant.fields.others)[field] ?? 'none'
  return COMPENSATION_RANK[mode] > COMPENSATION_RANK[best] ? mode : best
 }, 'none')
}

const holds = (actor: CompensationActor, person: string, permission: Permission) => actor.owner || actor.permissions.has(permission) || actor.scoped.some(grant => grant.permissions.has(permission) && grant.people.has(person))

/** Neither being the subject nor managing them grants a compensation read. */
export function readsCompensation(actor: CompensationActor, person: string, field: CompensationField): boolean {
 if (holds(actor, person, 'pay.read')) return true
 return compensationMode(actor, person, field) !== 'none'
}

/** Exact-field edit authority; cycle publication still requires compensation.approve. */
export function canEditCompensation(actor: CompensationActor, person: string, field: CompensationField = 'pay'): boolean {
 if (actor.personId === person) return false
 return (holds(actor, person, 'people.manage') && holds(actor, person, 'pay.read')) || compensationMode(actor, person, field) === 'edit'
}

/** Entry only: existing manager/HR percentage requests reveal no pay amounts. */
export function canRequestCompensation(actor: CompensationActor, person: string, field: CompensationField = 'pay'): boolean {
 if (actor.personId === person) return false
 const mode = compensationMode(actor, person, field)
 return (field === 'pay' && (holds(actor, person, 'people.manage') || actor.reports.has(person))) || (holds(actor, person, 'pay.read') && holds(actor, person, 'people.manage')) || mode === 'approval' || mode === 'edit'
}
