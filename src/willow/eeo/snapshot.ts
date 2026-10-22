// Frozen EEO-1 reads include rows moved to DATA-002 custody. This is a narrow
// compliance projection: no original identity, period id or free-text job title
// leaves custody. Ordinary reports never use these readers.
import type { Bindings } from '../../auth.server'
import { all } from '../core'

export interface SnapshotRow {
  category: string | null; location_id: string | null; race_value: string | null; sex_value: string | null; flags_json: string
}
interface SnapshotPerson extends SnapshotRow {
  person_id: string | null; name: string; title: string | null; employment_type: string; race_source: string | null; sex_source: string | null
}

const COUNTS = ['category', 'location_id', 'race_value', 'sex_value', 'flags_json'] as const
const SOURCES = ['employment_type', 'race_source', 'sex_source'] as const
const kept = (columns: readonly string[]) => columns.map(column => `json_extract(r.row_json, '$.${column}') AS ${column}`).join(', ')
const roster = `FROM wl_retained_records r JOIN wl_erasure_receipts e ON e.id = r.erasure_id
  WHERE r.table_name = 'wl_eeo_run_rows' AND json_extract(r.row_json, '$.run_id') = ?1`

export async function snapshotRows(env: Bindings, run: string) {
  return await all<SnapshotRow>(env, `SELECT ${COUNTS.join(', ')} FROM wl_eeo_run_rows WHERE run_id = ?1
    UNION ALL SELECT ${kept(COUNTS)} ${roster}`, run)
}

export async function snapshotPeople(env: Bindings, run: string) {
  return await all<SnapshotPerson>(env, `SELECT r.person_id, p.legal_name AS name, r.title, ${[...COUNTS, ...SOURCES].map(column => `r.${column}`).join(', ')}
    FROM wl_eeo_run_rows r JOIN wl_people p ON p.id = r.person_id WHERE r.run_id = ?1
    UNION ALL SELECT NULL AS person_id, e.label AS name, NULL AS title, ${kept([...COUNTS, ...SOURCES])} ${roster}
    ORDER BY name`, run)
}

export async function snapshotExcluded(env: Bindings, run: string) {
  return await all<{ person_id: string | null; name: string; reason: string }>(env, `SELECT r.person_id, p.legal_name AS name, r.reason
    FROM wl_eeo_run_excluded r JOIN wl_people p ON p.id = r.person_id WHERE r.run_id = ?1
    UNION ALL SELECT NULL AS person_id, e.label AS name, json_extract(r.row_json, '$.reason') AS reason
    FROM wl_retained_records r JOIN wl_erasure_receipts e ON e.id = r.erasure_id
    WHERE r.table_name = 'wl_eeo_run_excluded' AND json_extract(r.row_json, '$.run_id') = ?1
    ORDER BY name`, run)
}
