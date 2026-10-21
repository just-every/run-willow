// The retention doors' read models. The owner reads everything; HR reads only erasure
// requests (it may open them). No one else reads this.
import type { Bindings } from '../../auth.server'
import { can, requireOwner, type Actor } from '../actor'
import { all, auditRead, insist } from '../core'
import { holds } from './holds'
import { requests, previewErasure } from './erasure'
import { CLASSES, TABLE_VERSION } from './rules'
import { adoption, contractorStatus, mappings, stateRules } from './settings'

export async function retention(env: Bindings, actor: Actor) {
  insist(actor.owner || can(actor, 'people.manage'), 'forbidden', 403)
  const open = (await requests(env)).map(row => ({ id: row.id, person: { id: row.person_id, name: row.name }, source: row.source, receivedOn: row.received_on, status: row.status }))
  if (!actor.owner) return { requests: open }
  const mapped = await mappings(env)
  const label = (kind: string, ref: string) => mapped.get(`${kind}:${ref}`) ?? null
  const people = await all<{ id: string; name: string; ended: string | null }>(env, `SELECT p.id, p.legal_name AS name, MAX(e.end_date) AS ended FROM wl_people p JOIN wl_periods e ON e.person_id = p.id GROUP BY p.id HAVING SUM(e.end_date IS NULL OR e.end_date >= ?) = 0 ORDER BY p.legal_name`, actor.today)
  await auditRead(env, actor.id, 'retention.read', 'employer')
  return {
    tableVersion: TABLE_VERSION, classes: Object.entries(CLASSES).map(([key, value]) => ({ key, ...value })), adopted: await adoption(env),
    contractor: await contractorStatus(env, actor.today),
    workStates: (await all<{ state: string }>(env, 'SELECT DISTINCT work_state AS state FROM wl_locations WHERE work_state IS NOT NULL ORDER BY work_state')).map(row => row.state),
    states: await stateRules(env), holds: await holds(env),
    mappings: {
      documentCategories: (await all<{ id: string; name: string }>(env, 'SELECT id, name FROM wl_doc_categories ORDER BY name')).map(row => ({ ...row, class: label('document_category', row.id) })),
      customFields: (await all<{ id: string; key: string }>(env, 'SELECT id, key FROM wl_custom_fields ORDER BY key')).map(row => ({ ...row, class: label('custom_field', row.id) })),
      recordTables: (await all<{ id: string; key: string }>(env, 'SELECT id, key FROM wl_record_tables WHERE built_in = 0 ORDER BY key')).map(row => ({ ...row, class: label('record_table', row.id) })),
    },
    requests: open, former: people,
  }
}

export async function erasurePreview(env: Bindings, actor: Actor, url: URL) {
  requireOwner(actor)
  return await previewErasure(env, actor, url.searchParams.get('person') ?? '')
}
