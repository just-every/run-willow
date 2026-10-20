// COMP-001 protected aggregate comparison under ct's approved fixed-partition policy.
import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { insist, now, stmt } from '../core'
import { isDate } from '../dates'
import { RACE_ETHNICITY, SEX } from '../eeo/types'

export interface EquityOptions { asOf: string; level: string }
export interface EquityCounts {
  count: number | null
  includedCount: number | null
  excludedCount: number | null
}
export interface EquityCell extends EquityCounts {
  category: string
  label: string
  meanAnnualPayCents: number | null
  /** Percentage of the complete same-stratum mean; 100 means equal. */
  relativeToOverallPercent: number | null
  suppressed: boolean
}
export interface EquityStratum extends EquityCounts {
  jobTitle: string | null
  location: string | null
  payBasis: 'salary' | 'hourly' | 'unknown'
  meanAnnualPayCents: number | null
  sex: EquityCell[]
  raceEthnicity: EquityCell[]
}
export interface EquityReport extends EquityCounts {
  scope: 'job_level'
  asOf: string
  level: string
  currency: 'USD'
  suppressed: boolean
  minimumCellSize: number
  controls: readonly string[]
  calculation: string
  strata: EquityStratum[]
}

interface AggregateRow {
  kind: 'summary' | 'overall' | 'sex' | 'raceEthnicity'
  configured: number
  job_title: string | null
  location: string | null
  pay_basis: EquityStratum['payBasis'] | null
  category: string | null
  count: number
  included_count: number
  excluded_count: number
  mean_annual_cents: number | null
}

const MINIMUM_CELL_SIZE = 5
const UNKNOWN = { value: 'unknown', label: 'Unknown / not recorded' }

// Person IDs, individual answers, field values and pay never cross this query's
// boundary. All dimensions and denominators share one SQLite snapshot.
const EQUITY_SQL = `WITH level_field AS (
  SELECT f.id FROM wl_custom_fields f JOIN wl_custom_field_versions d ON d.id = (
    SELECT v.id FROM wl_custom_field_versions v
    WHERE v.field_id = f.id AND v.effective_from <= ?1
    ORDER BY v.effective_from DESC, v.version DESC LIMIT 1
  ) WHERE f.key = 'job_level' AND f.classification = 'general'
    AND d.type = 'text' AND d.retired = 0
), active_periods AS (
  SELECT p.*, ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY start_date DESC, id) AS position
  FROM wl_periods p WHERE start_date <= ?1 AND (end_date IS NULL OR end_date >= ?1)
), cohort AS (
  SELECT p.person_id, t.job_title, t.location_id, l.name AS location,
    COALESCE(pay.pay_basis, 'unknown') AS pay_basis,
    CASE WHEN pay.currency = 'USD' AND pay.amount_cents IS NOT NULL THEN
      CASE WHEN pay.pay_basis = 'salary' THEN pay.amount_cents
        WHEN pay.pay_basis = 'hourly' AND s.mon+s.tue+s.wed+s.thu+s.fri+s.sat+s.sun > 0
        THEN ROUND(pay.amount_cents * 1.0 * (s.mon+s.tue+s.wed+s.thu+s.fri+s.sat+s.sun) / 60 * 52)
      END END AS annual_cents,
    COALESCE(a.sex, 'unknown') AS sex,
    COALESCE(a.race_ethnicity, 'unknown') AS race_ethnicity
  FROM active_periods p JOIN level_field f
  JOIN wl_custom_field_values value ON value.id = (
    SELECT v.id FROM wl_custom_field_values v
    WHERE v.person_id = p.person_id AND v.field_id = f.id AND v.effective_from <= ?1
    ORDER BY v.effective_from DESC, v.sequence DESC LIMIT 1
  )
  LEFT JOIN wl_terms t ON t.period_id = p.id AND t.status = 'active' AND t.effective_from = (
    SELECT MAX(v.effective_from) FROM wl_terms v
    WHERE v.period_id = p.id AND v.status = 'active' AND v.effective_from <= ?1
  )
  LEFT JOIN wl_locations l ON l.id = t.location_id
  LEFT JOIN wl_term_pay pay ON pay.term_id = t.id
  LEFT JOIN wl_schedules s ON s.id = t.schedule_id
  LEFT JOIN wl_eeo_answers a ON a.person_id = p.person_id AND a.sequence = (
    SELECT MAX(v.sequence) FROM wl_eeo_answers v
    WHERE v.person_id = p.person_id AND v.recorded_on <= ?1
  )
  WHERE p.position = 1 AND json_type(value.value_json) = 'text'
    AND json_extract(value.value_json, '$') = ?2 COLLATE BINARY
), dimensions AS (
  SELECT job_title, location_id, location, pay_basis, annual_cents, 'sex' AS dimension, sex AS category FROM cohort
  UNION ALL
  SELECT job_title, location_id, location, pay_basis, annual_cents, 'raceEthnicity', race_ethnicity FROM cohort
)
SELECT 'summary' AS kind, EXISTS(SELECT 1 FROM level_field) AS configured,
  NULL AS job_title, NULL AS location, NULL AS pay_basis, NULL AS category,
  COUNT(*) AS count, COUNT(annual_cents) AS included_count,
  COUNT(*) - COUNT(annual_cents) AS excluded_count, NULL AS mean_annual_cents FROM cohort
UNION ALL
SELECT 'overall', 1, job_title, location, pay_basis, NULL,
  COUNT(*), COUNT(annual_cents), COUNT(*) - COUNT(annual_cents), AVG(annual_cents)
  FROM cohort GROUP BY job_title, location_id, location, pay_basis
UNION ALL
SELECT dimension, 1, job_title, location, pay_basis, category,
  COUNT(*), COUNT(annual_cents), COUNT(*) - COUNT(annual_cents), AVG(annual_cents)
  FROM dimensions GROUP BY job_title, location_id, location, pay_basis, dimension, category`

/** Complete exact-level partition; no additional cohort or drilldown filters. */
export async function equityReport(env: Bindings, actor: Actor, options: EquityOptions): Promise<EquityReport> {
  requirePermission(actor, 'pay.read', 'reports.read', 'eeo.read')
  insist(options && typeof options === 'object' && !Array.isArray(options) &&
    Object.keys(options).every(key => key === 'asOf' || key === 'level'), 'equity_filters_not_allowed')
  const { asOf, level } = options
  insist(typeof asOf === 'string' && isDate(asOf) && asOf <= actor.today, 'invalid_asOf')
  insist(typeof level === 'string' && level.trim().length > 0 && level.length <= 10000, 'invalid_level')
  // Atomic read + audit: no successful sensitive read can escape without its
  // audit event. One read statement needs no multi-read watermark fence.
  const [result] = await env.DB.batch<AggregateRow>([
    stmt(env, EQUITY_SQL, asOf, level),
    stmt(env, 'INSERT INTO wl_audit (at, actor, action, subject, detail) VALUES (?, ?, ?, ?, ?)',
      now(), actor.id, 'compensation.equity.read', 'job_level', JSON.stringify({ asOf, level })),
  ])
  const rows = result.results
  const summary = rows.find(row => row.kind === 'summary')!
  insist(summary.configured === 1, 'job_level_field_required')
  // Protect both dimensions, every stratum, pay-eligible subsets and their
  // excluded complements. Excluded counts cannot expose a small residual.
  const small = (count: number) => count > 0 && count < MINIMUM_CELL_SIZE
  const suppressed = rows.some(row => small(row.count) || small(row.included_count) || small(row.excluded_count))
  const counts = (row?: AggregateRow): EquityCounts => ({
    count: suppressed ? null : row?.count ?? 0,
    includedCount: suppressed ? null : row?.included_count ?? 0,
    excludedCount: suppressed ? null : row?.excluded_count ?? 0,
  })
  const strata = rows.filter(row => row.kind === 'overall').map(overall => {
    const matching = rows.filter(row => row.job_title === overall.job_title &&
      row.location === overall.location && row.pay_basis === overall.pay_basis)
    const cells = (dimension: 'sex' | 'raceEthnicity', choices: readonly { value: string; label: string }[]): EquityCell[] =>
      [...choices, UNKNOWN].map(choice => {
        const row = matching.find(row => row.kind === dimension && row.category === choice.value)
        const mean = suppressed ? null : row?.mean_annual_cents ?? null
        return { category: choice.value, label: choice.label, ...counts(row),
          meanAnnualPayCents: mean,
          relativeToOverallPercent: mean !== null && overall.mean_annual_cents !== null && overall.mean_annual_cents > 0
            ? mean / overall.mean_annual_cents * 100 : null,
          suppressed }
      })
    return { jobTitle: overall.job_title, location: overall.location, payBasis: overall.pay_basis!, ...counts(overall),
      meanAnnualPayCents: suppressed ? null : overall.mean_annual_cents,
      sex: cells('sex', SEX), raceEthnicity: cells('raceEthnicity', RACE_ETHNICITY) }
  }).sort((a, b) => JSON.stringify([a.jobTitle, a.location, a.payBasis]).localeCompare(JSON.stringify([b.jobTitle, b.location, b.payBasis])))
  return { scope: 'job_level', asOf, level, currency: 'USD', ...counts(summary), suppressed,
    minimumCellSize: MINIMUM_CELL_SIZE, controls: ['Exact job level', 'Job title', 'Location', 'Pay basis'],
    calculation: 'Distinct people actively employed on the inclusive as-of date whose effective general text job_level equals the requested value exactly. Uses the latest effective field value, uncancelled terms, and voluntary EEO submission recorded on or before that date. Controls are separate fixed job-title, location and pay-basis strata. Annual USD pay is recorded salary or hourly cents × scheduled weekly minutes / 60 × 52, rounded to cents per person. Missing pay, non-USD pay, unknown basis and hourly pay without a positive schedule are excluded from means and counted separately. Unanswered EEO values are unknown; declined answers remain separate. Each category mean is expressed as a percentage of the complete pay-eligible same-stratum mean, including unknown and declined EEO answers; a zero denominator has no percentage. No mean combines strata. Any positive population, included or excluded count below 5 suppresses all counts, means and percentages throughout the report. No pay changes are proposed.',
    strata }
}
