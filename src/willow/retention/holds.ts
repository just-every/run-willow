// Legal holds: owner-only, scoped, with a reason, an owner and a review date.
// A hold is never edited; releasing sets released_*, and each review appends the next date.
import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { all, commit, insist, newId, now, one, stmt } from '../core'
import { isDate } from '../dates'
import type { Input } from '../input'
import { isClass } from './rules'

export const SCOPES = ['person', 'document_category', 'record_class', 'date_range', 'employer'] as const
export type Scope = typeof SCOPES[number]
export interface Hold { id: string; scope_kind: Scope; scope_ref: string | null; from_date: string | null; to_date: string | null; reason: string; owner_member: string; review_date: string; placed_at: number; released_at: number | null }

const CURRENT = `SELECT h.id, h.scope_kind, h.scope_ref, h.from_date, h.to_date, h.reason, h.owner_member, h.placed_at, h.released_at,
  COALESCE((SELECT r.next_review_date FROM wl_hold_reviews r WHERE r.hold_id = h.id ORDER BY r.id DESC LIMIT 1), h.review_date) AS review_date FROM wl_holds h`

export async function holds(env: Bindings, { active = false } = {}): Promise<Hold[]> {
  return await all<Hold>(env, `${CURRENT}${active ? ' WHERE h.released_at IS NULL' : ''} ORDER BY h.placed_at, h.id`)
}

export async function placeHold(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['scope', 'ref', 'from', 'to', 'reason', 'holdOwner', 'reviewDate', 'returnTo'])
  const scope = input.text('scope', { max: 24 }) as Scope
  insist(SCOPES.includes(scope), 'invalid_scope')
  const ref = input.text('ref', { optional: true, max: 64 }) || null
  const from = input.text('from', { optional: true, max: 10 }) || null, to = input.text('to', { optional: true, max: 10 }) || null
  const reason = input.text('reason', { max: 500 }), reviewDate = input.text('reviewDate', { max: 10 })
  insist(isDate(reviewDate) && reviewDate >= actor.today, 'invalid_reviewDate')
  const owner = input.text('holdOwner', { optional: true, max: 64 }) || actor.id
  insist(await one(env, "SELECT 1 FROM wl_members WHERE id = ? AND status = 'active'", owner), 'invalid_holdOwner')
  if (scope === 'person') insist(ref && await one(env, 'SELECT 1 FROM wl_people WHERE id = ?', ref), 'invalid_ref', 404)
  if (scope === 'document_category') insist(ref && await one(env, 'SELECT 1 FROM wl_doc_categories WHERE id = ?', ref), 'invalid_ref', 404)
  if (scope === 'record_class') insist(ref && isClass(ref), 'invalid_ref')
  if (scope === 'date_range') insist(from && to && isDate(from) && isDate(to) && from <= to, 'invalid_range')
  if (scope === 'employer') insist(!ref, 'invalid_ref')
  if (scope !== 'date_range') insist(!from && !to, 'invalid_range')
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO wl_holds (id, scope_kind, scope_ref, from_date, to_date, reason, owner_member, review_date, placed_by, placed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, scope, ref, from, to, reason, owner, reviewDate, actor.id, now())],
    { actor: actor.id, action: 'hold.place', subject: id, detail: { scope, ref, from, to, owner, reviewDate } })
  return { id }
}

export async function releaseHold(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['hold', 'returnTo'])
  const id = input.text('hold', { max: 64 })
  insist(await one(env, 'SELECT 1 FROM wl_holds WHERE id = ?', id), 'not_found', 404)
  await commit(env, [stmt(env, 'UPDATE wl_holds SET released_by = ?, released_at = ? WHERE id = ? AND released_at IS NULL', actor.id, now(), id)],
    { actor: actor.id, action: 'hold.release', subject: id })
  return { id }
}

/** The review is the hold owner's FLOW-002 work; the owner may complete it for anyone. */
export async function reviewHold(env: Bindings, actor: Actor, input: Input) {
  input.only(['hold', 'nextReviewDate', 'returnTo'])
  const id = input.text('hold', { max: 64 }), next = input.text('nextReviewDate', { max: 10 })
  const hold = (await holds(env)).find(h => h.id === id)
  insist(hold && !hold.released_at, 'not_found', 404)
  insist(actor.owner || actor.id === hold.owner_member, 'forbidden', 403)
  insist(isDate(next) && next > actor.today, 'invalid_nextReviewDate')
  await commit(env, [stmt(env, 'INSERT INTO wl_hold_reviews (hold_id, next_review_date, reviewed_by, reviewed_at) VALUES (?, ?, ?, ?)', id, next, actor.id, now())],
    { actor: actor.id, action: 'hold.review', subject: id, detail: { next } })
  return { id }
}
