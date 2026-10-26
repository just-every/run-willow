// The owner's review list: records of people who are not being erased whose retention period has run out.
// They are never purged silently; the owner confirms one person's purge by its digest.
import { erasureStatements, invalidateTransfersStatements, redactionStatements } from '@runeditrun/rer/modules/portability/journal'
import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { all, commit as commitBatch, insist, newId, now, sha256Hex, stmt, WillowError } from '../core'
import type { Input } from '../input'
import { finishBlobs, moveRows, readTargets, targets } from './erase'
import { planErasure } from './erasure'
import { closeSigningReviews } from './signatures'

const SHARED = new Set(['payroll_batches'])

/** The expired, single-person items of one former worker, and the digest that binds them. */
export async function purgePlan(env: Bindings, actor: Actor, personId: string) {
  requireOwner(actor)
  const plan = await planErasure(env, actor, personId)
  const expired = plan.view.items.filter(item => item.disposition === 'erased' && item.class && !SHARED.has(item.id) && !item.id.startsWith('import_'))
  const blockers = plan.view.blockers.filter(blocker => !['import_custody_unredacted', 'shared_record_unredacted'].includes(blocker.kind))
  const digest = await sha256Hex(JSON.stringify([plan.view.digest, expired.map(item => [item.id, item.rows, item.bytes]), 'purge']))
  return { plan, expired, blockers, digest }
}

export async function reviewList(env: Bindings, actor: Actor) {
  requireOwner(actor)
  const people = await all<{ id: string; name: string }>(env, `SELECT p.id, p.legal_name AS name FROM wl_people p JOIN wl_periods e ON e.person_id = p.id GROUP BY p.id HAVING SUM(e.end_date IS NULL OR e.end_date >= ?) = 0 ORDER BY p.legal_name LIMIT 25`, actor.today)
  const rows = []
  for (const person of people) {
    const { expired, blockers, digest } = await purgePlan(env, actor, person.id)
    if (!expired.length) continue
    rows.push({ person, expired: expired.map(item => ({ id: item.id, label: item.label, class: item.class, rows: item.rows })), rows: expired.reduce((sum, item) => sum + item.rows, 0), purgeable: blockers.length === 0, blockers: blockers.map(blocker => blocker.kind), digest })
  }
  return { records: rows }
}

export async function confirmPurge(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['person', 'digest', 'returnTo'])
  const personId = input.text('person', { max: 64 }), digest = input.text('digest', { max: 64 })
  const { plan, expired, blockers, digest: current } = await purgePlan(env, actor, personId)
  insist(current === digest, 'preview_stale', 409)
  insist(expired.length > 0, 'nothing_to_purge', 409)
  if (blockers.length) throw new WillowError('purge_blocked', 409, blockers)
  const purgeId = newId(), at = now()
  const keep = new Set(expired.map(item => item.id))
  const rowTargets = targets(plan).filter(target => keep.has(target.id.replace(/:versions$/, '')) && target.item.disposition === 'erased')
  const { subject } = plan
  const { ids, blobs } = await readTargets(env, rowTargets, [subject.personId, subject.memberId, subject.workEmail, subject.employeeNumber, subject.memberEmail])
  const byClass: Record<string, number> = {}
  for (const item of expired) byClass[item.class!] = (byClass[item.class!] ?? 0) + item.rows
  const blobList = [...blobs]
  const reviews = rowTargets.filter(target => target.table === 'wl_sign_reviews').flatMap(target => ids.get(target.id) ?? [])
  const reviewIds = reviews.length ? (await all<{ id: string }>(env, 'SELECT id FROM wl_sign_reviews WHERE rowid IN (SELECT value FROM json_each(?))', JSON.stringify(reviews))).map(row => row.id) : []
  await commitBatch(env, [
    stmt(env, 'INSERT INTO wl_erasure_window (token) VALUES (?)', purgeId),
    stmt(env, 'PRAGMA defer_foreign_keys = on'),
    ...await moveRows(env, rowTargets, ids, purgeId, at),
    ...closeSigningReviews(env, personId, at, reviewIds),
    ...blobList.map(([sha, size]) => stmt(env, 'INSERT INTO wl_erasure_blobs (erasure_id, sha256, size) VALUES (?, ?, ?)', purgeId, sha, size)),
    ...await erasureStatements(env.DB, 'wl_people', { id: `purge:${purgeId}` }), ...await redactionStatements(env.DB), ...await invalidateTransfersStatements(env.DB),
    stmt(env, 'DELETE FROM wl_erasure_window'),
  ], { actor: actor.id, action: 'retention.purge', subject: purgeId, detail: { digest, rows: expired.reduce((sum, item) => sum + item.rows, 0), byClass } })
  await finishBlobs(env, purgeId).catch(() => 0)
  return { id: purgeId, purged: byClass }
}
