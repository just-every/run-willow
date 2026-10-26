// ROLE-008: additional reads of released reviews and shared goals, never raw inputs or HR notes.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, insist } from '../core'
import type { Input } from '../input'
import { EVERYONE, levelScopes, scopeMembers, type Scope } from './scope'

export const PERFORMANCE_FIELDS = ['reviews', 'goals', 'engagement', 'trainingAssignments', 'trainingCompletions', 'trainingCertifications'] as const
export type PerformanceField = typeof PERFORMANCE_FIELDS[number]
export type PerformanceMode = 'none' | 'view' | 'approval' | 'edit'
export const PERFORMANCE_RANK: Record<PerformanceMode,number> = {none:0,view:1,approval:2,edit:3}
export interface PerformanceRules { self: Partial<Record<PerformanceField, PerformanceMode>>; others: Partial<Record<PerformanceField, PerformanceMode>> }
export interface PerformanceGrant { level: string; fields: PerformanceRules; scope: Scope; members: Set<string> }
export const PERFORMANCE_LABELS: Record<PerformanceField, string> = { reviews: 'Released reviews', goals: 'Goals and check-ins', engagement: 'Published engagement themes', trainingAssignments: 'Training assignments', trainingCompletions: 'Training completions', trainingCertifications: 'Training certifications' }
export const PERFORMANCE_INPUTS = ['performanceFields', ...(['self', 'others'] as const).flatMap(relation => PERFORMANCE_FIELDS.map(field => `performanceMode.${relation}.${field}`))]
export const emptyPerformanceRules = (): PerformanceRules => ({ self: {}, others: {} })

export function readPerformanceRules(input: Input): PerformanceRules | undefined {
 if (!PERFORMANCE_INPUTS.some(name => input.provided(name))) return undefined
 const raw = input.provided('performanceFields') ? input.json('performanceFields') : Object.fromEntries((['self', 'others'] as const).map(relation => [relation, Object.fromEntries(PERFORMANCE_FIELDS.filter(field => input.provided(`performanceMode.${relation}.${field}`)).map(field => [field, input.text(`performanceMode.${relation}.${field}`)]))]))
 insist(raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).every(key => key === 'self' || key === 'others'), 'invalid_performance_fields')
 const rules = emptyPerformanceRules()
 for (const relation of ['self', 'others'] as const) {
  const value = (raw as Record<string, unknown>)[relation]
  if (value === undefined) continue
  insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_performance_fields')
  for (const [field, mode] of Object.entries(value)) {
   insist((PERFORMANCE_FIELDS as readonly string[]).includes(field) && typeof mode==='string' && Object.hasOwn(PERFORMANCE_RANK,mode) && (field!=='engagement'||mode==='none'||mode==='view'), 'invalid_performance_fields')
   rules[relation][field as PerformanceField] = mode as PerformanceMode
  }
 }
 return rules
}
export interface PerformanceRuleRow { level_id: string; relation: 'self' | 'others'; field: PerformanceField; mode: PerformanceMode }
export const performanceRuleRows = (env: Bindings) => all<PerformanceRuleRow>(env, 'SELECT * FROM wl_level_performance_fields')
export async function performanceGrants(env: Bindings, member: string, person: string | null, date: string): Promise<PerformanceGrant[]> {
 const rows = await all<PerformanceRuleRow>(env, 'SELECT f.* FROM wl_level_performance_fields f JOIN wl_member_levels a ON a.level_id=f.level_id WHERE a.member_id=?', member)
 if (!rows.length) return []
 const scopes = await levelScopes(env)
 return Promise.all([...new Set(rows.map(row => row.level_id))].map(async level => {
  const scope = scopes.get(level) ?? EVERYONE, fields = emptyPerformanceRules()
  for (const row of rows.filter(row => row.level_id === level)) fields[row.relation][row.field] = row.mode
  return { level, fields, scope, members: scope.kind === 'everyone' ? new Set<string>() : await scopeMembers(env, date, scope, person) }
 }))
}
export function performanceMode(actor: Pick<Actor, 'personId' | 'performanceFields'>, person: string, field: PerformanceField): PerformanceMode {
 const self = person === actor.personId
 return actor.performanceFields.reduce<PerformanceMode>((best,grant)=>{
  if(!self&&grant.scope.kind!=='everyone'&&!grant.members.has(person))return best
  const mode=grant.fields[self?'self':'others'][field]??'none'
  return PERFORMANCE_RANK[mode]>PERFORMANCE_RANK[best]?mode:best
 },'none')
}
export const readsPerformanceField=(actor:Pick<Actor,'personId'|'performanceFields'>,person:string,field:PerformanceField)=>performanceMode(actor,person,field)!=='none'
