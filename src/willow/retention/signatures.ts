import type { Bindings } from '../../auth.server'
import { all, stmt } from '../core'
import { STORES, type Store } from './inventory'

export const CATEGORY_SIGNATURE_STORES = new Set(['signature_notifications', 'signature_payloads', 'signature_events', 'signature_requests', 'signature_files'])

/** Request custody inherits the actual filing category, including its holds and expiry. */
export function signingCategoryStores(category: string): Store[] {
  const quoted = "'" + category.replace(/'/g, "''") + "'"
  const requests = `SELECT r.id FROM wl_sign_requests r JOIN wl_sign_templates v ON v.id=r.template_id LEFT JOIN wl_documents d ON d.id=r.document_id WHERE r.person_id=?1 AND COALESCE(d.category_id,v.category_id)=${quoted}`
  return STORES.filter(store => CATEGORY_SIGNATURE_STORES.has(store.id)).map(store => ({ ...store,
    id: `${store.id}:${category}`,
    from: `${store.table} t WHERE ${store.id === 'signature_requests' ? `t.id IN (${requests})` : `t.request_id IN (${requests})`}` }))
}

export async function signingCategories(env: Bindings, person: string) {
  return all<{ id: string; name: string; ms: number }>(env, `SELECT c.id,c.name,MAX(r.created_at) AS ms
    FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id
    LEFT JOIN wl_documents d ON d.id=r.document_id
    JOIN wl_doc_categories c ON c.id=COALESCE(d.category_id,t.category_id) WHERE r.person_id=? GROUP BY c.id,c.name`, person)
}

/** Shared cohorts survive one recipient's erasure; stale issuance and future enrollment stop. */
export function redactSigningReviews(env: Bindings, person: string, member: string, stub: string, at: number) {
  return [
    stmt(env, `UPDATE wl_sign_cohorts SET future_joiners=0,notify=0,stopped_at=COALESCE(stopped_at,?3)
      WHERE initiator=?2 OR hr_member=?2 OR id IN (SELECT id FROM wl_sign_reviews r
        WHERE EXISTS(SELECT 1 FROM json_each(r.snapshot,'$.recipients') WHERE json_extract(value,'$.id')=?1))`, person, member, at),
    stmt(env, `UPDATE wl_sign_reviews SET used_at=COALESCE(used_at,?2) WHERE actor=?1`, member, at),
    stmt(env, `UPDATE wl_sign_reviews SET snapshot=json_set(snapshot,'$.hr',?2) WHERE json_extract(snapshot,'$.hr')=?1`, member, stub),
    stmt(env, `UPDATE wl_sign_reviews SET used_at=COALESCE(used_at,?2), snapshot=json_set(snapshot,'$.recipients',json(
      (SELECT COALESCE(json_group_array(json(value)),'[]') FROM json_each(snapshot,'$.recipients') WHERE json_extract(value,'$.id')<>?1)))
      WHERE EXISTS(SELECT 1 FROM json_each(snapshot,'$.recipients') WHERE json_extract(value,'$.id')=?1)`, person, at),
  ]
}
