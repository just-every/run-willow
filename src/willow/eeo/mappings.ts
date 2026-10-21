// HR's EEO-1 mappings: job title to one of the ten categories and location to establishment. Both are
// effective-dated, append-only and audited, and hold no EEO values.
import type { Bindings } from '../../auth.server'
import { can, requirePermission, type Actor } from '../actor'
import { all, commit, insist, now, one, stmt } from '../core'
import { isDate } from '../dates'
import type { Input } from '../input'
import { JOB_CATEGORIES, categoryLabel, normalizeTitle } from './categories'

export async function mappingsView(env: Bindings, actor: Actor, asOf = actor.today) {
  insist(can(actor, 'people.manage') || can(actor, 'eeo.individual'), 'forbidden', 403)
  const titles = await all<{ title: string }>(env, "SELECT DISTINCT job_title AS title FROM wl_terms WHERE status = 'active' ORDER BY job_title")
  const mapped = await all<{ title_key: string; category: string; effective_from: string; recorded_at: number }>(env,
    'SELECT title_key, category, effective_from, recorded_at FROM wl_eeo_title_map WHERE effective_from <= ? ORDER BY effective_from, id', asOf)
  const current = new Map(mapped.map(row => [row.title_key, row]))
  const locations = await all<{ id: string; name: string; work_state: string | null }>(env, 'SELECT id, name, work_state FROM wl_locations ORDER BY name')
  const sites = await all<{ location_id: string; address: string | null; naics: string | null; headquarters: number; effective_from: string }>(env,
    'SELECT location_id, address, naics, headquarters, effective_from FROM wl_eeo_establishments WHERE effective_from <= ? ORDER BY effective_from, id', asOf)
  const site = new Map(sites.map(row => [row.location_id, row]))
  return {
    asOf, categories: JOB_CATEGORIES,
    titles: titles.map(row => ({ title: row.title, category: current.get(normalizeTitle(row.title))?.category ?? null, label: categoryLabel(current.get(normalizeTitle(row.title))?.category ?? null), effectiveFrom: current.get(normalizeTitle(row.title))?.effective_from ?? null })),
    establishments: locations.map(row => ({ location: { id: row.id, name: row.name, state: row.work_state }, address: site.get(row.id)?.address ?? null, naics: site.get(row.id)?.naics ?? null, headquarters: !!site.get(row.id)?.headquarters, effectiveFrom: site.get(row.id)?.effective_from ?? null })),
  }
}

export async function mapTitle(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['title', 'category', 'effectiveFrom', 'returnTo'])
  const title = input.text('title', { max: 120 }), category = input.text('category', { max: 24 })
  insist(JOB_CATEGORIES.some(row => row.value === category), 'invalid_category')
  const effectiveFrom = input.text('effectiveFrom', { optional: true, max: 10 }) || '1900-01-01'
  insist(isDate(effectiveFrom), 'invalid_effectiveFrom')
  await commit(env, [stmt(env, 'INSERT INTO wl_eeo_title_map (title_key, title, category, effective_from, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', normalizeTitle(title), title, category, effectiveFrom, actor.id, now())],
    { actor: actor.id, action: 'eeo.title.map', subject: normalizeTitle(title), detail: { effectiveFrom } })
  return { title, category }
}

export async function mapEstablishment(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['location', 'address', 'naics', 'headquarters', 'effectiveFrom', 'returnTo'])
  const location = input.text('location', { max: 64 })
  insist(await one(env, 'SELECT 1 FROM wl_locations WHERE id = ?', location), 'not_found', 404)
  const address = input.text('address', { optional: true, max: 300 }) || null
  const naics = input.text('naics', { optional: true, max: 6 }) || null
  insist(naics === null || /^\d{6}$/.test(naics), 'invalid_naics')
  const effectiveFrom = input.text('effectiveFrom', { optional: true, max: 10 }) || '1900-01-01'
  insist(isDate(effectiveFrom), 'invalid_effectiveFrom')
  await commit(env, [stmt(env, 'INSERT INTO wl_eeo_establishments (location_id, address, naics, headquarters, effective_from, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', location, address, naics, input.flag('headquarters') ? 1 : 0, effectiveFrom, actor.id, now())],
    { actor: actor.id, action: 'eeo.establishment.map', subject: location, detail: { effectiveFrom } })
  return { location }
}
