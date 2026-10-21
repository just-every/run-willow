// DATA-001: a readable export, distinct from the owner's restorable archive.
import type { Bindings } from '../auth.server'
import { currentActor, employerZone, type Actor } from './actor'
import { auditRead, insist, now, sha256Hex, WillowError } from './core'
import { today } from './dates'
import { documentFile } from './documents'
import { employeeExportData } from './employee-export'
import { employeeCsv } from './export-formats'
import { exportZipStream, type ZipStreamFile } from './export-zip-stream'
import { caseDetail } from './lifecycle'
import { tableRows } from './record-tables/report'
import type { Column } from './record-tables/schema'
import { exportModuleHistory } from './export-module-history'
import { exportReviewHistory } from './export-review-history'

export const EXPORT_SECTIONS = { employment: 'Employment history', leave: 'Leave accounts, ledger and requests', lifecycle: 'Lifecycle cases and tasks', documents: 'Document versions and receipts', tables: 'Record tables (contacts, education, certifications, assets, custom tables)', profileChanges: 'Profile requests, HR decisions and handoffs', goals: 'Goals, check-ins and development completion', reviews: 'Performance reviews and released feedback' } as const
// Record tables carry their own per-table access in the shared projection.
const SECTION_FACETS: Record<string, string | null> = { employment: 'employment', leave: 'leave', lifecycle: 'lifecycle', documents: 'documents', tables: null, profileChanges: 'private', goals: null }
const encoder = new TextEncoder()

export async function employeeBundle(env: Bindings, actor: Actor, url: URL, request: Request) {
  const sections = url.searchParams.getAll('history').flatMap(value => value.split(','))
  insist(sections.length > 0 && sections.length <= Object.keys(EXPORT_SECTIONS).length
    && new Set(sections).size === sections.length && sections.every(key => Object.hasOwn(EXPORT_SECTIONS, key)), 'invalid_export_history')
  const data = await employeeExportData(env, actor, url)
  const zone = await employerZone(env)
  const history = await exportModuleHistory(env, actor, sections, data.asOf, zone)
  const reviews = sections.includes('reviews') ? await exportReviewHistory(env, actor, data.asOf, zone) : null
  const files: ZipStreamFile[] = []
  const manifestFiles: Record<string, unknown>[] = []
  const records: Record<string, unknown>[] = []
  const tableFiles = new Map<string, { columns: Column[]; rows: Parameters<typeof tableRows>[1] }>()
  const addText = async (path: string, content: string, mediaType: string) => {
    const bytes = encoder.encode(content)
    files.push({ name: path, size: bytes.length, open: async () => new Blob([bytes]).stream() })
    manifestFiles.push({ path, size: bytes.length, sha256: await sha256Hex(bytes), mediaType })
  }
  for (const person of data.records) {
    const record: Record<string, unknown> = { personId: person.id, revision: person.revision, asOf: data.asOf, withheldSections: [] }
    // The shared projection contains only explicitly selected and currently readable custom fields.
    if (data.fields.some(key => key.startsWith('custom.'))) record.customFields = person.customFields
    for (const section of sections as (keyof typeof EXPORT_SECTIONS)[]) {
      if (SECTION_FACETS[section] && !person.facets.includes(SECTION_FACETS[section]!)) {
        (record.withheldSections as string[]).push(section)
        continue
      }
      if (section === 'employment') record.employment = person.employment
      if (section === 'reviews') record.reviews = reviews!(person.id)
      if (section === 'profileChanges') {
        record.profileChanges = history.changes.filter(change => change.personId === person.id)
      }
      if (section === 'goals') {
        if (!history.goalPeople.has(person.id)) (record.withheldSections as string[]).push(section)
        else record.goals = history.goals.filter(goal => goal.personId === person.id)
      }
      if (section === 'tables') {
        record.tables = person.recordTables
        for (const item of person.recordTables.tables) {
          const file = tableFiles.get(item.key) ?? { columns: item.columns as Column[], rows: [] as Parameters<typeof tableRows>[1] }
          file.rows.push(...item.rows.map((row: Record<string, any>) => ({ personId: person.id, employeeNumber: person.employeeNumber ?? null, rowId: row.id, effectiveFrom: row.effectiveFrom, values: row.values })))
          tableFiles.set(item.key, file)
        }
      }
      if (section === 'leave') record.leave = person.leave
      if (section === 'lifecycle') {
        const cases = []
        for (const summary of person.cases) {
          const detail = await caseDetail(env, actor, summary.id)
          cases.push({ ...summary, period: detail.period, template: detail.template, tasks: detail.tasks.map(task => {
            const completed = task.completedAt && today(zone, task.completedAt) <= data.asOf
            return { id: task.id, title: task.title, assignee: task.assignee, dueDate: task.dueDate, evidenceRequired: task.evidenceRequired,
              system: task.system, action: task.action, status: completed ? 'completed' : 'open', evidence: completed ? task.evidence : null, completedAt: completed ? task.completedAt : null }
          }) })
        }
        record.lifecycle = cases
      }
      if (section === 'documents') {
        record.documents = person.documents.map((document: Record<string, any>) => ({ ...document, versions: document.versions.map((version: Record<string, any>) => {
          const path = `documents/${encodeURIComponent(person.id)}/${encodeURIComponent(version.id)}.bin`
          files.push({ name: path, size: version.size, open: async () => {
            // A long download must not open another file after access is revoked.
            const current = await currentActor(env, request)
            insist(current && current.id === actor.id, 'access_ended', 403)
            const response = await documentFile(env, current, version.id, true)
            insist(response.body, 'file_missing', 503)
            return response.body
          } })
          manifestFiles.push({ path, size: version.size, sha256: version.sha256, mediaType: version.mediaType, personId: person.id, documentId: document.id, versionId: version.id })
          return { ...version, path }
        }) }))
      }
    }
    records.push(record)
  }
  await addText('employees.csv', employeeCsv(data.rows), 'text/csv; charset=utf-8')
  // The same layout as the record-table report; BambooHR move-in reads tables/<key>.csv back.
  for (const [key, file] of tableFiles) await addText(`tables/${key}.csv`, employeeCsv(tableRows(file.columns, file.rows)), 'text/csv; charset=utf-8')
  await addText('records.json', JSON.stringify({ schema: 'willow.employee-records/v1', records }, null, 2) + '\n', 'application/json')
  const manifest = encoder.encode(JSON.stringify({ schema: 'willow.employee-bundle/v1', project: 'people/willow', exportedAt: now(), asOf: data.asOf,
    scope: data.scope, fields: data.fields, sections, people: records.length, files: manifestFiles,
    restore: 'Read-only export. Use the owner rer archive to restore an installation.' }, null, 2) + '\n')
  // Put metadata first so a consumer can reconcile every later file and digest.
  files.unshift({ name: 'manifest.json', size: manifest.length, open: async () => new Blob([manifest]).stream() })
  await auditRead(env, actor.id, 'employee.bundle.export', data.scope, { asOf: data.asOf, fields: data.fields, sections, people: records.length, files: files.length })
  let stream: ReadableStream<Uint8Array>
  try { stream = exportZipStream(files) } catch (error) {
    if (error instanceof RangeError) throw new WillowError('export_bundle.zip32_limit', 413)
    throw error
  }
  return new Response(stream, { headers: { 'content-type': 'application/zip',
    'content-disposition': `attachment; filename="willow-records-${data.asOf}.zip"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
}
