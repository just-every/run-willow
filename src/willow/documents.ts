import { publishedDocumentVersion } from './document-publication'
import { readsDocumentChange, writeDocument } from './document-write'
// Flow 5: private documents with category access, immutable revisions and
// receipt acknowledgements. An acknowledgement records that the person
// received a version; it is not a legal signature. Every download is audited.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { readsCategory, sees } from './access'
import { all, auditRead, commit, insist, newId, now, one, stmt } from './core'
import { serve } from './files'
import { today } from './dates'
import type { Input } from './input'

export const ACK_STATEMENT = 'I received this document. This is a receipt acknowledgement, not a signature.'

export const addDocument=(env:Bindings,actor:Actor,input:Input)=>writeDocument(env,actor,input,false)

async function versionRow(env: Bindings, versionId: string) {
  return await one(env, 'SELECT v.*, d.person_id, d.category_id, d.title, c.subject_reads, c.manager_reads, c.acknowledgement, c.name AS category, p.change_id, change.requested_by, change.after_json, decision.outcome FROM wl_document_versions v JOIN wl_documents d ON d.id = v.document_id JOIN wl_doc_categories c ON c.id = d.category_id LEFT JOIN wl_document_proposals p ON p.version_id=v.id LEFT JOIN wl_self_changes change ON change.id=p.change_id LEFT JOIN wl_self_decisions decision ON decision.change_id=p.change_id WHERE v.id = ?', versionId)
}

/** Downloads a version the member may read; anything else is not found. */
export async function documentFile(env: Bindings, actor: Actor, versionId: string, download: boolean) {
  const row = await versionRow(env, versionId)
  insist(row && readsCategory(actor, row.person_id, row), 'not_found', 404)
  if(row.change_id && row.outcome!=='approved') insist(readsDocumentChange(actor,{...row,kind:'document',doc_category_id:row.category_id,doc_subject_reads:row.subject_reads,doc_manager_reads:row.manager_reads}),'not_found',404)
  else insist(sees(actor,row.person_id,'documents'),'not_found',404)
  await auditRead(env, actor.id, 'document.download', versionId, { document: row.document_id, person: row.person_id })
  return await serve(env, { filename: row.filename, mediaType: row.media_type, size: row.size, sha256: row.sha256 }, { download })
}

/** The person acknowledges receipt of the latest version of a document in an acknowledgement category. */
export async function acknowledge(env: Bindings, actor: Actor, input: Input) {
  const row = await versionRow(env, input.text('version', { max: 100 }))
  insist(row && actor.personId === row.person_id && readsCategory(actor,row.person_id,row), 'not_found', 404)
  insist(!row.change_id || row.outcome==='approved','not_found',404)
  insist(row.acknowledgement, 'acknowledgement_not_requested', 409)
  const latest = await one<{ id: string }>(env, `SELECT id FROM wl_document_versions v WHERE document_id = ? AND ${publishedDocumentVersion()} ORDER BY number DESC LIMIT 1`, row.document_id)
  insist(latest?.id === row.id, 'not_latest_version', 409)
  insist(!await one(env, 'SELECT 1 FROM wl_acknowledgements WHERE version_id = ? AND person_id = ?', row.id, row.person_id), 'already_acknowledged', 409)
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO wl_acknowledgements (id, version_id, person_id, member_id, statement, at) VALUES (?, ?, ?, ?, ?, ?)', id, row.id, row.person_id, actor.id, ACK_STATEMENT, now())], { actor: actor.id, action: 'document.acknowledge', subject: row.id })
  return { id, version: row.id, statement: ACK_STATEMENT }
}

/** Documents of a person the member may read, by category. */
export async function documentsFor(env: Bindings, actor: Actor, personId: string, categoryFilter?: (category: Record<string, any>) => boolean, asOf?: { date: string; zone: string }) {
  const readable = categoryFilter ?? ((category: Record<string, any>) => readsCategory(actor, personId, category))
  const documents = (await all(env, 'SELECT d.*, c.name AS category, c.subject_reads, c.manager_reads, c.acknowledgement FROM wl_documents d JOIN wl_doc_categories c ON c.id = d.category_id WHERE d.person_id = ? ORDER BY c.name, d.title', personId)).filter(readable)
  if (!documents.length) return []
  const ids = documents.map(document => document.id)
  const versions = (await all(env, `SELECT v.*, COALESCE((SELECT decision.decided_at FROM wl_document_proposals staged JOIN wl_self_decisions decision ON decision.change_id=staged.change_id WHERE staged.version_id=v.id AND decision.outcome='approved'),v.uploaded_at) AS published_at, (SELECT a.at FROM wl_acknowledgements a WHERE a.version_id = v.id AND a.person_id = ?) AS acknowledged_at FROM wl_document_versions v WHERE v.document_id IN (${ids.map(() => '?').join(', ')}) AND ${publishedDocumentVersion()} ORDER BY v.number DESC`, personId, ...ids)).filter(version => !asOf || today(asOf.zone, version.published_at) <= asOf.date)
  return documents.filter(document => versions.some(version => version.document_id === document.id)).map(document => ({
    id: document.id, categoryId:document.category_id, revision:document.revision, title: document.title, category: document.category, acknowledgementRequested: !!document.acknowledgement,
    versions: versions.filter(version => version.document_id === document.id).map(version => ({ id: version.id, number: versions.filter(v=>v.document_id===version.document_id&&v.number<=version.number).length, filename: version.filename, mediaType: version.media_type, size: version.size, sha256: version.sha256, uploadedAt: version.uploaded_at, publishedAt:version.published_at, acknowledgedAt: version.acknowledged_at && (!asOf || today(asOf.zone, version.acknowledged_at) <= asOf.date) ? version.acknowledged_at : null })),
  }))
}
