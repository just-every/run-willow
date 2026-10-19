// Flow 10: payroll change batches. A draft gathers every change effective on
// or before the pay period's end that has not been handed off yet: starts,
// ends, terms changes (including pay) and approved leave with its reversals,
// in hours, keyed by the provider's identifier. Changes without a provider
// identifier are exceptions and stay out until resolved. Exporting claims each
// source change exactly once; the provider's acknowledgement is recorded.
// Payroll calculation, tax and payment stay with the payroll provider.
import type { Bindings } from '../auth.server'
import { requirePermission, type Actor } from './actor'
import { all, auditRead, commit, guard, insist, json, newId, now, one, sha256Hex, stmt } from './core'
import { requireDate } from './dates'
import type { Input } from './input'
import { payrollSources, guardPayrollSources, decodePayrollSources } from './payroll-sources'
import { payrollPreviewStatus } from './payroll-layout'
import { calculatePayroll, type Line } from './payroll-calculation'
import { requirePayrollCustomAccess, type PayrollColumn } from './payroll-custom-fields'
export type { Line } from './payroll-calculation'

const requirePayroll = (actor: Actor) => requirePermission(actor, 'payroll.handoff', 'pay.read')

export async function createBatch(env: Bindings, actor: Actor, input: Input) {
  requirePayroll(actor)
  const start = requireDate(input.text('periodStart', { max: 10 }), 'invalid_periodStart'), end = requireDate(input.text('periodEnd', { max: 10 }), 'invalid_periodEnd')
  insist(end >= start, 'end_before_start')
  insist(!await one(env, "SELECT 1 FROM wl_payroll_batches WHERE status = 'draft'"), 'draft_exists', 409)
  const sources = await payrollSources(env, actor)
  const { lines, exceptions, silent } = calculatePayroll(decodePayrollSources(sources), end)
  const id = newId()
  await commit(env, [
    guardPayrollSources(env, sources, actor),
    guard(env, 'stale', "NOT EXISTS(SELECT 1 FROM wl_payroll_batches WHERE status = 'draft')"),
    stmt(env, "INSERT INTO wl_payroll_batches (id, period_start, period_end, status, lines, exceptions, created_by, created_at, revision) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)", id, start, end, JSON.stringify({ lines, silent, sources, calculatedFromSources: true }), JSON.stringify(exceptions), actor.id, now(), newId()),
  ], { actor: actor.id, action: 'payroll.draft', subject: id, detail: { lines: lines.length, exceptions: exceptions.length } })
  return { id, lines: lines.length, exceptions: exceptions.length }
}

export async function discardBatch(env: Bindings, actor: Actor, input: Input) {
  requirePayroll(actor)
  const id = input.text('batch', { max: 100 })
  await commit(env, [guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_payroll_batches WHERE id = ? AND status = 'draft')", id), stmt(env, "DELETE FROM wl_payroll_batches WHERE id = ? AND status = 'draft'", id)], { actor: actor.id, action: 'payroll.discard', subject: id })
  return { id, status: 'discarded' }
}

export const CSV_COLUMNS = ['provider_employee_id', 'employee_number', 'name', 'change', 'effective_date', 'end_date', 'units', 'unit', 'field', 'from', 'to', 'note']
const cell = (value: unknown) => { const text = String(value ?? ''); return /[",\r\n]/.test(text) || /^[=+\-@]/.test(text) ? `"${(/^[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"` : text }

export function batchCsv(lines: Line[], columns: PayrollColumn[] = CSV_COLUMNS.map(source => ({source, heading: source})), customValues = new Map<string, Record<string, unknown>>()) {
  const rows = lines.flatMap(line => (line.changes?.length ? line.changes : [null]).map(change => {
    const values = [line.payrollId, line.employeeNumber, line.name, line.kind, line.effectiveDate, line.endDate ?? '', line.units ?? '', line.unit ?? '', change?.field ?? '', change?.from ?? '', change?.to ?? '', line.note]
    return columns.map(column => {
      if (column.source.startsWith('custom.')) {
        const custom = customValues.get(line.person)
        insist(custom && Object.hasOwn(custom, column.source), 'payroll_custom_value_missing', 409)
        return custom[column.source]
      }
      const position = CSV_COLUMNS.indexOf(column.source)
      insist(position >= 0, 'complete_column_mapping_required')
      return values[position]
    })
  }))
  return [columns.map(c => c.heading), ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

export async function exportBatch(env: Bindings, actor: Actor, input: Input) {
  requirePayroll(actor)
  const batch = await one(env, 'SELECT * FROM wl_payroll_batches WHERE id = ?', input.text('batch', { max: 100 }))
  insist(batch, 'batch_not_found', 404)
  insist(batch.status === 'draft', 'batch_not_draft', 409)
  const { lines, silent, sources, calculatedFromSources, customColumns = [] } = json<{ lines: Line[]; silent: string[]; sources?: string; calculatedFromSources?: boolean; customColumns?: string[] }>(batch.lines, { lines: [], silent: [] })
  // Earlier drafts may have gathered live rows outside their source fence.
  // Only a draft calculated entirely from the captured state can be exported.
  insist(sources && calculatedFromSources === true, 'stale', 409)
  insist(batch.file_preview && batch.layout_revision, 'payroll_preview_required', 409)
  insist(input.text('previewRevision', {optional:true}) === batch.revision, 'payroll_preview_changed', 409)
  await requirePayrollCustomAccess(env, actor, customColumns, [...new Set(lines.map(line => line.person))])
  const sha = await sha256Hex(batch.file_preview)
  const claims = [...lines.map(line => line.key), ...silent].map(key => { const at = key.indexOf(':'); return [key.slice(0, at), key.slice(at + 1)] })
  // The source fence and draft revision are checked before any mutation.
  // Each source change is claimed by exactly one exported batch (primary key); a concurrent export fails whole.
  await commit(env, [
    guardPayrollSources(env, sources, actor),
    guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_payroll_layout WHERE singleton=1 AND revision=?)', batch.layout_revision),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_payroll_batches WHERE id = ? AND status = 'draft' AND revision = ?)", batch.id, batch.revision),
    stmt(env, "UPDATE wl_payroll_batches SET status = 'exported', exported_by = ?, exported_at = ?, csv_sha256 = ?, revision = ? WHERE id = ? AND status = 'draft'", actor.id, now(), sha, newId(), batch.id),
    ...claims.map(([kind, id]) => stmt(env, 'INSERT INTO wl_payroll_items (source_kind, source_id, batch_id) VALUES (?, ?, ?)', kind, id, batch.id)),
  ], { actor: actor.id, action: 'payroll.export', subject: batch.id, detail: { lines: lines.length, sha256: sha } })
  return { id: batch.id, status: 'exported', sha256: sha }
}

export async function acknowledgeBatch(env: Bindings, actor: Actor, input: Input) {
  requirePayroll(actor)
  const id = input.text('batch', { max: 100 })
  const reference = input.text('reference', { max: 120 })
  await commit(env, [
    stmt(env, "UPDATE wl_payroll_batches SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?, provider_reference = ?, acknowledgement_note = ?, revision = ? WHERE id = ? AND status = 'exported'", actor.id, now(), reference, input.text('note', { optional: true, max: 1000 }) || null, newId(), id),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_payroll_batches WHERE id = ? AND status = 'acknowledged' AND acknowledged_by = ?)", id, actor.id),
  ], { actor: actor.id, action: 'payroll.acknowledge', subject: id, detail: { reference } })
  return { id, status: 'acknowledged', reference }
}

export async function batches(env: Bindings, actor: Actor) {
  requirePayroll(actor)
  return (await all(env, 'SELECT id, period_start, period_end, status, exceptions, lines, created_at, exported_at, acknowledged_at, provider_reference FROM wl_payroll_batches ORDER BY created_at DESC'))
    .map(row => ({ id: row.id, periodStart: row.period_start, periodEnd: row.period_end, status: row.status, lines: json<{ lines: Line[] }>(row.lines, { lines: [] }).lines.length, exceptions: json<unknown[]>(row.exceptions, []).length, exportedAt: row.exported_at, acknowledgedAt: row.acknowledged_at, providerReference: row.provider_reference }))
}

export async function batchDetail(env: Bindings, actor: Actor, id: string) {
  requirePayroll(actor)
  const row = await one(env, 'SELECT * FROM wl_payroll_batches WHERE id = ?', id)
  insist(row, 'not_found', 404)
  const data = json<{ lines: Line[]; customColumns?: string[] }>(row.lines, { lines: [] })
  if (row.file_preview) await requirePayrollCustomAccess(env, actor, data.customColumns ?? [], [...new Set(data.lines.map(line => line.person))])
  const claimed = new Set((await all(env, 'SELECT source_kind, source_id FROM wl_payroll_items')).map(item => `${item.source_kind}:${item.source_id}`))
  const exceptions = json<{ key: string; person: string; name: string; reason: string }[]>(row.exceptions, [])
  return {
    id: row.id, periodStart: row.period_start, periodEnd: row.period_end, status: row.status, sha256: row.csv_sha256, providerReference: row.provider_reference, acknowledgementNote: row.acknowledgement_note,
    previewStatus: await payrollPreviewStatus(env, row, actor),
    previewRevision: row.file_preview ? row.revision : null,
    filePreview: row.file_preview, layoutFormat: row.layout_format,
    createdAt: row.created_at, exportedAt: row.exported_at, acknowledgedAt: row.acknowledged_at,
    lines: data.lines,
    exceptions: exceptions.map(exception => ({ ...exception, resolved: claimed.has(exception.key) })),
  }
}

export async function batchFile(env: Bindings, actor: Actor, id: string) {
  const detail = await batchDetail(env, actor, id)
  insist(detail.status !== 'draft', 'batch_not_exported', 409)
  // Phase-one exports are identified by their absent layout, and keep that exact format.
  const bytes = detail.layoutFormat === null ? batchCsv(detail.lines) : detail.filePreview
  insist(typeof bytes === 'string' && await sha256Hex(bytes) === detail.sha256, 'payroll_file_corrupt', 409)
  await auditRead(env, actor.id, 'payroll.download', id)
  return new Response(bytes, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="payroll-changes-${detail.periodStart}-to-${detail.periodEnd}.csv"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
}
