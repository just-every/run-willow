// The audit API keeps its event-array contract. The page adds navigation metadata
// over the same filtered query; sequence cursors remain stable as new work arrives.
import type { Bindings } from '../auth.server'
import { employerZone, requirePermission, type Actor } from './actor'
import { all, insist, one } from './core'
import { addDays, isDate, today } from './dates'

export interface AuditEvent {
  seq: number; at: number; actor: string; action: string; subject: string; detail: string
  agent_id: string | null; agent_name: string | null; operation_id: string | null; approvers: string | null
}
export interface AuditFilters { person: string; action: string; from: string; to: string }
interface AuditQuery { filters: AuditFilters; before: number | null; after: number | null }
const COLUMNS = 'a.seq, a.at, a.actor, a.action, a.subject, a.detail, a.agent_id, a.agent_name, a.operation_id, a.approvers'

// Only structural references enter person matching. No private value or free-text
// search can accidentally associate an event with the wrong person.
const PERSON_RECORDS = [
  `SELECT id, id AS person FROM wl_people`,
  `SELECT id, person_id AS person FROM wl_members WHERE person_id IS NOT NULL`,
  `SELECT id, person_id AS person FROM wl_periods`,
  `SELECT t.id, p.person_id AS person FROM wl_terms t JOIN wl_periods p ON p.id=t.period_id`,
  `SELECT id, person_id AS person FROM wl_cases`,
  `SELECT t.id, c.person_id AS person FROM wl_case_tasks t JOIN wl_cases c ON c.id=t.case_id`,
  `SELECT id, person_id AS person FROM wl_leave_requests`,
  `SELECT a.id, p.person_id AS person FROM wl_leave_accounts a JOIN wl_periods p ON p.id=a.period_id`,
  `SELECT id, person_id AS person FROM wl_documents`,
  `SELECT v.id, d.person_id AS person FROM wl_document_versions v JOIN wl_documents d ON d.id=v.document_id`,
  `SELECT id, person_id AS person FROM wl_change_requests`,
  `SELECT id, person_id AS person FROM wl_self_changes`,
  `SELECT id, person_id AS person FROM wl_protected_cases`,
]

async function personRecords(env: Bindings, person: string) {
  // D1 bounds compound SELECTs. Small independent groups keep the complete
  // reference set without expanding a compound query for every audit row.
  const groups: string[][] = []
  for (let index = 0; index < PERSON_RECORDS.length; index += 4) groups.push(PERSON_RECORDS.slice(index, index + 4))
  const rows = await Promise.all(groups.map(group => all<{ id: string }>(env, `SELECT id FROM (${group.join(' UNION ALL ')}) WHERE person=?`, person)))
  return JSON.stringify([...new Set(rows.flat().map(record => record.id))])
}

function cursor(value: string | null): number | null {
  if (!value) return null
  insist(/^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0, 'invalid_audit_cursor')
  return Number(value)
}

export function auditQuery(url?: URL): AuditQuery {
  const params = url?.searchParams ?? new URLSearchParams()
  const filters = Object.fromEntries(['person', 'action', 'from', 'to'].map(key => [key, params.get(key)?.trim() ?? ''])) as unknown as AuditFilters
  insist(!filters.person || /^[\w-]{1,100}$/.test(filters.person), 'invalid_audit_person')
  insist(!filters.action || /^[\w.-]{1,120}$/.test(filters.action), 'invalid_audit_action')
  insist((!filters.from || isDate(filters.from)) && (!filters.to || isDate(filters.to)) && (!filters.from || !filters.to || filters.from <= filters.to), 'invalid_dates')
  const before = cursor(params.get('before')), after = cursor(params.get('after'))
  insist(!(before && after), 'invalid_audit_cursor')
  return { filters, before, after }
}

// Find the calendar boundary in the employer's zone, including DST and zones
// whose offset changes at midnight. No fixed 24-hour or UTC-day assumption.
function dayStart(date: string, zone: string): number {
  const nominal = Date.parse(`${date}T00:00:00Z`)
  let lower = nominal - 36 * 3_600_000, upper = nominal + 36 * 3_600_000
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2)
    if (today(zone, middle) < date) lower = middle
    else upper = middle
  }
  return upper
}

async function predicate(env: Bindings, filters: AuditFilters) {
  const clauses: string[] = [], params: unknown[] = []
  if (filters.action) { clauses.push('a.action=?'); params.push(filters.action) }
  if (filters.from || filters.to) {
    const zone = await employerZone(env)
    if (filters.from) { clauses.push('a.at>=?'); params.push(dayStart(filters.from, zone)) }
    if (filters.to) { clauses.push('a.at<?'); params.push(dayStart(addDays(filters.to, 1), zone)) }
  }
  if (filters.person) {
    const ids = await personRecords(env, filters.person)
    const detail = "CASE WHEN json_valid(a.detail) THEN a.detail ELSE '{}' END"
    // Resolve the person's record set once. Ordinary single-record events use
    // membership lookup; only grouped subjects need comma-list matching.
    clauses.push(`(a.subject IN (SELECT value FROM json_each(?))
      OR (instr(a.subject, ',')>0 AND EXISTS (SELECT 1 FROM json_each(?) record
        WHERE instr(',' || a.subject || ',', ',' || record.value || ',')>0))
      OR json_extract(${detail}, '$.person')=?
      OR EXISTS (SELECT 1 FROM json_each(${detail}, '$.invited') WHERE value=?)
      OR EXISTS (SELECT 1 FROM json_each(${detail}, '$.skipped') WHERE value=?)
      OR EXISTS (SELECT 1 FROM json_each(${detail}, '$.deferred') WHERE value=?))`)
    params.push(ids, ids, ...Array(4).fill(filters.person))
  }
  return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params }
}

async function readEvents(env: Bindings, query: AuditQuery, limit: number, where: Awaited<ReturnType<typeof predicate>>) {
  const seek = query.before ? ' AND a.seq<?' : query.after ? ' AND a.seq>?' : ''
  const params = [...where.params, ...query.before || query.after ? [query.before ?? query.after] : []]
  const events = await all<AuditEvent>(env, `SELECT ${COLUMNS} FROM wl_audit a WHERE ${where.sql}${seek} ORDER BY a.seq ${query.after ? 'ASC' : 'DESC'} LIMIT ?`, ...params, limit)
  return query.after ? events.reverse() : events
}

export async function audit(env: Bindings, actor: Actor, url?: URL): Promise<AuditEvent[]> {
  requirePermission(actor, 'audit.read')
  const query = auditQuery(url)
  return readEvents(env, query, 500, await predicate(env, query.filters))
}

export async function auditTrail(env: Bindings, actor: Actor, url: URL) {
  requirePermission(actor, 'audit.read')
  const query = auditQuery(url), where = await predicate(env, query.filters)
  const events = await readEvents(env, query, 100, where)
  const [older, newer, actions] = await Promise.all([
    events.length ? one<{ found: number }>(env, `SELECT EXISTS(SELECT 1 FROM wl_audit a WHERE ${where.sql} AND a.seq<?) AS found`, ...where.params, events.at(-1)!.seq) : null,
    events.length ? one<{ found: number }>(env, `SELECT EXISTS(SELECT 1 FROM wl_audit a WHERE ${where.sql} AND a.seq>?) AS found`, ...where.params, events[0].seq) : null,
    all<{ action: string }>(env, 'SELECT DISTINCT action FROM wl_audit ORDER BY action'),
  ])
  return { events, filters: query.filters, actions: actions.map(row => row.action),
    older: older?.found ? events.at(-1)!.seq : null, newer: newer?.found ? events[0].seq : null }
}
