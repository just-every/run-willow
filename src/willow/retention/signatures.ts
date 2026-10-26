import type { Bindings } from '../../auth.server'
import { all, stmt } from '../core'
import { STORES, type Store } from './inventory'

export const CATEGORY_SIGNATURE_STORES = new Set(['signature_notifications', 'signature_payloads', 'signature_events', 'signature_requests', 'signature_files', 'signature_reviews'])

/** Requests and recipient review bytes share the filing category's holds and expiry. */
export function signingCategoryStores(category: string): Store[] {
  const quoted = "'" + category.replace(/'/g, "''") + "'"
  const requests = `SELECT r.id FROM wl_sign_requests r JOIN wl_sign_templates v ON v.id=r.template_id LEFT JOIN wl_documents d ON d.id=r.document_id WHERE r.person_id=?1 AND COALESCE(d.category_id,v.category_id)=${quoted}`
  const reviews = `SELECT r.id FROM wl_sign_reviews r JOIN wl_sign_templates v ON v.id=r.template_id WHERE v.category_id=${quoted}
    AND EXISTS(SELECT 1 FROM json_each(r.snapshot,'$.recipients') WHERE json_extract(value,'$.id')=?1)`
  return STORES.filter(store => CATEGORY_SIGNATURE_STORES.has(store.id)).map(store => {
    const where = store.id === 'signature_requests' ? `t.id IN (${requests})`
      : store.id === 'signature_reviews' ? `t.id IN (${reviews})`
      : store.id === 'signature_files' ? `t.request_id IN (${requests}) OR (t.person_id=?1 AND t.request_id IS NULL AND EXISTS(
          SELECT 1 FROM wl_sign_reviews r,json_each(r.snapshot,'$.recipients') p WHERE r.id IN (${reviews})
          AND json_extract(p.value,'$.id')=?1 AND json_extract(p.value,'$.sha256')=t.sha256))`
      : `t.request_id IN (${requests})`
    return { ...store, id: `${store.id}:${category}`, from: `${store.table} t WHERE ${where}` }
  })
}

export async function signingCategories(env: Bindings, person: string) {
  return all<{ id: string; name: string; ms: number }>(env, `SELECT c.id,c.name,MAX(s.ms) AS ms FROM (
    SELECT COALESCE(d.category_id,t.category_id) AS category,r.created_at AS ms
    FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id LEFT JOIN wl_documents d ON d.id=r.document_id WHERE r.person_id=?1
    UNION ALL SELECT t.category_id,r.created_at FROM wl_sign_reviews r JOIN wl_sign_templates t ON t.id=r.template_id
    WHERE EXISTS(SELECT 1 FROM json_each(r.snapshot,'$.recipients') WHERE json_extract(value,'$.id')=?1)
    ) s JOIN wl_doc_categories c ON c.id=s.category GROUP BY c.id,c.name`, person)
}

/** Remove only this recipient; peers keep their records and completed signatures. */
export function closeSigningReviews(env: Bindings, person: string, at: number, reviews?: string[]) {
  const selection = reviews ? ' AND id IN (SELECT value FROM json_each(?3))' : ''
  const affected = `SELECT id FROM wl_sign_reviews WHERE EXISTS(SELECT 1 FROM json_each(snapshot,'$.recipients') WHERE json_extract(value,'$.id')=?1)${selection}`
  const params = reviews ? [person, at, JSON.stringify(reviews)] : [person, at]
  return [
    stmt(env, `UPDATE wl_sign_cohorts SET future_joiners=0,notify=0,stopped_at=COALESCE(stopped_at,?2) WHERE id IN (${affected})`, ...params),
    stmt(env, `UPDATE wl_sign_reviews SET used_at=COALESCE(used_at,?2), snapshot=json_set(snapshot,'$.recipients',json(
      (SELECT COALESCE(json_group_array(json(value)),'[]') FROM json_each(snapshot,'$.recipients') WHERE json_extract(value,'$.id')<>?1)))
      WHERE id IN (${affected})`, ...params),
  ]
}

/** Erasure also ends the erased initiator's remaining future authority. */
export function redactSigningReviews(env: Bindings, person: string, member: string, stub: string, at: number) {
  return [
    ...closeSigningReviews(env, person, at),
    stmt(env, `UPDATE wl_sign_cohorts SET future_joiners=0,notify=0,stopped_at=COALESCE(stopped_at,?2) WHERE initiator=?1 OR hr_member=?1`, member, at),
    stmt(env, `UPDATE wl_sign_reviews SET used_at=COALESCE(used_at,?2) WHERE actor=?1`, member, at),
    stmt(env, `UPDATE wl_sign_reviews SET snapshot=json_set(snapshot,'$.hr',?2) WHERE json_extract(snapshot,'$.hr')=?1`, member, stub),
  ]
}
