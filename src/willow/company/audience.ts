import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { insist, one, type Row } from '../core'
import type { Input } from '../input'

export interface Audience { kind: 'everyone' | 'location' | 'department'; id: string | null }

export async function audienceInput(env: Bindings, input: Input): Promise<Audience> {
  const raw = input.json('audience')
  insist(raw && typeof raw === 'object' && !Array.isArray(raw), 'invalid_audience')
  const value = raw as Record<string, unknown>
  insist(Object.keys(value).every(key => key === 'kind' || key === 'id'), 'invalid_audience')
  insist(['everyone', 'location', 'department'].includes(String(value.kind)), 'invalid_audience')
  if (value.kind === 'everyone') {
    insist(value.id === null || value.id === undefined || value.id === '', 'invalid_audience')
    return { kind: 'everyone', id: null }
  }
  insist(typeof value.id === 'string' && value.id.length <= 100, 'invalid_audience')
  const table = value.kind === 'location' ? 'wl_locations' : 'wl_departments'
  insist(await one(env, `SELECT id FROM ${table} WHERE id = ?`, value.id), 'audience_not_found', 404)
  return { kind: value.kind as Audience['kind'], id: value.id }
}

export const audienceOf = (row: Row): Audience => ({ kind: row.audience_kind, id: row.audience_id })

/** Current active terms only: neither an upcoming hire nor upcoming terms grants delivery. */
export const MEMBERSHIP = `SELECT t.department_id, t.location_id FROM wl_periods p JOIN wl_terms t ON t.period_id=p.id
 WHERE p.person_id=? AND p.start_date<=? AND (p.end_date IS NULL OR p.end_date>=?)
 AND t.status='active' AND t.effective_from=(SELECT MAX(t2.effective_from) FROM wl_terms t2
 WHERE t2.period_id=p.id AND t2.status='active' AND t2.effective_from<=?)`

export async function currentMembership(env: Bindings, actor: Actor) {
  return actor.personId ? await one(env, MEMBERSHIP, actor.personId, actor.today, actor.today, actor.today) : null
}

export function matchesAudience(row: Row, membership: Row | null): boolean {
  return row.audience_kind === 'everyone' || !!membership &&
    (row.audience_kind === 'location' ? membership.location_id === row.audience_id : membership.department_id === row.audience_id)
}

/** Shared predicate for atomic writes and future targeted delivery consumers. */
export function audiencePredicate(alias: string) {
  return `(${alias}.audience_kind='everyone' OR EXISTS (SELECT 1 FROM (${MEMBERSHIP}) membership
    WHERE (${alias}.audience_kind='location' AND membership.location_id=${alias}.audience_id)
       OR (${alias}.audience_kind='department' AND membership.department_id=${alias}.audience_id)))`
}
export const membershipParams = (actor: Actor) => [actor.personId, actor.today, actor.today, actor.today]
