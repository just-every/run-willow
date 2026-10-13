// A single as-of period selection shared by profiles, directory, manager scope
// and reports. Starts and ends are inclusive. Never depend on row insertion order.
import type { Bindings } from '../auth.server'
import { all } from './core'

export const SELECTED_PERIODS = `WITH dated_periods AS (
  SELECT p.*, CASE WHEN start_date <= ?1 AND (end_date IS NULL OR end_date >= ?1) THEN 0
    WHEN start_date > ?1 THEN 1 ELSE 2 END AS phase FROM wl_periods p
), ranked_periods AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY phase,
    CASE WHEN phase = 1 THEN start_date END ASC, start_date DESC, id) AS position FROM dated_periods
) SELECT * FROM ranked_periods WHERE position = 1`

export async function selectedPeriods(env: Bindings, date: string) {
  return new Map((await all(env, SELECTED_PERIODS, date)).map(row => [row.person_id, row]))
}

// Former people retain history but have no terms currently in force.
export const CURRENT_TERMS = `WITH selected AS (${SELECTED_PERIODS})
  SELECT p.id AS period_id, p.person_id, t.* FROM selected p JOIN wl_terms t ON t.period_id = p.id
  AND t.status = 'active' AND t.effective_from = (
    SELECT MAX(t2.effective_from) FROM wl_terms t2 WHERE t2.period_id = p.id
    AND t2.status = 'active' AND t2.effective_from <= MAX(?1, p.start_date))
  WHERE p.phase < 2`
