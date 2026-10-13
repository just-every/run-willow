// Flow 1 (settings): the employer, its locations, departments, working
// schedules and private document categories.
import type { Bindings } from '../auth.server'
import { requireOwner, requirePermission, type Actor } from './actor'
import { all, commit, insist, newId, now, one, stmt } from './core'
import { validTimezone } from './dates'
import type { Input } from './input'

export interface Employer { name: string; timezone: string; country: string; currency: string }

export async function employer(env: Bindings): Promise<Employer | null> {
  return await one<Employer>(env, 'SELECT name, timezone, country, currency FROM wl_employer WHERE singleton = 1')
}

export async function requireEmployer(env: Bindings): Promise<Employer> {
  const value = await employer(env)
  insist(value, 'employer_not_configured', 409)
  return value
}

export async function configureEmployer(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  const name = input.text('name', { max: 120 })
  const timezone = input.text('timezone', { max: 64 })
  insist(validTimezone(timezone), 'invalid_timezone')
  const country = input.text('country', { max: 2 }).toUpperCase()
  insist(/^[A-Z]{2}$/.test(country), 'invalid_country')
  const currency = input.text('currency', { max: 3 }).toUpperCase()
  insist(/^[A-Z]{3}$/.test(currency), 'invalid_currency')
  await commit(env, [stmt(env, 'INSERT INTO wl_employer (singleton, name, timezone, country, currency, updated_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET name = excluded.name, timezone = excluded.timezone, country = excluded.country, currency = excluded.currency, updated_at = excluded.updated_at', name, timezone, country, currency, now())], { actor: actor.id, action: 'employer.configure', subject: 'employer', detail: { name, timezone, country, currency } })
  return { name, timezone, country, currency }
}

async function createNamed(env: Bindings, actor: Actor, table: 'wl_locations' | 'wl_departments', name: string, extra: Record<string, unknown> = {}) {
  insist(!await one(env, `SELECT 1 FROM ${table} WHERE name = ?`, name), 'name_taken', 409)
  const id = newId(), columns = ['id', 'name', ...Object.keys(extra), 'created_at']
  await commit(env, [stmt(env, `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, id, name, ...Object.values(extra), now())], { actor: actor.id, action: `${table.slice(3, -1)}.create`, subject: id, detail: { name, ...extra } })
  return { id, name, ...extra }
}

export async function createLocation(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const timezone = input.text('timezone', { max: 64 })
  insist(validTimezone(timezone), 'invalid_timezone')
  return await createNamed(env, actor, 'wl_locations', input.text('name', { max: 80 }), { timezone })
}

export async function createDepartment(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  return await createNamed(env, actor, 'wl_departments', input.text('name', { max: 80 }))
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export async function createSchedule(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
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
  await commit(env, [stmt(env, `INSERT INTO wl_schedules (id, name, ${WEEKDAYS.join(', ')}, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, name, ...minutes, now())], { actor: actor.id, action: 'schedule.create', subject: id, detail: { name, minutes } })
  return { id, name, minutes: Object.fromEntries(WEEKDAYS.map((day, index) => [day, minutes[index]])) }
}

export async function createCategory(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const name = input.text('name', { max: 80 })
  insist(!await one(env, 'SELECT 1 FROM wl_doc_categories WHERE name = ?', name), 'name_taken', 409)
  const id = newId(), subject = input.flag('subjectReads') ? 1 : 0, manager = input.flag('managerReads') ? 1 : 0, acknowledgement = input.flag('acknowledgement') ? 1 : 0
  await commit(env, [stmt(env, 'INSERT INTO wl_doc_categories (id, name, subject_reads, manager_reads, acknowledgement, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, subject, manager, acknowledgement, now())], { actor: actor.id, action: 'category.create', subject: id, detail: { name, subject, manager, acknowledgement } })
  return { id, name, subjectReads: !!subject, managerReads: !!manager, acknowledgement: !!acknowledgement }
}

export async function settings(env: Bindings) {
  return {
    employer: await employer(env),
    locations: await all(env, 'SELECT id, name, timezone FROM wl_locations ORDER BY name'),
    departments: await all(env, 'SELECT id, name FROM wl_departments ORDER BY name'),
    schedules: (await all(env, 'SELECT * FROM wl_schedules ORDER BY name')).map(row => ({ id: row.id, name: row.name, minutes: Object.fromEntries(WEEKDAYS.map(day => [day, row[day]])), weeklyMinutes: WEEKDAYS.reduce((sum, day) => sum + row[day], 0) })),
    categories: (await all(env, 'SELECT * FROM wl_doc_categories ORDER BY name')).map(row => ({ id: row.id, name: row.name, subjectReads: !!row.subject_reads, managerReads: !!row.manager_reads, acknowledgement: !!row.acknowledgement })),
  }
}
