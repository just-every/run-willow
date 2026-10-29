import { liveSettingsActor } from './levels/settings-authority'
// Flow 1 (settings): the employer, its locations, departments, working
// schedules and private document categories.
import { businessSettings } from './business-settings'
import type { Bindings } from '../auth.server'
import { requirePermission, type Actor } from './actor'
import { all, commit, insist, newId, now, one, stmt } from './core'
import { validTimezone } from './dates'
import type { Input } from './input'

export interface Employer { name: string; timezone: string; country: string; currency: string }

export async function employer(env: Bindings): Promise<Employer | null> {
  const row=await one<Employer>(env, 'SELECT name, timezone, country, currency FROM wl_employer WHERE singleton = 1')
  return row?{...row,name:await businessSettings(env).resolve('display_name',row.name) as string}:null
}

export async function requireEmployer(env: Bindings): Promise<Employer> {
  const value = await employer(env)
  insist(value, 'employer_not_configured', 409)
  return value
}

export async function configureEmployer(env: Bindings, actor: Actor, input: Input) {
  const live=await liveSettingsActor(env,actor,'company')
  actor=live.actor
  const name = input.text('name', { max: 120 })
  const timezone = input.text('timezone', { max: 64 })
  insist(validTimezone(timezone), 'invalid_timezone')
  const country = input.text('country', { max: 2 }).toUpperCase()
  insist(/^[A-Z]{2}$/.test(country), 'invalid_country')
  const currency = input.text('currency', { max: 3 }).toUpperCase()
  insist(/^[A-Z]{3}$/.test(currency), 'invalid_currency')
  await commit(env, [...live.guards,stmt(env, 'INSERT INTO wl_employer (singleton, name, timezone, country, currency, updated_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET name = excluded.name, timezone = excluded.timezone, country = excluded.country, currency = excluded.currency, updated_at = excluded.updated_at', name, timezone, country, currency, now())], { actor: actor.id, action: 'employer.configure', subject: 'employer', detail: { name, timezone, country, currency } })
  return { name, timezone, country, currency }
}

async function createNamed(env: Bindings, actor: Actor, table: 'wl_locations' | 'wl_departments' | 'wl_divisions' | 'wl_legal_entities', name: string, extra: Record<string, unknown> = {}, guards: D1PreparedStatement[] = []) {
  insist(!await one(env, `SELECT 1 FROM ${table} WHERE name = ?`, name), 'name_taken', 409)
  const id = newId(), columns = ['id', 'name', ...Object.keys(extra), 'created_at']
  await commit(env, [...guards,stmt(env, `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, id, name, ...Object.values(extra), now())], { actor: actor.id, action: `${({ wl_locations: 'location', wl_departments: 'department', wl_divisions: 'division', wl_legal_entities: 'entity' })[table]}.create`, subject: id, detail: { name, ...extra } })
  return { id, name, ...extra }
}

export async function createLocation(env: Bindings, actor: Actor, input: Input) {
  const live=await liveSettingsActor(env,actor,'locations')
  actor=live.actor
  const timezone = input.text('timezone', { max: 64 })
  insist(validTimezone(timezone), 'invalid_timezone')
  const state = input.text('workState', { optional: true, max: 2 }).toUpperCase()
  insist(!state || /^[A-Z]{2}$/.test(state), 'invalid_workState')
  return await createNamed(env, actor, 'wl_locations', input.text('name', { max: 80 }), { timezone, work_state: state || null },live.guards)
}

export async function createDepartment(env: Bindings, actor: Actor, input: Input) {
  const live=await liveSettingsActor(env,actor,'locations')
  actor=live.actor
  return await createNamed(env, actor, 'wl_departments', input.text('name', { max: 80 }),{},live.guards)
}

export async function createDivision(env: Bindings, actor: Actor, input: Input) {
  const live=await liveSettingsActor(env,actor,'locations')
  actor=live.actor
  return await createNamed(env, actor, 'wl_divisions', input.text('name', { max: 80 }),{},live.guards)
}

/** A department belongs to at most one division; a person's division follows their department in force. */
export async function setDepartmentDivision(env: Bindings, actor: Actor, input: Input) {
  const live=await liveSettingsActor(env,actor,'locations')
  actor=live.actor
  const department = input.text('department', { max: 100 }), division = input.text('division', { optional: true, max: 100 })
  insist(await one(env, 'SELECT 1 FROM wl_departments WHERE id = ?', department), 'department_not_found', 404)
  insist(!division || await one(env, 'SELECT 1 FROM wl_divisions WHERE id = ?', division), 'division_not_found', 404)
  await commit(env, [...live.guards,stmt(env, 'UPDATE wl_departments SET division_id = ? WHERE id = ?', division || null, department)], { actor: actor.id, action: 'department.division', subject: department, detail: { division: division || null } })
  return { id: department, division: division || null }
}

export async function createLegalEntity(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  return await createNamed(env, actor, 'wl_legal_entities', input.text('name', { max: 120 }))
}

/** One legal entity per employment period; the choice applies to the whole period and is audited. */
export async function setPeriodEntity(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const period = input.text('period', { max: 100 }), entity = input.text('entity', { optional: true, max: 100 })
  insist(await one(env, 'SELECT 1 FROM wl_periods WHERE id = ?', period), 'period_not_found', 404)
  insist(!entity || await one(env, 'SELECT 1 FROM wl_legal_entities WHERE id = ?', entity), 'entity_not_found', 404)
  await commit(env, [stmt(env, 'DELETE FROM wl_period_entities WHERE period_id = ?', period), ...(entity ? [stmt(env, 'INSERT INTO wl_period_entities (period_id, entity_id, set_by, set_at) VALUES (?, ?, ?, ?)', period, entity, actor.id, now())] : [])], { actor: actor.id, action: 'period.entity', subject: period, detail: { entity: entity || null } })
  return { id: period, entity: entity || null }
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export async function createSchedule(env: Bindings, actor: Actor, input: Input) {
  const live=await liveSettingsActor(env,actor,'schedules')
  actor=live.actor
  const name = input.text('name', { max: 80 })
  insist(!await one(env, 'SELECT 1 FROM wl_schedules WHERE name = ?', name), 'name_taken', 409)
  const minutes = WEEKDAYS.map(day => {
    const value = input.text(day, { optional: true, max: 8 }) || '0'
    insist(/^\d{1,2}(\.\d{1,2})?$/.test(value), `invalid_${day}`)
    const result = Math.round(Number(value) * 60)
    insist(result <= 1440, `invalid_${day}`)
    return result
  })
  insist(minutes.some(value => value > 0), 'schedule_has_no_hours')
  const id = newId()
  await commit(env, [...live.guards,stmt(env, `INSERT INTO wl_schedules (id, name, ${WEEKDAYS.join(', ')}, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, name, ...minutes, now())], { actor: actor.id, action: 'schedule.create', subject: id, detail: { name, minutes } })
  return { id, name, minutes: Object.fromEntries(WEEKDAYS.map((day, index) => [day, minutes[index]])) }
}

export async function createCategory(env: Bindings, actor: Actor, input: Input) {
  const live=await liveSettingsActor(env,actor,'document-categories')
  actor=live.actor
  const name = input.text('name', { max: 80 })
  insist(!await one(env, 'SELECT 1 FROM wl_doc_categories WHERE name = ?', name), 'name_taken', 409)
  const id = newId(), subject = input.flag('subjectReads') ? 1 : 0, manager = input.flag('managerReads') ? 1 : 0, acknowledgement = input.flag('acknowledgement') ? 1 : 0
  await commit(env, [...live.guards,stmt(env, 'INSERT INTO wl_doc_categories (id, name, subject_reads, manager_reads, acknowledgement, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, subject, manager, acknowledgement, now())], { actor: actor.id, action: 'category.create', subject: id, detail: { name, subject, manager, acknowledgement } })
  return { id, name, subjectReads: !!subject, managerReads: !!manager, acknowledgement: !!acknowledgement }
}

export async function settings(env: Bindings) {
  return {
    employer: await employer(env),
    locations: await all(env, 'SELECT id, name, timezone, work_state AS workState FROM wl_locations ORDER BY name'),
    departments: await all(env, 'SELECT id, name, division_id AS divisionId FROM wl_departments ORDER BY name'),
    divisions: await all(env, 'SELECT id, name FROM wl_divisions ORDER BY name'),
    legalEntities: await all(env, 'SELECT id, name FROM wl_legal_entities ORDER BY name'),
    schedules: (await all(env, 'SELECT * FROM wl_schedules ORDER BY name')).map(row => ({ id: row.id, name: row.name, minutes: Object.fromEntries(WEEKDAYS.map(day => [day, row[day]])), weeklyMinutes: WEEKDAYS.reduce((sum, day) => sum + row[day], 0) })),
    categories: (await all(env, 'SELECT * FROM wl_doc_categories ORDER BY name')).map(row => ({ id: row.id, name: row.name, subjectReads: !!row.subject_reads, managerReads: !!row.manager_reads, acknowledgement: !!row.acknowledgement })),
  }
}
