// Flow 5: private documents with category access, immutable revisions and
// receipt acknowledgements. An acknowledgement records that the person
// received a version; it is not a legal signature. Every download is audited.
import type { Bindings } from '../auth.server'
import { requirePermission, type Actor } from './actor'
import { readsCategory, sees } from './access'
import { all, auditRead, commit, insist, newId, now, one, stmt } from './core'
import { serve, store } from './files'
import type { Input } from './input'

export const ACK_STATEMENT = 'I received this document. This is a receipt acknowledgement, not a signature.'
const FILE_BYTES = 10_000_000

export async function addDocument(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const existing = input.text('document', { optional: true, max: 100 })
  const document = existing ? await one(env, 'SELECT * FROM wl_documents WHERE id = ?', existing) : null
  if (existing) insist(document, 'document_not_found', 404)
  const personId = document?.person_id ?? input.text('person', { max: 100 })
  const categoryId = document?.category_id ?? input.text('category', { max: 100 })
  insist(await one(env, 'SELECT 1 FROM wl_people WHERE id = ?', personId), 'person_not_found', 404)
  insist(await one(env, 'SELECT 1 FROM wl_doc_categories WHERE id = ?', categoryId), 'category_not_found', 404)
  const file = (await input.file('file', { maxBytes: FILE_BYTES }))!
  const stored = await store(env, file)
  const id = document?.id ?? newId(), versionId = newId()
  const number = ((await one<{ n: number }>(env, 'SELECT MAX(number) AS n FROM wl_document_versions WHERE document_id = ?', id))?.n ?? 0) + 1
  await commit(env, [
    ...(document ? [stmt(env, 'UPDATE wl_documents SET revision = ? WHERE id = ?', newId(), id)] : [stmt(env, 'INSERT INTO wl_documents (id, person_id, category_id, title, revision, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, personId, categoryId, input.text('title', { max: 160 }), newId(), actor.id, now())]),
    stmt(env, 'INSERT INTO wl_document_versions (id, document_id, number, filename, media_type, size, sha256, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', versionId, id, number, stored.filename, stored.mediaType, stored.size, stored.sha256, actor.id, now()),
  ], { actor: actor.id, action: document ? 'document.revise' : 'document.add', subject: id, detail: { version: number, sha256: stored.sha256 } })
  return { id, version: versionId, number, sha256: stored.sha256, mediaType: stored.mediaType }
}

async function versionRow(env: Bindings, versionId: string) {
  return await one(env, 'SELECT v.*, d.person_id, d.title, c.subject_reads, c.manager_reads, c.acknowledgement, c.name AS category FROM wl_document_versions v JOIN wl_documents d ON d.id = v.document_id JOIN wl_doc_categories c ON c.id = d.category_id WHERE v.id = ?', versionId)
}

/** Downloads a version the member may read; anything else is not found. */
export async function documentFile(env: Bindings, actor: Actor, versionId: string, download: boolean) {
  const row = await versionRow(env, versionId)
  insist(row && sees(actor, row.person_id, 'documents') && readsCategory(actor, row.person_id, row), 'not_found', 404)
  await auditRead(env, actor.id, 'document.download', versionId, { document: row.document_id, person: row.person_id })
  return await serve(env, { filename: row.filename, mediaType: row.media_type, size: row.size, sha256: row.sha256 }, { download })
}

/** The person acknowledges receipt of the latest version of a document in an acknowledgement category. */
export async function acknowledge(env: Bindings, actor: Actor, input: Input) {
  const row = await versionRow(env, input.text('version', { max: 100 }))
  insist(row && actor.personId === row.person_id && row.subject_reads, 'not_found', 404)
  insist(row.acknowledgement, 'acknowledgement_not_requested', 409)
  const latest = await one<{ id: string }>(env, 'SELECT id FROM wl_document_versions WHERE document_id = ? ORDER BY number DESC LIMIT 1', row.document_id)
  insist(latest?.id === row.id, 'not_latest_version', 409)
  insist(!await one(env, 'SELECT 1 FROM wl_acknowledgements WHERE version_id = ? AND person_id = ?', row.id, row.person_id), 'already_acknowledged', 409)
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO wl_acknowledgements (id, version_id, person_id, member_id, statement, at) VALUES (?, ?, ?, ?, ?, ?)', id, row.id, row.person_id, actor.id, ACK_STATEMENT, now())], { actor: actor.id, action: 'document.acknowledge', subject: row.id })
  return { id, version: row.id, statement: ACK_STATEMENT }
}

/** Documents of a person the member may read, by category. */
export async function documentsFor(env: Bindings, actor: Actor, personId: string, categoryFilter?: (category: Record<string, any>) => boolean) {
  const readable = categoryFilter ?? ((category: Record<string, any>) => readsCategory(actor, personId, category))
  const documents = (await all(env, 'SELECT d.*, c.name AS category, c.subject_reads, c.manager_reads, c.acknowledgement FROM wl_documents d JOIN wl_doc_categories c ON c.id = d.category_id WHERE d.person_id = ? ORDER BY c.name, d.title', personId)).filter(readable)
  if (!documents.length) return []
  const ids = documents.map(document => document.id)
  const versions = await all(env, `SELECT v.*, (SELECT a.at FROM wl_acknowledgements a WHERE a.version_id = v.id AND a.person_id = ?) AS acknowledged_at FROM wl_document_versions v WHERE v.document_id IN (${ids.map(() => '?').join(', ')}) ORDER BY v.number DESC`, personId, ...ids)
  return documents.map(document => ({
    id: document.id, title: document.title, category: document.category, acknowledgementRequested: !!document.acknowledgement,
    versions: versions.filter(version => version.document_id === document.id).map(version => ({ id: version.id, number: version.number, filename: version.filename, mediaType: version.media_type, size: version.size, sha256: version.sha256, uploadedAt: version.uploaded_at, acknowledgedAt: version.acknowledged_at })),
  }))
}
