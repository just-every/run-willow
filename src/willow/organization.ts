// Organization reads consume the directory projection only. Write validation
// loads structural dates and manager IDs, never private contacts or compensation.
import type { Bindings } from '../auth.server'
import { guard, insist, one } from './core'
import { addDays, requireDate } from './dates'

export type DirectoryStatus = 'active' | 'upcoming' | 'former' | 'none'
export interface DirectoryReference { id: string; name?: string }
export interface DirectoryPerson {
  id: string
  name: string
  workEmail: string | null
  status: DirectoryStatus
  jobTitle?: string | null
  department?: DirectoryReference | null
  location?: DirectoryReference | null
  manager?: DirectoryReference | null
}
export interface DirectoryFilters {
  date: string
  q: string
  name: string
  location: string
  department: string
  role: string
  status: DirectoryStatus | 'all'
}

/** Resolve the date without changing the actor used to authorize the directory. */
export function directoryFilters(params: URLSearchParams, today: string): DirectoryFilters {
  const text = (key: string) => (params.get(key) ?? '').trim()
  const status = text('status') || 'all'
  insist(['all', 'active', 'upcoming', 'former', 'none'].includes(status), 'invalid_status')
  return {
    date: requireDate(text('asOf') || text('date') || today, 'invalid_date'),
    q: text('q'), name: text('name'), location: text('location'),
    department: text('department'), role: text('role'), status: status as DirectoryFilters['status'],
  }
}

const folded = (text: string | null | undefined) => (text ?? '').normalize('NFKC').toLocaleLowerCase('en-US')
const contains = (value: string | null | undefined, query: string) => folded(value).includes(folded(query))
const referenceMatches = (value: DirectoryReference | null | undefined, query: string) =>
  !query || value?.id === query || contains(value?.name, query)

// Explicitly project again so extra fields on a caller's row cannot reach a chart.
function directoryPerson(row: DirectoryPerson): DirectoryPerson {
  const reference = (value: DirectoryReference | null | undefined) => value ? { id: value.id, name: value.name } : null
  return {
    id: row.id, name: row.name, workEmail: row.workEmail, status: row.status,
    jobTitle: row.jobTitle ?? null, department: reference(row.department),
    location: reference(row.location), manager: reference(row.manager),
  }
}

/** Rows must already be scoped and projected for filters.date by profile.directory. */
export function filterDirectory(rows: readonly DirectoryPerson[], filters: Partial<DirectoryFilters> = {}): DirectoryPerson[] {
  return rows.filter(row =>
    (!filters.status || filters.status === 'all' || row.status === filters.status)
    && contains(row.name, filters.name ?? '')
    && referenceMatches(row.location, filters.location ?? '')
    && referenceMatches(row.department, filters.department ?? '')
    && contains(row.jobTitle, filters.role ?? '')
    && (!filters.q || [row.name, row.location?.name, row.department?.name, row.jobTitle]
      .some(value => contains(value, filters.q!)))
  ).map(directoryPerson)
}

export interface OrganizationNode extends DirectoryPerson {
  parent: string | null
  reports: string[]
  managerState: 'none' | 'available' | 'vacant'
  vacantManager: DirectoryReference | null
}

/** Preserve all scoped rows; the displayed people count is the directory active count. */
export function organizationChart(rows: readonly DirectoryPerson[], date: string) {
  requireDate(date, 'invalid_date')
  const people = rows.map(directoryPerson)
  const byId = new Map(people.map(person => [person.id, person]))
  const nodes: OrganizationNode[] = people.map(person => {
    const manager = person.manager && byId.get(person.manager.id)
    const available = manager && (manager.status === 'active' || manager.status === 'upcoming')
    return {
      ...person, parent: available ? manager.id : null, reports: [],
      managerState: !person.manager ? 'none' : available ? 'available' : 'vacant',
      vacantManager: person.manager && !available ? person.manager : null,
    }
  })
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  for (const node of nodes) if (node.parent) nodeById.get(node.parent)!.reports.push(node.id)
  return {
    date, activeCount: people.filter(person => person.status === 'active').length,
    totalCount: people.length, roots: nodes.filter(node => !node.parent).map(node => node.id), nodes,
  }
}

export interface OrganizationPeriod {
  id: string
  personId: string
  startDate: string
  endDate: string | null
}
export interface OrganizationTerm {
  id: string
  periodId: string
  effectiveFrom: string
  managerPersonId: string | null
}
export interface OrganizationSnapshot {
  periods: OrganizationPeriod[]
  /** Active versions only. */
  terms: OrganizationTerm[]
}
export interface ManagerChange {
  /** Include a new period here even when the joiner's person is not inserted yet. */
  period: OrganizationPeriod
  /** Native period date corrections must name the original start explicitly. */
  expectedStartDate?: string
  term?: Omit<OrganizationTerm, 'periodId'>
  cancelTermId?: string
}

// Both arrays are read in one SQLite snapshot. Stable ordering also makes the
// exact same expression an in-transaction fence against concurrent graph writes.
export const ORGANIZATION_SNAPSHOT = `SELECT json_object(
  'periods', json((SELECT json_group_array(json_object(
    'id', id, 'personId', person_id, 'startDate', start_date, 'endDate', end_date))
    FROM (SELECT id, person_id, start_date, end_date FROM wl_periods ORDER BY id))),
  'terms', json((SELECT json_group_array(json_object(
    'id', id, 'periodId', period_id, 'effectiveFrom', effective_from, 'managerPersonId', manager_person_id))
    FROM (SELECT id, period_id, effective_from, manager_person_id FROM wl_terms WHERE status = 'active' ORDER BY id)))
) AS snapshot`

/** The same active, otherwise first-upcoming period rule as employment.ts. */
function managersOn(periods: readonly OrganizationPeriod[], terms: readonly OrganizationTerm[], date: string) {
  const selected = new Map<string, OrganizationPeriod>()
  const periodById = new Map(periods.map(period => [period.id, period]))
  const phase = (period: OrganizationPeriod) => period.startDate > date ? 1 : period.endDate && period.endDate < date ? 2 : 0
  for (const period of periods) {
    if (phase(period) === 2) continue
    const previous = selected.get(period.personId)
    if (!previous || phase(period) < phase(previous)
      || (phase(period) === phase(previous) && (period.startDate === previous.startDate
        ? period.id < previous.id
        : phase(period) === 1 ? period.startDate < previous.startDate : period.startDate > previous.startDate))) {
      selected.set(period.personId, period)
    }
  }
  const chosen = new Map<string, OrganizationTerm>()
  for (const term of terms) {
    const previous = chosen.get(term.periodId)
    const period = periodById.get(term.periodId)
    if (period && term.effectiveFrom <= (date > period.startDate ? date : period.startDate)
      && (!previous || previous.effectiveFrom < term.effectiveFrom)) chosen.set(term.periodId, term)
  }
  return new Map([...selected].map(([personId, period]) => {
    const manager = chosen.get(period.id)?.managerPersonId
    // An ended or missing manager is a vacancy and has no reporting edge.
    return [personId, manager && selected.has(manager) ? manager : null] as const
  }))
}

/** Check the whole relevant period, including every other person's future changes. */
export function assertManagerChange(snapshot: OrganizationSnapshot, change: ManagerChange): void {
  const { period } = change
  requireDate(period.startDate, 'invalid_startDate')
  if (period.endDate) {
    requireDate(period.endDate, 'invalid_endDate')
    insist(period.endDate >= period.startDate, 'end_before_start')
  }
  const existing = snapshot.periods.find(row => row.id === period.id)
  insist(!existing || (existing.personId === period.personId && existing.startDate === (change.expectedStartDate ?? period.startDate)), 'stale', 409)
  insist(change.term || change.cancelTermId || (existing && (existing.endDate !== period.endDate || existing.startDate !== period.startDate)), 'nothing_to_change')
  if (change.cancelTermId) {
    const cancelled = snapshot.terms.find(term => term.id === change.cancelTermId && term.periodId === period.id)
    insist(cancelled, 'stale', 409)
    insist(cancelled.effectiveFrom !== period.startDate, 'initial_terms_fixed', 409)
  }
  const periods = existing ? snapshot.periods.map(row => row.id === period.id ? period : row) : [...snapshot.periods, period]
  const terms = snapshot.terms.filter(term => term.id !== change.cancelTermId)
  if (change.term) {
    const effective = requireDate(change.term.effectiveFrom, 'invalid_effectiveFrom')
    insist(effective >= period.startDate, 'effective_before_start')
    insist(!period.endDate || effective <= period.endDate, 'effective_after_end')
    insist(!terms.some(term => term.id === change.term!.id
      || (term.periodId === period.id && term.effectiveFrom === effective)), 'stale', 409)
    terms.push({ ...change.term, periodId: period.id })
  }
  // The graph is constant between these dates. Ends are inclusive, so the
  // following day, rather than the end itself, changes period selection.
  const boundaries = new Set([period.startDate])
  const include = (date: string) => { boundaries.add(date) }
  for (const row of periods) {
    include(row.startDate)
    if (row.endDate && row.endDate < '9999-12-31') include(addDays(row.endDate, 1))
  }
  for (const term of terms) include(term.effectiveFrom)
  for (const date of [...boundaries].sort()) {
    const managers = managersOn(periods, terms, date)
    const visited = new Set<string>()
    let current: string | null = period.personId
    while (current) {
      insist(!visited.has(current), 'manager_cycle', 409, { date })
      visited.add(current)
      current = managers.get(current) ?? null
    }
  }
}

/** Prepend the returned guard BEFORE all period/terms mutations in commit(). */
export async function managerChangeGuard(env: Bindings, change: ManagerChange): Promise<D1PreparedStatement> {
  const row = await one<{ snapshot: string }>(env, ORGANIZATION_SNAPSHOT)
  insist(row, 'organization_snapshot_missing', 500)
  assertManagerChange(JSON.parse(row.snapshot) as OrganizationSnapshot, change)
  return guard(env, 'stale', `(${ORGANIZATION_SNAPSHOT}) = ?`, row.snapshot)
}
