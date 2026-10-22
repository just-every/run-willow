// An erasure removes one person's lines from a shared handoff, preserving the
// other workers' frozen lines. Its original file and calculation snapshot are
// withdrawn; retained payroll custody contains only the erased person's lines.
import type { Bindings } from '../../auth.server'
import { all, guard, json, newId, stmt } from '../core'
import type { Item, Subject } from './erasure'
import type { Line } from '../payroll-calculation'

export async function redactPayroll(env: Bindings, subject: Subject, item: Item | undefined, erasureId: string, at: number) {
  if (!item) return []
  const statements: D1PreparedStatement[] = []
  for (const batch of await all<{ id: string; revision: string; lines: string; exceptions: string; status: string; period_start: string; period_end: string; created_at: number }>(env,
    'SELECT id, revision, lines, exceptions, status, period_start, period_end, created_at FROM wl_payroll_batches WHERE instr(lines, ?1) > 0 OR instr(exceptions, ?1) > 0', subject.personId)) {
    const data = json<{ lines: Line[]; silent?: string[]; sources?: string; customColumns?: string[] }>(batch.lines, { lines: [] })
    const own = data.lines.filter(line => line.person === subject.personId)
    const exceptions = json<{ person: string }[]>(batch.exceptions, [])
    const personal = exceptions.filter(row => row.person === subject.personId)
    statements.push(guard(env, 'preview_stale', 'EXISTS(SELECT 1 FROM wl_payroll_batches WHERE id=? AND revision=?)', batch.id, batch.revision))
    if (['retained', 'held'].includes(item.disposition)) {
      statements.push(stmt(env, `INSERT INTO wl_retained_records (erasure_id, store, table_name, class, rule, expiry, hold_id, row_json, created_at) VALUES (?, 'payroll_batches', 'wl_payroll_batches', ?, ?, ?, ?, ?, ?)`,
        erasureId, item.class, item.rule, item.expiry, item.hold, JSON.stringify({ id: batch.id, period_start: batch.period_start, period_end: batch.period_end, status: batch.status, created_at: batch.created_at, lines: own, exceptions: personal }), at))
    }
    // A captured source snapshot includes every worker; it cannot remain in an
    // ordinary batch after erasure. Claims still prevent replay of handed-off work.
    statements.push(stmt(env, 'UPDATE wl_payroll_batches SET lines=?, exceptions=?, file_preview=NULL, csv_sha256=NULL, revision=? WHERE id=?',
      JSON.stringify({ lines: data.lines.filter(line => line.person !== subject.personId), customColumns: data.customColumns, erasureReceipt: erasureId }),
      JSON.stringify(exceptions.filter(row => row.person !== subject.personId)), newId(), batch.id))
  }
  return statements
}
