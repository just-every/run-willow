// ROLE-006: additive ordinary leave rights, independent from confidential reasons.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, insist } from '../core'
import type { Input } from '../input'
import { EVERYONE, levelScopes, scopeMembers, type Scope } from './scope'

export const LEAVE_FIELDS = ['balances', 'ledger', 'requests', 'calendar', 'policies'] as const
export type LeaveField = typeof LEAVE_FIELDS[number]
export type LeaveMode = 'none' | 'view' | 'approval' | 'edit'
export type LeaveSelfRules = Partial<Record<'balances' | 'ledger' | 'policies', 'none' | 'view'> & Record<'requests' | 'calendar', LeaveMode>>
export interface LeaveRules { self: LeaveSelfRules; others: Partial<Record<LeaveField, LeaveMode>> }
export interface LeaveGrant { level: string; fields: LeaveRules; scope: Scope; members: Set<string> }
export type LeaveActor = Pick<Actor, 'owner' | 'permissions' | 'personId' | 'reports' | 'scoped'> & { leaveFields: LeaveGrant[] }
export const LEAVE_RANK: Record<LeaveMode, number> = { none: 0, view: 1, approval: 2, edit: 3 }
export const LEAVE_LABELS: Record<LeaveField, string> = { balances: 'Leave balances', ledger: 'Leave ledger', requests: 'Leave requests', calendar: 'Absence calendar', policies: 'Leave policies' }
export const LEAVE_INPUTS = ['leaveFields', ...(['self', 'others'] as const).flatMap(relation => LEAVE_FIELDS.map(field => `leaveMode.${relation}.${field}`))]
export const emptyLeaveRules = (): LeaveRules => ({ self: {}, others: {} })

/** Omitted input preserves saved rules; supplied input replaces the rule definition. */
export function readLeaveRules(input: Input): LeaveRules | undefined {
 if (!LEAVE_INPUTS.some(name => input.provided(name))) return undefined
 const raw = input.provided('leaveFields') ? input.json('leaveFields') : Object.fromEntries((['self', 'others'] as const).map(relation => [relation, Object.fromEntries(LEAVE_FIELDS.filter(field => input.provided(`leaveMode.${relation}.${field}`)).map(field => [field, input.text(`leaveMode.${relation}.${field}`)]))]))
 insist(raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).every(key => key === 'self' || key === 'others'), 'invalid_leave_fields')
 const result = emptyLeaveRules()
 for (const relation of ['self', 'others'] as const) {
  const value = (raw as Record<string, unknown>)[relation]
  if (value === undefined) continue
  insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_leave_fields')
  for (const [field, mode] of Object.entries(value)) {
   insist((LEAVE_FIELDS as readonly string[]).includes(field) && typeof mode === 'string' && Object.hasOwn(LEAVE_RANK, mode), 'invalid_leave_fields')
   insist(relation === 'others' || field === 'requests' || field === 'calendar' || mode === 'none' || mode === 'view', 'invalid_leave_fields')
   if (relation === 'self') Object.assign(result.self, { [field]: mode })
   else result.others[field as LeaveField] = mode as LeaveMode
  }
 }
 return result
}

export interface LeaveRuleRow { level_id: string; relation: 'self' | 'others'; field: LeaveField; mode: LeaveMode }
export const leaveRuleRows = (env: Bindings) => all<LeaveRuleRow>(env, 'SELECT * FROM wl_level_leave_fields')

export async function leaveGrants(env: Bindings, member: string, person: string | null, date: string): Promise<LeaveGrant[]> {
 const rows = await all<LeaveRuleRow>(env, 'SELECT f.* FROM wl_level_leave_fields f JOIN wl_member_levels a ON a.level_id=f.level_id WHERE a.member_id=?', member)
 if (!rows.length) return []
 const scopes = await levelScopes(env)
 return Promise.all([...new Set(rows.map(row => row.level_id))].map(async level => {
  const scope = scopes.get(level) ?? EVERYONE, fields = emptyLeaveRules()
  for (const row of rows.filter(row => row.level_id === level)) {
   if (row.relation === 'self') Object.assign(fields.self, { [row.field]: row.mode })
   else fields.others[row.field] = row.mode
  }
  return { level, fields, scope, members: scope.kind === 'everyone' ? new Set<string>() : await scopeMembers(env, date, scope, person) }
 }))
}

/** Explicit level authority only: each about-others source follows its own scope. */
export function leaveMode(actor: LeaveActor, person: string, field: LeaveField): LeaveMode {
 const self = actor.personId === person
 return actor.leaveFields.reduce<LeaveMode>((best, grant) => {
  if (!self && grant.scope.kind !== 'everyone' && !grant.members.has(person)) return best
  const mode = (self ? grant.fields.self : grant.fields.others)[field] ?? 'none'
  return LEAVE_RANK[mode] > LEAVE_RANK[best] ? mode : best
 }, 'none')
}

const managesLeave = (actor: LeaveActor, person: string) => actor.owner || actor.permissions.has('leave.manage') || actor.scoped.some(grant => grant.permissions.has('leave.manage') && grant.people.has(person))
export const hasLeaveBaseline = (actor: LeaveActor, person: string) => actor.personId === person || actor.reports.has(person) || managesLeave(actor, person)
export const anyLeaveGrant = (actor: LeaveActor, person: string) => LEAVE_FIELDS.some(field => leaveMode(actor, person, field) !== 'none')

/** Admission remains with the caller. This never grants the leave_reason facet. */
export const readsLeaveField = (actor: LeaveActor, person: string, field: LeaveField) => hasLeaveBaseline(actor, person) || leaveMode(actor, person, field) !== 'none'

const requestWrite = (actor: LeaveActor, person: string) => {
 const mode = leaveMode(actor, person, 'requests')
 return mode === 'edit' || mode === 'approval'
}

/** Entry only: requests still follow native routed approval and reservation guards. */
export const canRequestLeave = (actor: LeaveActor, person: string) => actor.personId === person || managesLeave(actor, person) || requestWrite(actor, person)

/** Authority only: native pending/future-date and routed-approver rules still apply. */
export const canCancelLeave = (actor: LeaveActor, person: string) => actor.personId === person || managesLeave(actor, person) || requestWrite(actor, person)

/** Propose an adjustment; owner-only publication and immutable ledger rules remain. */
export function canAdjustLeave(actor: LeaveActor, person: string): boolean {
 if (managesLeave(actor, person)) return true
 if (actor.personId === person) return false
 const mode = leaveMode(actor, person, 'balances')
 return mode === 'edit' || mode === 'approval'
}
