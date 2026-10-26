import type { Bindings } from '../auth.server'
import { requirePermission, type Actor } from './actor'
import { freshAiActor } from './ai-provider'
import { all, commit, guard, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'

export const HANDBOOK_TOPICS = ['leave-eligibility', 'leave-balance', 'policy-conflict', 'attendance', 'remote-work', 'conduct', 'general-policy'] as const
export type HandbookTopic = typeof HANDBOOK_TOPICS[number]
export interface HandbookClause {
 clauseId: number
 topic: HandbookTopic
 applicableFrom: string
 text: string
}
export interface HandbookSource {
 handbookId: string
 revision: string
 versionId: string
 version: number
 title: string
 clauses: HandbookClause[]
 approvedAt: number | null
 included: boolean
 current: boolean
 withdrawnAt: number | null
}
export const HANDBOOK_ATTESTATION_VERSION = 'general-handbook-2026-10-26'
export const HANDBOOK_ATTESTATION = 'I reviewed this exact title and every clause. They contain only general employer policy, with no person identifiers, compensation, protected-class or medical information, confidential reasons, private documents or other sensitive employee data. I approve publication to every active member and permit HR to include this exact version as an assistant source. Assistant activation and provider consent are separate.'

// Check the live session and employer-wide grant inside every write transaction.
const SESSION = `SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
 JOIN wl_members m ON m.email=lower(o.email) WHERE s.id=? AND m.id=?
 AND o.status='active' AND m.status='active' AND s.revoked_at IS NULL
 AND s.operator_version=o.version AND s.expires_at>?`
const MANAGEMENT = `(o.role='owner' OR EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission='people.manage'))`
const authority = (env: Bindings, actor: Actor) => guard(env, 'ai_authority_changed', `EXISTS(${SESSION} AND ${MANAGEMENT})`, actor.sessionId, actor.id, now())
const unchanged = (env: Bindings, handbook: string, revision: string) => guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_ai_handbooks WHERE id=? AND revision=? AND withdrawn_at IS NULL)', handbook, revision)

function readClauses(input: Input): HandbookClause[] {
 let value: unknown
 if (input.provided('clauses')) value = input.json('clauses')
 else {
  const ids = input.list('clauseId', { keepEmpty: true }), topics = input.list('topic', { keepEmpty: true })
  const dates = input.list('applicableFrom', { keepEmpty: true }), texts = input.list('text', { keepEmpty: true })
  insist(ids.length === topics.length && ids.length === dates.length && ids.length === texts.length, 'invalid_handbook_clauses')
  value = ids.flatMap((id, index) => !id && !topics[index] && !dates[index] && !texts[index] ? [] : [{ clauseId: Number(id), topic: topics[index], applicableFrom: dates[index], text: texts[index] }])
 }
 insist(Array.isArray(value) && value.length > 0 && value.length <= 24, 'invalid_handbook_clauses')
 const clauses = value.map((clause: unknown): HandbookClause => {
  insist(clause && typeof clause === 'object' && !Array.isArray(clause), 'invalid_handbook_clause')
  const row = clause as Record<string, unknown>
  insist(Object.keys(row).length === 4 && Object.keys(row).every(key => ['clauseId', 'topic', 'applicableFrom', 'text'].includes(key)), 'invalid_handbook_clause')
  insist(typeof row.clauseId === 'number' && Number.isSafeInteger(row.clauseId) && row.clauseId > 0 && row.clauseId <= 9999, 'invalid_handbook_clause_id')
  insist(typeof row.topic === 'string' && (HANDBOOK_TOPICS as readonly string[]).includes(row.topic), 'invalid_handbook_topic')
  insist(typeof row.applicableFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.applicableFrom) && Number.isFinite(Date.parse(row.applicableFrom)) && new Date(row.applicableFrom).toISOString().slice(0, 10) === row.applicableFrom, 'invalid_handbook_date')
  insist(typeof row.text === 'string' && row.text.trim().length > 0 && row.text.length <= 1600 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(row.text), 'invalid_handbook_text')
  return { clauseId: row.clauseId, topic: row.topic as HandbookTopic, applicableFrom: row.applicableFrom, text: row.text.trim() }
 })
 insist(new Set(clauses.map(clause => clause.clauseId)).size === clauses.length && clauses.reduce((size, clause) => size + clause.text.length, 0) <= 12000, 'invalid_handbook_clauses')
 return clauses.sort((a, b) => a.clauseId - b.clauseId)
}

export async function writeHandbook(env: Bindings, actor: Actor, input: Input) {
 input.only(['handbook', 'revision', 'title', 'clauses', 'clauseId', 'topic', 'applicableFrom', 'text', 'returnTo'])
 actor = await freshAiActor(env, actor)
 requirePermission(actor, 'people.manage')
 const supplied = input.text('handbook', { optional: true }), handbookId = supplied || newId()
 const priorRevision = input.text('revision', { optional: true }), title = input.text('title', { max: 160 }), clauses = readClauses(input)
 insist(!/[\u0000-\u001f]/.test(title), 'invalid_handbook_title')
 const previous = supplied ? await one<{ version: number }>(env, 'SELECT MAX(version) AS version FROM wl_ai_handbook_versions WHERE handbook_id=?', handbookId) : null
 const version = (previous?.version ?? 0) + 1, versionId = newId(), revision = newId(), at = now()
 await commit(env, [authority(env, actor), ...(supplied ? [unchanged(env, handbookId, priorRevision), stmt(env, 'UPDATE wl_ai_handbooks SET revision=? WHERE id=?', revision, handbookId)] : [stmt(env, 'INSERT INTO wl_ai_handbooks(id,revision,created_by,created_at) VALUES(?,?,?,?)', handbookId, revision, actor.id, at)]),
  guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM wl_ai_handbook_versions WHERE handbook_id=? AND version>=?)', handbookId, version),
  stmt(env, 'INSERT INTO wl_ai_handbook_versions(id,handbook_id,version,title,clauses_json,created_by,created_at) VALUES(?,?,?,?,?,?,?)', versionId, handbookId, version, title, JSON.stringify(clauses), actor.id, at)],
 { actor: actor.id, action: 'ai.handbook.draft', subject: handbookId, detail: { versionId, version, revision, clauseCount: clauses.length } })
 return { id: handbookId, handbookId, versionId, version, revision }
}

async function versionFor(env: Bindings, versionId: string) {
 const row = await one<{ handbook_id: string; version: number }>(env, 'SELECT handbook_id,version FROM wl_ai_handbook_versions WHERE id=?', versionId)
 insist(row, 'handbook_version_not_found', 404)
 return row
}

export async function approveHandbook(env: Bindings, actor: Actor, input: Input) {
 input.only(['version', 'revision', 'sourceAttestation', 'returnTo'])
 actor = await freshAiActor(env, actor)
 requirePermission(actor, 'people.manage')
 insist(input.flag('sourceAttestation'), 'handbook_attestation_required')
 const versionId = input.text('version'), priorRevision = input.text('revision'), source = await versionFor(env, versionId), revision = newId()
 await commit(env, [authority(env, actor), unchanged(env, source.handbook_id, priorRevision),
  guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM wl_ai_handbook_versions WHERE handbook_id=? AND version>?) AND NOT EXISTS(SELECT 1 FROM wl_ai_handbook_approvals WHERE version_id=?)', source.handbook_id, source.version, versionId),
  stmt(env, 'INSERT INTO wl_ai_handbook_approvals(version_id,approved_by,approved_at,attestation_version) VALUES(?,?,?,?)', versionId, actor.id, now(), HANDBOOK_ATTESTATION_VERSION),
  stmt(env, 'DELETE FROM wl_ai_handbook_inclusions WHERE version_id IN (SELECT id FROM wl_ai_handbook_versions WHERE handbook_id=?)', source.handbook_id),
  stmt(env, 'UPDATE wl_ai_handbooks SET revision=? WHERE id=?', revision, source.handbook_id)],
 { actor: actor.id, action: 'ai.handbook.approve', subject: source.handbook_id, detail: { versionId, version: source.version, revision, attestationVersion: HANDBOOK_ATTESTATION_VERSION } })
 return { handbookId: source.handbook_id, versionId, revision, approved: true }
}

export async function includeHandbook(env: Bindings, actor: Actor, input: Input) {
 input.only(['version', 'revision', 'included', 'returnTo'])
 actor = await freshAiActor(env, actor)
 requirePermission(actor, 'people.manage')
 const versionId = input.text('version'), included = input.flag('included'), source = await versionFor(env, versionId), revision = newId()
 await commit(env, [authority(env, actor), unchanged(env, source.handbook_id, input.text('revision')),
  ...(included ? [guard(env, 'handbook_not_current_approved', `EXISTS(SELECT 1 FROM wl_ai_handbook_approvals WHERE version_id=?) AND NOT EXISTS(SELECT 1 FROM wl_ai_handbook_versions v JOIN wl_ai_handbook_approvals a ON a.version_id=v.id WHERE v.handbook_id=? AND v.version>?)`, versionId, source.handbook_id, source.version),
   stmt(env, 'DELETE FROM wl_ai_handbook_inclusions WHERE version_id IN (SELECT id FROM wl_ai_handbook_versions WHERE handbook_id=?)', source.handbook_id),
   stmt(env, 'INSERT INTO wl_ai_handbook_inclusions(version_id,included_by,included_at) VALUES(?,?,?)', versionId, actor.id, now())] : [stmt(env, 'DELETE FROM wl_ai_handbook_inclusions WHERE version_id=?', versionId)]),
  stmt(env, 'UPDATE wl_ai_handbooks SET revision=? WHERE id=?', revision, source.handbook_id)],
 { actor: actor.id, action: 'ai.handbook.inclusion', subject: source.handbook_id, detail: { versionId, revision, included } })
 return { handbookId: source.handbook_id, versionId, revision, included }
}

export async function withdrawHandbook(env: Bindings, actor: Actor, input: Input) {
 input.only(['handbook', 'revision', 'returnTo'])
 actor = await freshAiActor(env, actor)
 requirePermission(actor, 'people.manage')
 const handbookId = input.text('handbook'), revision = newId()
 await commit(env, [authority(env, actor), unchanged(env, handbookId, input.text('revision')),
  stmt(env, 'UPDATE wl_ai_handbooks SET withdrawn_at=?,withdrawn_by=?,revision=? WHERE id=?', now(), actor.id, revision, handbookId),
  stmt(env, 'DELETE FROM wl_ai_handbook_inclusions WHERE version_id IN (SELECT id FROM wl_ai_handbook_versions WHERE handbook_id=?)', handbookId)],
 { actor: actor.id, action: 'ai.handbook.withdraw', subject: handbookId, detail: { revision } })
 return { handbookId, revision, withdrawn: true }
}

// Ordinary readers receive the current published version even when AI inclusion is off.
// Applicable dates are explicit; provider callers must select clauses effective today.
export async function handbookSources(env: Bindings, actor: Actor, { manage = false }: { manage?: boolean } = {}): Promise<HandbookSource[]> {
 actor = await freshAiActor(env, actor)
 if (manage) requirePermission(actor, 'people.manage')
 const rows = await all(env, `SELECT h.id AS handbook_id,h.revision,h.withdrawn_at,v.id AS version_id,v.version,v.title,v.clauses_json,a.approved_at,
  EXISTS(SELECT 1 FROM wl_ai_handbook_inclusions i WHERE i.version_id=v.id) AS included,
  NOT EXISTS(SELECT 1 FROM wl_ai_handbook_versions newer JOIN wl_ai_handbook_approvals approval ON approval.version_id=newer.id WHERE newer.handbook_id=h.id AND newer.version>v.version) AND a.version_id IS NOT NULL AS current
  FROM wl_ai_handbooks h JOIN wl_ai_handbook_versions v ON v.handbook_id=h.id
  LEFT JOIN wl_ai_handbook_approvals a ON a.version_id=v.id
  WHERE EXISTS(${SESSION}${manage ? ` AND ${MANAGEMENT}` : ''})
  ${manage ? '' : `AND h.withdrawn_at IS NULL AND a.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM wl_ai_handbook_versions newer JOIN wl_ai_handbook_approvals approval ON approval.version_id=newer.id WHERE newer.handbook_id=h.id AND newer.version>v.version)`}
  ORDER BY h.created_at,h.id,v.version DESC`, actor.sessionId, actor.id, now())
 return rows.map(row => ({ handbookId: row.handbook_id, revision: row.revision, versionId: row.version_id, version: row.version, title: row.title, clauses: JSON.parse(row.clauses_json) as HandbookClause[], approvedAt: row.approved_at, included: !!row.included, current: !!row.current && !row.withdrawn_at, withdrawnAt: row.withdrawn_at }))
}
