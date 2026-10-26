import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { readsCategory } from '../access'
import { all, type Row } from '../core'
import { today } from '../dates'

// Signing evidence is employee-record custody. A manager's status grant cannot export it.
export async function exportSigningRecords(env: Bindings, actor: Actor, person: string, asOf: string, zone: string) {
  if (actor.personId !== person && !can(actor, 'people.manage')) return []
  const rows = await all(env, `SELECT r.*, COALESCE(d.category_id,t.category_id) AS category_id, c.subject_reads, c.manager_reads
    FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id
    LEFT JOIN wl_documents d ON d.id=r.document_id
    JOIN wl_doc_categories c ON c.id=COALESCE(d.category_id,t.category_id) WHERE r.person_id=? ORDER BY r.created_at,r.id`, person)
  const date = (at: number) => today(zone, at)
  const exported = []
  for (const row of rows) {
    if (!readsCategory(actor, person, row) || date(row.created_at) > asOf) continue
    const events = (await all(env, 'SELECT id,member_id,kind,signer,at,detail FROM wl_sign_events WHERE request_id=? ORDER BY at,id', row.id))
      .filter(event => date(event.at) <= asOf)
    // Select durable execution evidence explicitly; session bindings and unused payload reviews stay private.
    const detail = (event: Row) => {
      const d = JSON.parse(event.detail)
      return { id: event.id, member: event.member_id, kind: event.kind, signer: event.signer, at: event.at,
        authentication: d.authentication, consent: d.consent, consentVersion: d.consentVersion, language: d.language,
        values: d.values, sourceDigest: d.sourceDigest, approvedDigest: d.approvedDigest, payloadDigest: d.payloadDigest,
        ip: d.ip, device: d.device }
    }
    const certificate = row.certificate ? JSON.parse(row.certificate) : null
    // A dated export must not publish a later completed certificate.
    const complete = row.state === 'signed' && certificate?.completedAt && date(certificate.completedAt) <= asOf
    exported.push({ request: row.id, template: row.template_id, cohort: row.cohort, category: row.category_id,
      document: row.document_id, createdAt: row.created_at, approvedDigest: row.approved_sha256,
      sealedVersion: complete ? row.sealed_version : null,
      certificate: complete ? { ...certificate, signers: certificate.signers.map((signer: Row) => {
        const { sessionBinding, session, sessionId, ...evidence } = signer
        return evidence
      }) } : null, events: events.map(detail) })
  }
  return exported
}
