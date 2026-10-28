// DATA-003's erased-person label: a result where an erased person's retained employment would have
// counted says how many it leaves out. The retained records are in custody, never in a report.
import type { Bindings } from '../../auth.server'
import { all } from '../core'

export async function erasedExcluded(env: Bindings, asOf: string): Promise<number> {
  const rows = await all<{ erasure_id: string }>(env, `SELECT DISTINCT erasure_id FROM wl_retained_records WHERE table_name = 'wl_periods'
    AND json_extract(row_json, '$.start_date') <= ?1 AND (json_extract(row_json, '$.end_date') IS NULL OR json_extract(row_json, '$.end_date') >= ?1)`, asOf)
  return rows.length
}

export const excludesText = (count: number) => count ? `Excludes ${count} erased ${count === 1 ? 'person' : 'people'}.` : ''
