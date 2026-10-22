// EEO-1 Component 1 snapshot runs for EEO compliance (`eeo.individual`): a frozen roster of the people
// on payroll in an employer-chosen pay period, classified by the mappings in force, with explicit
// flags, exact counts that reconcile to the roster, a drill-down to the people behind a cell, and
// per-table suppressed aggregates for members holding `eeo.read` and `reports.read`.
import type { Bindings } from '../../auth.server'
import { can, requirePermission, type Actor } from '../actor'
import { all, auditRead, commit, insist, json, newId, now, one, stmt } from '../core'
import { isDate } from '../dates'
import type { Input } from '../input'
import { JOB_CATEGORIES, SNAPSHOT_WINDOW, categoryLabel, inWindow, normalizeTitle } from './categories'
import { RULE_VERSION } from './forms'
import { filing } from './individual'
import { hasFilingRace, hasFilingSex } from './rule'
import { ANSWER_COLUMNS, projection, type AnswerRow } from './self'
import { snapshotExcluded, snapshotPeople, snapshotRows, type SnapshotRow } from './snapshot'
import { RACE_ETHNICITY, SEX } from './types'

export const UNVERIFIED = 'Employee classification not yet verified (US-002): contractors and employees are not yet separated, and no filing file is offered.'
export const NO_FILING = 'no_filing_value'
const MINIMUM_CELL_SIZE = 5

interface Row { person_id: string; period_id: string; employment_type: string; title: string; category: string | null; title_map_id: number | null; location_id: string | null; establishment_map_id: number | null; race_value: string | null; race_source: string | null; sex_value: string | null; sex_source: string | null; flags_json: string }

export async function createRun(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'eeo.individual')
  input.only(['from', 'to', 'returnTo'])
  const from = input.text('from', { max: 10 }), to = input.text('to', { max: 10 })
  insist(isDate(from) && isDate(to) && to <= actor.today, 'invalid_snapshot')
  insist(inWindow(from, to), 'snapshot_outside_window', 400, { window: SNAPSHOT_WINDOW })
  const periods = await all<{ id: string; person_id: string; start_date: string; end_date: string | null; employment_type: string }>(env,
    'SELECT id, person_id, start_date, end_date, employment_type FROM wl_periods WHERE start_date <= ? AND (end_date IS NULL OR end_date >= ?) ORDER BY start_date, id', to, from)
  const roster = new Map<string, typeof periods[number]>()
  for (const period of periods) roster.set(period.person_id, period)
  const excluded = (await all<{ person_id: string }>(env, `SELECT DISTINCT person_id FROM wl_periods p WHERE NOT EXISTS (SELECT 1 FROM wl_periods q WHERE q.person_id = p.person_id AND q.start_date <= ?1 AND (q.end_date IS NULL OR q.end_date >= ?2))`, to, from)).map(row => row.person_id)
  const titleMap = await all<{ id: number; title_key: string; category: string; effective_from: string }>(env, 'SELECT id, title_key, category, effective_from FROM wl_eeo_title_map ORDER BY effective_from, id')
  const sites = await all<{ id: number; location_id: string; address: string | null; naics: string | null; headquarters: number; effective_from: string }>(env, 'SELECT id, location_id, address, naics, headquarters, effective_from FROM wl_eeo_establishments ORDER BY effective_from, id')
  const rows: Row[] = []
  const hq = new Set<string>()
  for (const [personId, period] of roster) {
    const day = period.end_date && period.end_date < to ? period.end_date : to
    const terms = await one<{ job_title: string; location_id: string | null }>(env, "SELECT job_title, location_id FROM wl_terms WHERE period_id = ? AND status = 'active' AND effective_from <= ? ORDER BY effective_from DESC, recorded_at DESC LIMIT 1", period.id, day < period.start_date ? period.start_date : day)
      ?? await one<{ job_title: string; location_id: string | null }>(env, "SELECT job_title, location_id FROM wl_terms WHERE period_id = ? AND status = 'active' ORDER BY effective_from LIMIT 1", period.id)
    const title = terms?.job_title ?? ''
    const map = titleMap.filter(row => row.title_key === normalizeTitle(title) && row.effective_from <= day).at(-1) ?? null
    const site = terms?.location_id ? sites.filter(row => row.location_id === terms.location_id && row.effective_from <= day).at(-1) ?? null : null
    if (site?.headquarters) hq.add(site.location_id)
    const answer = await one<AnswerRow>(env, `SELECT ${ANSWER_COLUMNS} FROM wl_eeo_answers WHERE person_id = ? ORDER BY sequence DESC LIMIT 1`, personId)
    const recorded = (await all<{ dimension: string; category: string; recorded_on: string }>(env, 'SELECT dimension, category, recorded_on FROM wl_eeo_recorded WHERE person_id = ? ORDER BY sequence DESC', personId)).map(row => ({ dimension: row.dimension, category: row.category, recordedOn: row.recorded_on }))
    const values = filing(answer ? [projection(answer)] : [], recorded)
    const flags: string[] = []
    if (!map) flags.push('unmapped_title')
    if (!terms?.location_id) flags.push('missing_establishment')
    else if (!site || !site.address || !site.naics) flags.push('establishment_incomplete')
    if (!answer) flags.push('missing_self_id')
    for (const [name, value, own, has] of [['race', values.raceEthnicity, answer?.race_ethnicity ?? null, hasFilingRace], ['sex', values.sex, answer?.sex ?? null, hasFilingSex]] as const) {
      if (value) continue
      if (answer && own === 'declined') flags.push(`declined_${name}`)
      else if (answer && own !== null && !has(own)) flags.push(`no_category_in_rule_${name}`)
      else if (answer) flags.push(`missing_${name}`)
    }
    rows.push({ person_id: personId, period_id: period.id, employment_type: period.employment_type, title, category: map?.category ?? null, title_map_id: map?.id ?? null, location_id: terms?.location_id ?? null, establishment_map_id: site?.id ?? null,
      race_value: values.raceEthnicity?.value ?? null, race_source: values.raceEthnicity?.source ?? null, sex_value: values.sex?.value ?? null, sex_source: values.sex?.source ?? null, flags_json: JSON.stringify([...new Set(flags)]) })
  }
  const runFlags: string[] = []
  if (hq.size === 0) runFlags.push('headquarters_missing')
  if (hq.size > 1) runFlags.push('multiple_headquarters')
  if (!rows.length) runFlags.push('empty_roster')
  const batch = await one(env, 'SELECT 1 FROM wl_payroll_batches WHERE period_start = ? AND period_end = ?', from, to)
  const id = newId()
  await commit(env, [
    stmt(env, 'INSERT INTO wl_eeo_runs (id, snapshot_from, snapshot_to, rule_version, pay_period, flags_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, from, to, RULE_VERSION, batch ? 'matches a recorded payroll pay period' : 'matches no recorded payroll pay period', JSON.stringify(runFlags), actor.id, now()),
    ...rows.map(row => stmt(env, 'INSERT INTO wl_eeo_run_rows (run_id, person_id, period_id, employment_type, title, category, title_map_id, location_id, establishment_map_id, race_value, race_source, sex_value, sex_source, flags_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, row.person_id, row.period_id, row.employment_type, row.title, row.category, row.title_map_id, row.location_id, row.establishment_map_id, row.race_value, row.race_source, row.sex_value, row.sex_source, row.flags_json)),
    ...excluded.map(person => stmt(env, 'INSERT INTO wl_eeo_run_excluded (run_id, person_id, reason) VALUES (?, ?, ?)', id, person, 'outside_period')),
  ], { actor: actor.id, action: 'eeo.run.create', subject: id, detail: { from, to, people: rows.length } })
  return { id, roster: rows.length, excluded: excluded.length }
}

export async function runs(env: Bindings, actor: Actor) {
  insist(can(actor, 'eeo.individual') || (can(actor, 'eeo.read') && can(actor, 'reports.read')), 'forbidden', 403)
  return (await all<{ id: string; snapshot_from: string; snapshot_to: string; rule_version: string; pay_period: string; created_at: number }>(env, 'SELECT id, snapshot_from, snapshot_to, rule_version, pay_period, created_at FROM wl_eeo_runs ORDER BY created_at DESC, id'))
    .map(row => ({ id: row.id, from: row.snapshot_from, to: row.snapshot_to, ruleVersion: row.rule_version, payPeriod: row.pay_period, createdAt: row.created_at }))
}

async function loadRun(env: Bindings, id: string) {
  const run = await one<{ id: string; snapshot_from: string; snapshot_to: string; rule_version: string; pay_period: string; flags_json: string; created_by: string; created_at: number }>(env, 'SELECT * FROM wl_eeo_runs WHERE id = ?', id)
  insist(run, 'not_found', 404)
  return run
}

const label = (choices: readonly { value: string; label: string }[], value: string | null) => value === null ? 'No filing value' : choices.find(choice => choice.value === value)?.label ?? value
const siteName = (names: Map<string, string>, location: string | null) => location ? names.get(location) ?? 'Unknown location' : 'No location'

async function names(env: Bindings) {
  return new Map((await all<{ id: string; name: string }>(env, 'SELECT id, name FROM wl_locations')).map(row => [row.id, row.name]))
}

/** Exact counts for EEO compliance. Every count reconciles to the frozen roster. */
export async function eeoRunReport(env: Bindings, actor: Actor, id: string) {
  requirePermission(actor, 'eeo.individual')
  const run = await loadRun(env, id)
  const rows = await snapshotRows(env, id)
  const excluded = await snapshotExcluded(env, id)
  const locations = await names(env)
  const cell = (row: SnapshotRow) => ({ establishment: row.location_id ?? 'none', category: row.category ?? 'unmapped', sex: row.sex_value ?? NO_FILING, race: row.race_value ?? NO_FILING })
  const grid = new Map<string, { establishment: string; category: string; sex: string; race: string; count: number }>()
  for (const row of rows) { const c = cell(row), key = JSON.stringify(c); grid.set(key, { ...c, count: (grid.get(key)?.count ?? 0) + 1 }) }
  const flagCounts = new Map<string, number>()
  for (const row of rows) for (const flag of json<string[]>(row.flags_json, [])) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1)
  const byEstablishment = new Map<string, number>()
  for (const row of rows) byEstablishment.set(row.location_id ?? 'none', (byEstablishment.get(row.location_id ?? 'none') ?? 0) + 1)
  const cells = [...grid.values()].map(value => ({ ...value, establishmentName: value.establishment === 'none' ? 'No location' : siteName(locations, value.establishment), categoryLabel: value.category === 'unmapped' ? 'No job category (unmapped title)' : categoryLabel(value.category), sexLabel: label(SEX, value.sex === NO_FILING ? null : value.sex), raceLabel: label(RACE_ETHNICITY, value.race === NO_FILING ? null : value.race) }))
    .sort((a, b) => (a.establishmentName + a.category + a.sex + a.race).localeCompare(b.establishmentName + b.category + b.sex + b.race))
  await auditRead(env, actor.id, 'eeo.run.read', id)
  return { id, from: run.snapshot_from, to: run.snapshot_to, ruleVersion: run.rule_version, payPeriod: run.pay_period, createdAt: run.created_at, notice: UNVERIFIED, filing: null,
    runFlags: json<string[]>(run.flags_json, []), roster: rows.length, noFilingValue: rows.filter(row => row.race_value === null || row.sex_value === null).length,
    reconciles: cells.reduce((sum, value) => sum + value.count, 0) === rows.length,
    establishments: [...byEstablishment].map(([location, count]) => ({ id: location, name: location === 'none' ? 'No location' : siteName(locations, location), count })).sort((a, b) => a.name.localeCompare(b.name)),
    cells, flags: [...flagCounts].map(([flag, count]) => ({ flag, count })).sort((a, b) => a.flag.localeCompare(b.flag)),
    excluded: excluded.map(row => ({ person: { id: row.person_id, name: row.name }, reason: row.reason })) }
}

/** The people behind a cell, with their filing values and sources, for EEO compliance only. */
export async function runPeople(env: Bindings, actor: Actor, id: string, filters: URLSearchParams) {
  requirePermission(actor, 'eeo.individual')
  await loadRun(env, id)
  const allowed = new Set(['establishment', 'category', 'sex', 'race', 'flag', 'notice', 'error'])
  insist([...filters.keys()].every(key => allowed.has(key)), 'invalid_filter')
  const rows = (await snapshotPeople(env, id))
    .filter(row => (!filters.has('establishment') || (row.location_id ?? 'none') === filters.get('establishment')) && (!filters.has('category') || (row.category ?? 'unmapped') === filters.get('category'))
      && (!filters.has('sex') || (row.sex_value ?? NO_FILING) === filters.get('sex')) && (!filters.has('race') || (row.race_value ?? NO_FILING) === filters.get('race')) && (!filters.has('flag') || json<string[]>(row.flags_json, []).includes(filters.get('flag')!)))
  await auditRead(env, actor.id, 'eeo.run.drill', id)
  return { run: id, people: rows.map(row => ({ id: row.person_id, name: row.name, title: row.title, category: row.category, employmentType: row.employment_type, location: row.location_id,
    race: row.race_value ? { value: row.race_value, source: row.race_source } : null, sex: row.sex_value ? { value: row.sex_value, source: row.sex_source } : null, flags: json<string[]>(row.flags_json, []) })) }
}

/** Aggregate-only tables for `eeo.read` plus `reports.read`: any positive cell under five withholds every cell and the total of that table. */
export async function runAggregate(env: Bindings, actor: Actor, id: string) {
  requirePermission(actor, 'eeo.read', 'reports.read')
  const run = await loadRun(env, id)
  const rows = await snapshotRows(env, id)
  const locations = await names(env)
  const tables = ['company', ...new Set(rows.map(row => row.location_id ?? 'none'))].map(scope => {
    const own = scope === 'company' ? rows : rows.filter(row => (row.location_id ?? 'none') === scope)
    const counts = new Map<string, { category: string; sex: string; race: string; count: number }>()
    for (const row of own) { const key = `${row.category ?? 'unmapped'}|${row.sex_value ?? NO_FILING}|${row.race_value ?? NO_FILING}`; counts.set(key, { category: row.category ?? 'unmapped', sex: row.sex_value ?? NO_FILING, race: row.race_value ?? NO_FILING, count: (counts.get(key)?.count ?? 0) + 1 }) }
    const suppressed = [...counts.values()].some(value => value.count < MINIMUM_CELL_SIZE)
    return { scope: scope === 'company' ? 'company' : scope, name: scope === 'company' ? 'Company' : scope === 'none' ? 'No location' : siteName(locations, scope), suppressed, minimumCellSize: MINIMUM_CELL_SIZE,
      total: suppressed ? null : own.length, cells: suppressed ? [] : [...counts.values()].sort((a, b) => (a.category + a.sex + a.race).localeCompare(b.category + b.sex + b.race)) }
  })
  await auditRead(env, actor.id, 'eeo.run.aggregate.read', id)
  return { id, from: run.snapshot_from, to: run.snapshot_to, ruleVersion: run.rule_version, notice: UNVERIFIED, calculation: 'Counts of people on the frozen roster by job category, sex and race/ethnicity. In each table, if any positive cell is below 5, every cell and the total of that table are withheld.', tables }
}
