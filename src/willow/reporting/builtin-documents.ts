// Compliance views report only recorded, category-authorized document custody and receipts.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { readsCategory } from '../access'
import { all, insist, one, type Row } from '../core'
import { reportAdmission } from '../levels/reports'
import { personView } from '../profile'
import { mappings } from '../retention/settings'
import type { ReportDefinition } from './definitions'
import { runReport } from './execute'
import { builtinBase, type BuiltinResult, type BuiltinRow } from './builtin-result'
import type { BuiltinReport } from './builtin-catalog'

const LABELS: Record<string, string> = { name: 'Name', category: 'Document category', document: 'Document title', filename: 'Published file', publishedAt: 'Published at', receipt: 'Receipt acknowledgement', acknowledgedAt: 'Acknowledged at' }
const watermark = (env: Bindings) => one<{ seq: number; at: number | null }>(env, "SELECT COALESCE(MAX(seq),0) AS seq,MAX(at) AS at FROM wl_audit WHERE action NOT LIKE '%.read'")
const timestamp = (at: number | null | undefined) => at ? new Date(at).toISOString() : null

export async function runBuiltinDocuments(env: Bindings, actor: Actor, report: BuiltinReport, definition: ReportDefinition): Promise<BuiltinResult> {
 const started = await watermark(env)
 const base = await runReport(env, actor, definition, report.id), result = builtinBase(report, base)
 result.columns = report.columns.map(key => ({ key, label: LABELS[key] }))
 const [classes, categories] = await Promise.all([mappings(env), all(env, 'SELECT id,name,subject_reads,manager_reads,acknowledgement FROM wl_doc_categories')])
 const configured = categories.filter(category => report.kind === 'i9-documents' ? classes.get(`document_category:${category.id}`) === 'i9' : !!category.acknowledgement)
 const admitted = reportAdmission(actor, report.id)
 const projections = await Promise.all(base.rows.map(async row => {
  const visible = configured.filter(category => readsCategory(actor, row.personId, category))
  const view = visible.length ? await personView(env, actor, row.personId, { asOf: base.asOf, audit: false, admissionActor: admitted }) as Row : null
  return { row, visible, documents: (view?.documents ?? []) as Row[] }
 }))
 let withheldPeople = 0, readableDocuments = 0, acknowledged = 0, awaitingAcknowledgement = 0
 for(const { row, visible, documents } of projections) {
  if(visible.length < configured.length) {
   withheldPeople++
   const hidden = report.columns.filter(key => key !== 'name')
   result.rows.push({ personId: row.personId, name: row.name, source: row.source, cells: Object.fromEntries(report.columns.map(key => [key, key === 'name' ? row.name : null])), withheld: hidden, measures: {} })
  }
  const categoryIds = new Set(visible.map(category => category.id))
  for(const document of documents.filter(document => categoryIds.has(document.categoryId))) {
   const version = document.versions[0]
   if(!version)continue
   const received = !!version.acknowledgedAt
   const values: Record<string, string | null> = { name: row.name, category: document.category, document: document.title, filename: version.filename, publishedAt: timestamp(version.publishedAt), receipt: received ? 'Acknowledged' : 'Awaiting acknowledgement', acknowledgedAt: timestamp(version.acknowledgedAt) }
   const entry: BuiltinRow = { personId: row.personId, name: row.name, source: `/app/files/document/${version.id}?download=1`, cells: Object.fromEntries(report.columns.map(key => [key, values[key]])), withheld: [], measures: {} }
   if(report.kind === 'i9-documents') {readableDocuments++;entry.measures.readableDocuments = 1}
   else {if(received)acknowledged++;else awaitingAcknowledgement++;entry.measures.acknowledged = +received;entry.measures.awaitingAcknowledgement = +!received}
   result.rows.push(entry)
  }
 }
 result.totals = report.kind === 'i9-documents' ? { readableDocuments, withheldPeople } : { acknowledged, awaitingAcknowledgement, withheldPeople }
 if(!configured.length) result.notes += report.kind === 'i9-documents' ? ' No document categories are currently mapped to the I-9 retention class.' : ' No document categories currently request receipt acknowledgement.'
 const finished = await watermark(env)
 insist(started?.seq === finished?.seq, 'report_source_changed', 409)
 result.sourceFreshness = { recordedThrough: finished?.at ?? null }
 return result
}
