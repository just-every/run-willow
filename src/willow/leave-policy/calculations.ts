import type { Bindings } from '../../auth.server'
import { all, type Row } from '../core'

/** The caller must already hold the account's leave facet. */
export async function calculationsFor(env: Bindings, accountId: string, asOf?: string) {
  const rows = await all<Row>(env, `SELECT date, policy_version_id, calculation, recorded_at FROM wl_leave_calculations WHERE account_id = ?${asOf ? ' AND date <= ?' : ''} ORDER BY date`, accountId, ...(asOf ? [asOf] : []))
  return rows.map(row => ({ date: row.date, policyVersionId: row.policy_version_id, ...JSON.parse(row.calculation), recordedAt: row.recorded_at }))
}
