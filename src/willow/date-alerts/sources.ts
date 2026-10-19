// PEOPLE-004 date sources. Standard dates: the work anniversary (the next
// anniversary of the employment start, Feb 29 falling on Feb 28 in other
// years) and the employment end date (contract end); custom date fields
// (PEOPLE-001) and date columns of record tables (PEOPLE-003), such as
// certification expiry. Values are those in force on the day; people with no
// current or upcoming employment period have none. Readability uses the same
// rules as every other door, with current grants and flags.
import type { Bindings } from '../../auth.server'
import { type Actor } from '../actor'
import { sees } from '../access'
import { all, insist, one } from '../core'
import { SELECTED_PERIODS } from '../employment'
import { readsCustomField } from '../custom-fields/read'
import { effectiveFieldDefinitions } from '../custom-fields/store'
import { readsTable, recordTables, type RecordTable } from '../record-tables/schema'

export interface DueDate { personId: string; item: string; date: string }
export interface SourceInfo { label: string; reads: (actor: Actor, personId: string) => boolean; dates: (date: string) => Promise<DueDate[]> }

const anniversary = (start: string, date: string) => {
  const [y, m, d] = start.split('-').map(Number)
  for (const year of [Number(date.slice(0, 4)), Number(date.slice(0, 4)) + 1]) {
    if (year <= y) continue
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    const day = m === 2 && d === 29 && !leap ? 28 : d
    const candidate = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (candidate >= date) return candidate
  }
  return null
}

async function periods(env: Bindings, date: string) {
  return (await all(env, SELECTED_PERIODS, date)).filter(period => period.phase < 2)
}

/** Resolves an alert source: `start`, `end`, `custom:<field key>` or `table:<table key>.<column key>`. */
export async function dateSource(env: Bindings, source: string, date: string): Promise<SourceInfo> {
  if (source === 'start' || source === 'end') return {
    label: source === 'start' ? 'Work anniversary' : 'Employment end date',
    reads: (actor, personId) => sees(actor, personId, 'employment'),
    dates: async day => (await periods(env, day)).flatMap(p => {
      const value = source === 'start' ? anniversary(p.start_date, day) : p.end_date
      return value ? [{ personId: p.person_id, item: p.id, date: value }] : []
    }),
  }
  if (source.startsWith('custom:')) {
    const field = (await effectiveFieldDefinitions(env, date)).find(f => f.key === source.slice(7))
    insist(field && field.type === 'date', 'date_field_not_found', 404)
    return {
      label: field.label,
      reads: (actor, personId) => readsCustomField(actor, personId, field),
      dates: async day => {
        const active = new Set((await periods(env, day)).map(p => p.person_id))
        const rows = await all(env, `SELECT v.person_id, v.value_json FROM wl_custom_field_values v WHERE v.field_id = ? AND v.id = (SELECT v2.id FROM wl_custom_field_values v2
          WHERE v2.field_id = v.field_id AND v2.person_id = v.person_id AND v2.effective_from <= ? ORDER BY v2.effective_from DESC, v2.sequence DESC LIMIT 1)`, field.id, day)
        return rows.flatMap(r => { const value = JSON.parse(r.value_json); return active.has(r.person_id) && typeof value === 'string' ? [{ personId: r.person_id, item: field.key, date: value }] : [] })
      },
    }
  }
  insist(source.startsWith('table:'), 'invalid_source')
  const [key, column] = source.slice(6).split('.')
  const table = (await recordTables(env)).find(t => t.key === key) as RecordTable | undefined
  const col = table?.current.columns.find(c => c.key === column)
  insist(table && !table.current.retired && col && col.type === 'date', 'date_field_not_found', 404)
  return {
    label: `${table.current.label}: ${col.label}`,
    reads: (actor, personId) => readsTable(actor, personId, table),
    dates: async day => {
      const active = new Set((await periods(env, day)).map(p => p.person_id))
      const rows = await all(env, `SELECT r.id AS row_id, r.person_id, v.values_json, v.removed FROM wl_record_rows r JOIN wl_record_row_versions v ON v.row_id = r.id
        WHERE r.table_id = ? AND v.id = (SELECT v2.id FROM wl_record_row_versions v2 WHERE v2.row_id = r.id AND v2.effective_from <= ? ORDER BY v2.effective_from DESC, v2.sequence DESC LIMIT 1)`, table.id, day)
      return rows.flatMap(r => { const value = JSON.parse(r.values_json)[column]; return !r.removed && active.has(r.person_id) && typeof value === 'string' ? [{ personId: r.person_id, item: r.row_id, date: value }] : [] })
    },
  }
}

/** The manager in force on a day, as an active member id. */
export async function managerMember(env: Bindings, personId: string, date: string) {
  const row = await one(env, `WITH selected AS (${SELECTED_PERIODS}) SELECT t.manager_person_id FROM selected p JOIN wl_terms t ON t.period_id = p.id AND t.status = 'active'
    WHERE p.person_id = ?2 AND t.effective_from <= MAX(?1, p.start_date) ORDER BY t.effective_from DESC LIMIT 1`, date, personId)
  return row?.manager_person_id ? (await one(env, "SELECT id FROM wl_members WHERE person_id = ? AND status = 'active'", row.manager_person_id))?.id as string ?? null : null
}
