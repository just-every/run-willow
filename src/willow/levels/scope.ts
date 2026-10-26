// ROLE-002: who a level's about-others rights reach. Membership follows the WIL-07 terms selection
// on the employer-local date (active period, else first upcoming, else former), inclusive.
import type { Bindings } from '../../auth.server'
import type { Actor, Permission } from '../actor'
import { all, guard, insist, one } from '../core'
import { SELECTED_PERIODS } from '../employment'
import type { Input } from '../input'

export const SCOPE_KINDS = ['everyone', 'direct', 'indirect', 'group'] as const
export type ScopeKind = typeof SCOPE_KINDS[number]
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'casual', 'fixed_term', 'unknown'] as const
export const SCOPE_LABELS: Record<ScopeKind, string> = { everyone: 'Everyone', direct: 'Direct reports', indirect: 'Direct and indirect reports', group: 'A group of people' }
/** Group dimensions: AND across dimensions, OR within one. A custom field is `field:<id>`. */
export type Scope = { kind: 'everyone' | 'direct' | 'indirect' } | { kind: 'group'; dimensions: Record<string, string[]> }
/** Permissions a scoped level may carry: each is enforced per person at every door. The rest are employer-wide. */
export const SCOPEABLE: readonly Permission[] = ['people.manage', 'people.private', 'pay.read', 'documents.private', 'leave.manage', 'reports.read', 'access.admin']
export const SCOPE_INPUTS = ['scope', 'scopeKind', 'scopeLocation', 'scopeDepartment', 'scopeDivision', 'scopeEmploymentType', 'scopeLegalEntity', 'scopeField', 'scopeFieldValue']
const FORM_DIMENSIONS: [string, string][] = [['scopeLocation', 'location'], ['scopeDepartment', 'department'], ['scopeDivision', 'division'], ['scopeEmploymentType', 'employment_type'], ['scopeLegalEntity', 'legal_entity']]
export const EVERYONE: Scope = { kind: 'everyone' }

/** JSON door: `scope: {kind, dimensions}`. Form door: scopeKind plus the dimension checkboxes. */
export function readScope(input: Input): Scope | undefined {
 if (!SCOPE_INPUTS.some(name => input.provided(name))) return undefined
 if (input.provided('scope')) {
  const value = input.json('scope') as { kind?: unknown; dimensions?: unknown } | undefined
  insist(value && typeof value === 'object' && (SCOPE_KINDS as readonly unknown[]).includes(value.kind), 'invalid_scope')
  if (value.kind !== 'group') { insist(value.dimensions === undefined, 'invalid_scope'); return { kind: value.kind as 'everyone' } }
  return { kind: 'group', dimensions: normalize(value.dimensions) }
 }
 const kind = input.text('scopeKind')
 insist((SCOPE_KINDS as readonly string[]).includes(kind), 'invalid_scope')
 if (kind !== 'group') return { kind: kind as 'everyone' }
 const dimensions: Record<string, string[]> = Object.fromEntries(FORM_DIMENSIONS.map(([name, dimension]) => [dimension, input.list(name)]))
 if (input.has('scopeField')) dimensions[`field:${input.text('scopeField')}`] = [input.text('scopeFieldValue')]
 return { kind: 'group', dimensions: normalize(dimensions) }
}

function normalize(value: unknown): Record<string, string[]> {
 insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_scope')
 const entries = Object.entries(value as Record<string, unknown>).filter(([, list]) => !(Array.isArray(list) && list.length === 0))
 for (const [, list] of entries) insist(Array.isArray(list) && list.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 200), 'invalid_scope')
 return Object.fromEntries(entries.map(([dimension, list]) => [dimension, [...new Set((list as string[]).map(item => item.trim()))].sort()]).sort(([a], [b]) => String(a).localeCompare(String(b))))
}

/** Rejects empty groups, unknown references, restricted custom fields and rights that are not enforced per person. */
export async function validateScope(env: Bindings, scope: Scope, permissions: string[]) {
 if (scope.kind === 'everyone') return
 insist(!permissions.includes('access.admin')||scope.kind==='group','administrative_group_required',400)
 insist(permissions.every(permission => (SCOPEABLE as readonly string[]).includes(permission)), 'scope_unsupported_permission', 400)
 if (scope.kind !== 'group') return
 const dimensions = Object.entries(scope.dimensions)
 insist(dimensions.length > 0, 'empty_scope', 400)
 const known = new Map<string, Set<string>>()
 const ids = async (table: string) => new Set((await all<{ id: string }>(env, `SELECT id FROM ${table}`)).map(row => row.id))
 for (const [dimension, values] of dimensions) {
  if (dimension === 'location' || dimension === 'department' || dimension === 'division' || dimension === 'legal_entity') {
   if (!known.has(dimension)) known.set(dimension, await ids({ location: 'wl_locations', department: 'wl_departments', division: 'wl_divisions', legal_entity: 'wl_legal_entities' }[dimension]!))
   insist(values.every(value => known.get(dimension)!.has(value)), `unknown_scope_${dimension}`, 400)
  } else if (dimension === 'employment_type') insist(values.every(value => (EMPLOYMENT_TYPES as readonly string[]).includes(value)), 'unknown_scope_employment_type', 400)
  else if (dimension.startsWith('field:')) {
   const field = await all<{ classification: string }>(env, 'SELECT classification FROM wl_custom_fields WHERE id = ?', dimension.slice(6))
   insist(field.length === 1, 'unknown_scope_field', 400)
   insist(field[0].classification === 'general', 'scope_field_restricted', 400)
  } else insist(false, 'unknown_scope_dimension', 400)
 }
}

interface PersonState { person: string; phase: number; location: string | null; department: string | null; division: string | null; legalEntity: string | null; employmentType: string; manager: string | null }

/** One row per person: the selected period and the terms in force on `date` (the period's last day when former). */
export async function personStates(env: Bindings, date: string): Promise<PersonState[]> {
 const rows = await all(env, `WITH selected AS (${SELECTED_PERIODS}) SELECT s.person_id, s.phase, s.employment_type, t.location_id, t.department_id, d.division_id, e.entity_id, t.manager_person_id
  FROM selected s LEFT JOIN wl_period_entities e ON e.period_id = s.id LEFT JOIN wl_terms t ON t.period_id = s.id AND t.status = 'active' AND t.effective_from = (
   SELECT MAX(t2.effective_from) FROM wl_terms t2 WHERE t2.period_id = s.id AND t2.status = 'active'
   AND t2.effective_from <= CASE s.phase WHEN 0 THEN ?1 WHEN 1 THEN s.start_date ELSE COALESCE(s.end_date, ?1) END)
  LEFT JOIN wl_departments d ON d.id = t.department_id`, date)
 return rows.map(row => ({ person: row.person_id, phase: row.phase, location: row.location_id, department: row.department_id, division: row.division_id, legalEntity: row.entity_id, employmentType: row.employment_type, manager: row.phase < 2 ? row.manager_person_id : null }))
}

/** Values of general custom fields in force on `date` (latest effective revision, as personCustomFields reads it). */
async function fieldValues(env: Bindings, date: string, fields: string[]) {
 const values = new Map<string, string>()
 if (!fields.length) return values
 const rows = await all(env, `SELECT person_id, field_id, value_json FROM (SELECT v.*, ROW_NUMBER() OVER (PARTITION BY person_id, field_id ORDER BY effective_from DESC, sequence DESC) AS position
  FROM wl_custom_field_values v WHERE effective_from <= ? AND field_id IN (${fields.map(() => '?').join(',')})) WHERE position = 1`, date, ...fields)
 for (const row of rows) { const value = JSON.parse(row.value_json); if (value !== null) values.set(`${row.person_id}:${row.field_id}`, String(value)) }
 return values
}

export interface ScopedGrant { level: string; scope: Scope; permissions: Set<Permission>; people: Set<string> }

async function members(env: Bindings, date: string, scope: Scope, owner: string | null, states: PersonState[]) {
 const people = new Set<string>()
 if (scope.kind === 'direct' || scope.kind === 'indirect') {
  const reports = new Map<string, string[]>()
  for (const state of states) if (state.manager) reports.set(state.manager, [...(reports.get(state.manager) ?? []), state.person])
  const queue = owner ? [owner] : []
  for (let at = 0; at < queue.length; at++) for (const report of reports.get(queue[at]) ?? []) if (!people.has(report) && report !== owner) { people.add(report); if (scope.kind === 'indirect') queue.push(report) }
 } else if (scope.kind === 'group') {
  const fields = Object.keys(scope.dimensions).filter(dimension => dimension.startsWith('field:')).map(dimension => dimension.slice(6))
  const values = await fieldValues(env, date, fields)
  const read: Record<string, (state: PersonState) => string | null> = { location: s => s.location, department: s => s.department, division: s => s.division, legal_entity: s => s.legalEntity, employment_type: s => s.employmentType }
  for (const state of states) {
   if (Object.entries(scope.dimensions).every(([dimension, allowed]) => {
    const value = dimension.startsWith('field:') ? values.get(`${state.person}:${dimension.slice(6)}`) ?? null : read[dimension]?.(state) ?? null
    return value !== null && allowed.includes(value)
   })) people.add(state.person)
  }
 }
 return people
}

/** The people a scope reaches for a member on `date`; reports exclude the member, a group includes them when they match. */
export const scopeMembers = async (env: Bindings, date: string, scope: Scope, owner: string | null) => members(env, date, scope, owner, await personStates(env, date))

export async function levelScope(env: Bindings, levelId: string): Promise<Scope> {
 return (await levelScopes(env)).get(levelId) ?? EVERYONE
}

export async function levelScopes(env: Bindings) {
 const [levels, values] = await Promise.all([all<{ id: string; scope_kind: ScopeKind }>(env, 'SELECT id, scope_kind FROM wl_levels'), all<{ level_id: string; dimension: string; value: string }>(env, 'SELECT * FROM wl_level_scope_values ORDER BY level_id, dimension, value')])
 return new Map<string, Scope>(levels.map(level => [level.id, level.scope_kind === 'group'
  ? { kind: 'group', dimensions: values.filter(v => v.level_id === level.id).reduce<Record<string, string[]>>((all, v) => ({ ...all, [v.dimension]: [...(all[v.dimension] ?? []), v.value] }), {}) }
  : { kind: level.scope_kind } as Scope]))
}

/** The scoped rights a member holds today, each already resolved to the people it reaches. */
export async function scopedGrants(env: Bindings, memberId: string, personId: string | null, date: string): Promise<ScopedGrant[]> {
 const rows = await all<{ level_id: string; permission: Permission }>(env, 'SELECT level_id, permission FROM wl_scoped_permissions WHERE member_id = ? ORDER BY level_id, permission', memberId)
 if (!rows.length) return []
 const scopes = await levelScopes(env), states = await personStates(env, date)
 const grants: ScopedGrant[] = []
 for (const level of [...new Set(rows.map(row => row.level_id))]) {
  const scope = scopes.get(level)!
  grants.push({ level, scope, permissions: new Set(rows.filter(row => row.level_id === level).map(row => row.permission)), people: await members(env, date, scope, personId, states) })
 }
 return grants
}

export function describeScope(scope: Scope, names: { locations: Map<string, string>; departments: Map<string, string>; divisions: Map<string, string>; entities: Map<string, string>; fields: Map<string, string> }) {
 if (scope.kind !== 'group') return SCOPE_LABELS[scope.kind]
 return Object.entries(scope.dimensions).map(([dimension, values]) => {
  const label = { location: 'Location', department: 'Department', division: 'Division', legal_entity: 'Legal entity', employment_type: 'Employment type' }[dimension] ?? names.fields.get(dimension.slice(6)) ?? dimension
  const lookup = { location: names.locations, department: names.departments, division: names.divisions, legal_entity: names.entities }[dimension]
  const text = lookup ? values.map(v => lookup.get(v) ?? v) : values
  return `${label}: ${text.join(' or ')}`
 }).join(' and ')
}

/**
 * A scoped holder's write is rechecked against today's scope inside the write: the check reads fresh terms,
 * and the returned guard aborts the batch if any audited change lands before it commits. Employer-wide holders need none.
 */
export async function scopeFence(env: Bindings, actor: Actor, personId: string, ...permissions: Permission[]): Promise<D1PreparedStatement[]> {
 if (actor.owner || permissions.every(permission => actor.permissions.has(permission))) return []
 const seq = (await one<{ seq: number }>(env, 'SELECT COALESCE(MAX(seq), 0) AS seq FROM wl_audit'))!.seq
 const rights = new Set<Permission>(actor.permissions)
 for (const grant of await scopedGrants(env, actor.id, actor.personId, actor.today)) if (grant.people.has(personId)) grant.permissions.forEach(permission => rights.add(permission))
 insist(permissions.every(permission => rights.has(permission)), 'forbidden', 403)
 return [guard(env, 'scope_changed', '(SELECT COALESCE(MAX(seq), 0) FROM wl_audit) = ?', seq)]
}

/** Administrative groups use structural containment, including future membership changes. */
export const coversScope=(cover: Scope,requested: Scope)=>cover.kind==='everyone' || cover.kind==='group' && requested.kind==='group' && Object.entries(cover.dimensions).every(([dimension,allowed])=>!!requested.dimensions[dimension] && requested.dimensions[dimension].every(value=>allowed.includes(value)))
