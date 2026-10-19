import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, auditRead, insist } from '../core'
import { isDate } from '../dates'
import { RACE_ETHNICITY, SEX, type DiversityCell, type DiversityReport } from './types'

const MINIMUM_CELL_SIZE = 5
const UNKNOWN = { value: 'unknown', label: 'Unknown / not recorded' }

function cells(choices: readonly { value: string; label: string }[], rows: { category: string; count: number }[]): DiversityCell[] {
  const counts = new Map(rows.map(row => [row.category, row.count]))
  return [...choices, UNKNOWN].map(choice => ({ category: choice.value, label: choice.label,
    count: counts.get(choice.value) ?? 0, suppressed: false }))
}

/** Aggregate-only, complete active employer population; never accepts drilldown filters. */
export async function diversityReport(env: Bindings, actor: Actor, options: { asOf: string } | string): Promise<DiversityReport> {
  requirePermission(actor, 'eeo.read', 'reports.read')
  insist(typeof options === 'string' || (options && typeof options === 'object' && !Array.isArray(options) &&
    Object.keys(options).every(key => key === 'asOf')), 'eeo_filters_not_allowed')
  const asOf = typeof options === 'string' ? options : options.asOf
  insist(typeof asOf === 'string' && isDate(asOf) && asOf <= actor.today, 'invalid_asOf')
  // One statement keeps population and both dimensions in a single DB snapshot.
  // Only grouped counts cross the database boundary; no individual IDs/answers.
  const rows = await all<{ dimension: string; category: string; count: number }>(env, `WITH population AS (
    SELECT DISTINCT person_id FROM wl_periods
    WHERE start_date <= ?1 AND (end_date IS NULL OR end_date >= ?1)
  ), selected_answers AS (
    SELECT p.person_id, a.race_ethnicity, a.sex FROM population p
    LEFT JOIN wl_eeo_answers a ON a.person_id = p.person_id AND a.sequence = (
      SELECT MAX(v.sequence) FROM wl_eeo_answers v WHERE v.person_id = p.person_id AND v.recorded_on <= ?1
    )
  )
  SELECT 'raceEthnicity' AS dimension, COALESCE(race_ethnicity, 'unknown') AS category, COUNT(*) AS count
    FROM selected_answers GROUP BY COALESCE(race_ethnicity, 'unknown')
  UNION ALL
  SELECT 'sex', COALESCE(sex, 'unknown'), COUNT(*) FROM selected_answers GROUP BY COALESCE(sex, 'unknown')`, asOf)
  const raceEthnicity = cells(RACE_ETHNICITY, rows.filter(row => row.dimension === 'raceEthnicity'))
  const sex = cells(SEX, rows.filter(row => row.dimension === 'sex'))
  const suppressed = [...raceEthnicity, ...sex].some(cell => cell.count! > 0 && cell.count! < MINIMUM_CELL_SIZE)
  const total = raceEthnicity.reduce((sum, cell) => sum + cell.count!, 0)
  // Complementary suppression is deliberately conservative: hide every cell in
  // both dimensions and the denominator whenever any positive small cell exists.
  // This also handles a lone nonzero bucket and prevents cross-dimension totals
  // from reconstructing a suppressed residual. Zero cells are hidden too, so
  // suppression does not reveal which categories are populated.
  const protect = (values: DiversityCell[]) => suppressed ? values.map(cell => ({ ...cell, count: null, suppressed: true })) : values
  await auditRead(env, actor.id, 'eeo.report.read', 'employer', { asOf })
  return { scope: 'employer', asOf, total: suppressed ? null : total, suppressed,
    minimumCellSize: MINIMUM_CELL_SIZE,
    calculation: 'Distinct people with an employment period active on the as-of date, including its start and end dates. Uses each person’s latest voluntary submission recorded on or before that employer-local date. Unanswered fields are unknown. The complete employer population is used without filters or drilldown. If any positive category count is below 5, every category in both dimensions and the total are suppressed to prevent reconstruction.',
    raceEthnicity: protect(raceEthnicity), sex: protect(sex) }
}
