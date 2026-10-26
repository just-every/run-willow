// The automatic purge of retained remainders: a record in custody is purged when its last rule has expired,
// unless a hold keeps it; a released hold gives a fresh 30-day warning first. The owner's retention page
// lists what expires within 30 days. Bytes go with the last record that references them.
import type { Bindings } from '../../auth.server'
import { employerZone } from '../actor'
import { all, commit, now, stmt } from '../core'
import { addDays, today } from '../dates'
import { finishBlobs } from './erase'

export const WARNING_DAYS = 30
const BLOB_TABLES = ['wl_sign_files', 'wl_document_versions', 'wl_hiring_resumes', 'wl_protected_certifications']

/** Records whose expiry falls inside the warning window, and when each purges. */
export async function expiringSoon(env: Bindings, date: string) {
  const limit = addDays(date, WARNING_DAYS)
  return (await all<{ id: number; erasure_id: string; store: string; class: string | null; expiry: string; hold_id: string | null; released_at: number | null }>(env,
    `SELECT r.id, r.erasure_id, r.store, r.class, r.expiry, r.hold_id, h.released_at FROM wl_retained_records r LEFT JOIN wl_holds h ON h.id = r.hold_id WHERE r.expiry IS NOT NULL AND r.expiry <= ?1 AND (r.hold_id IS NULL OR h.released_at IS NOT NULL) ORDER BY r.expiry, r.id`, limit))
    .map(row => ({ id: row.id, store: row.store, class: row.class, purgeOn: row.released_at && addDays(new Date(row.released_at).toISOString().slice(0, 10), WARNING_DAYS) > row.expiry ? addDays(new Date(row.released_at).toISOString().slice(0, 10), WARNING_DAYS) : row.expiry }))
}

export async function runPurgeScheduler(env: Bindings, instant = now()) {
  for (const row of await all<{ erasure_id: string }>(env, 'SELECT DISTINCT erasure_id FROM wl_erasure_blobs WHERE deleted = 0')) await finishBlobs(env, row.erasure_id).catch(() => 0)
  const date = today(await employerZone(env), instant)
  const due = (await expiringSoon(env, date)).filter(row => row.purgeOn <= date)
  if (!due.length) return { purged: 0 }
  const ids = JSON.stringify(due.map(row => row.id))
  const shas = new Set<string>()
  for (const row of await all<{ sha: string | null }>(env, `SELECT json_extract(row_json, '$.sha256') AS sha FROM wl_retained_records WHERE id IN (SELECT value FROM json_each(?1)) AND table_name IN (${BLOB_TABLES.map(table => `'${table}'`).join(', ')})`, ids)) if (row.sha) shas.add(row.sha)
  const byClass: Record<string, number> = {}
  for (const row of due) byClass[row.class ?? 'unclassified'] = (byClass[row.class ?? 'unclassified'] ?? 0) + 1
  await commit(env, [stmt(env, 'DELETE FROM wl_retained_records WHERE id IN (SELECT value FROM json_each(?1))', ids)], { actor: 'system', action: 'retained.purge', subject: 'employer', detail: { records: due.length, byClass } })
  let bytes = 0
  for (const sha of shas) {
    const live = (await all<{ n: number }>(env, `SELECT (${BLOB_TABLES.map(table => `(SELECT COUNT(*) FROM ${table} WHERE sha256 = ?1)`).join(' + ')} + (SELECT COUNT(*) FROM wl_company_file_versions WHERE sha256 = ?1) + (SELECT COUNT(*) FROM wl_retained_records WHERE instr(row_json, ?1) > 0) + (SELECT COUNT(*) FROM wl_change_requests WHERE instr(attachments_json, ?1) > 0)) AS n`, sha))[0].n
    if (live) continue
    await env.FILES.delete(`sha256/${sha}`)
    bytes++
  }
  return { purged: due.length, byClass, objects: bytes }
}
