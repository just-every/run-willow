// BambooHR plans are checked as a complete graph before writing. Each imported
// period also checks the live graph in its batch, including concurrent native work.
import type { Bindings } from '../auth.server'
import { one } from './core'
import { assertManagerChange, ORGANIZATION_SNAPSHOT, type ManagerChange, type OrganizationSnapshot } from './organization'

export async function validateImportedOrganization(env: Bindings, entries: { effects: { targetKind: string; targetId: string; value: unknown }[] }[]) {
  const row = await one<{ snapshot: string }>(env, ORGANIZATION_SNAPSHOT)
  const snapshot = JSON.parse(row!.snapshot) as OrganizationSnapshot
  const changes: ManagerChange[] = entries.flatMap(entry => entry.effects.filter(effect => effect.targetKind === 'period').map(effect => {
    const value = effect.value as Record<string, any>
    return { period: { id: effect.targetId, personId: value.person, startDate: value.startDate, endDate: value.endDate },
      term: { id: value.terms.id, effectiveFrom: value.startDate, managerPersonId: value.terms.managerPersonId } }
  }))
  const planned = new Set(changes.map(change => change.period.id))
  const final = {
    periods: [...snapshot.periods.filter(period => !planned.has(period.id)), ...changes.map(change => change.period)],
    terms: [...snapshot.terms.filter(term => !planned.has(term.periodId)), ...changes.map(change => ({ ...change.term!, periodId: change.period.id }))],
  }
  for (const change of changes) assertManagerChange({ ...final, terms: final.terms.filter(term => term.id !== change.term!.id) }, change)
}

export const ORGANIZATION_ACYCLIC = `WITH RECURSIVE boundaries(day) AS (
  SELECT start_date FROM wl_periods UNION SELECT effective_from FROM wl_terms WHERE status = 'active'
  UNION SELECT date(end_date, '+1 day') FROM wl_periods WHERE end_date IS NOT NULL
), dated AS (
  SELECT b.day, p.*, CASE WHEN p.start_date <= b.day AND (p.end_date IS NULL OR p.end_date >= b.day) THEN 0
    WHEN p.start_date > b.day THEN 1 ELSE 2 END AS phase FROM boundaries b CROSS JOIN wl_periods p
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY day, person_id ORDER BY phase,
    CASE WHEN phase = 1 THEN start_date END ASC, start_date DESC, id) AS position FROM dated
), selected AS (SELECT * FROM ranked WHERE position = 1 AND phase < 2), links AS (
  SELECT s.day, s.person_id AS person, t.manager_person_id AS manager FROM selected s JOIN wl_terms t ON t.period_id = s.id
    AND t.status = 'active' AND t.effective_from = (SELECT MAX(t2.effective_from) FROM wl_terms t2
      WHERE t2.period_id = s.id AND t2.status = 'active' AND t2.effective_from <= MAX(s.day, s.start_date))
    WHERE EXISTS(SELECT 1 FROM selected m WHERE m.day = s.day AND m.person_id = t.manager_person_id)
), walk(day, origin, node) AS (
  SELECT day, person, manager FROM links UNION
  SELECT w.day, w.origin, l.manager FROM walk w JOIN links l ON l.day = w.day AND l.person = w.node
) SELECT NOT EXISTS(SELECT 1 FROM walk WHERE origin = node)`
