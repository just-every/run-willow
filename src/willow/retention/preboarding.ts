import { readTargets,moveRows,finishBlobs,type RowTarget } from './erase'
// DATA-002 for expired or withdrawn preboarding identities, without employee authority.
import { erasureStatements, invalidateTransfersStatements, redactionStatements } from '@runeditrun/rer/modules/portability/journal'
import type { Bindings } from '../../auth.server'
import { employerZone, requireOwner, type Actor } from '../actor'
import { auditRead, commit, guard, insist, newId, now, one, sha256Hex, stmt, WillowError } from '../core'
import { addDays, today as dayOf } from '../dates'
import type { Input } from '../input'
import { BUSINESS_SEQUENCE, type Blocker, type Item } from './erasure'
import { holds, type Hold } from './holds'
import { movePreboarding, preboardRedactions, type PreboardStore } from './preboard-custody'
import { classExpiry, CLASSES, TABLE_VERSION } from './rules'
import { adoption, contractorStatus } from './settings'

interface Packet {
  id: string; identity_id: string; name: string; email: string; created_at: number; identity_created_at: number
  source_on: string; expires_on: string; expires_at: number; status: string; revision: number
  linked_person_id: string | null; delivery_status: string; revoked_at: number | null
}
const EMPLOYEE = `EXISTS (SELECT 1 FROM wl_people WHERE lower(work_email) = lower(?))
  OR EXISTS (SELECT 1 FROM wl_eeo_answers WHERE source_packet_id = ?)`
const SQL_NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)"

function matchingHolds(active: Hold[], packet: Packet, cls: Item['class'], firstDay: string, lastDay: string) {
  return active.filter(hold => hold.scope_kind === 'employer'
    || hold.scope_kind === 'person' && [packet.id, packet.identity_id].includes(hold.scope_ref ?? '')
    || hold.scope_kind === 'record_class' && (hold.scope_ref === cls || cls === null && ['personnel', 'eeo'].includes(hold.scope_ref ?? ''))
    || hold.scope_kind === 'date_range' && (!hold.from_date || !hold.to_date || firstDay <= hold.to_date && lastDay >= hold.from_date))
}

/** Read metadata and counts only. Capture the business fence before any planning read. */
export async function planPreboarding(env: Bindings, actor: Actor, packetId: string) {
  requireOwner(actor)
  const sequence = (await one<{ value: number }>(env, `SELECT ${BUSINESS_SEQUENCE} AS value`))!.value
  const packet = await one<Packet>(env, `SELECT p.id, p.identity_id, i.name, i.email, p.created_at, i.created_at AS identity_created_at,
    p.source_on, p.expires_on, p.expires_at, p.status, p.revision, p.linked_person_id, p.delivery_status,
    (SELECT MAX(at) FROM wl_audit WHERE action = 'preboarding.withdraw' AND subject = p.id) AS revoked_at
    FROM wl_preboard_packets p JOIN wl_preboard_identities i ON i.id = p.identity_id WHERE p.id = ?`, packetId)
  insist(packet, 'not_found', 404)
  const [zone, adopted, contractor, activeHolds] = await Promise.all([
    employerZone(env), adoption(env), contractorStatus(env, actor.today), holds(env, { active: true }),
  ])
  const blockers: Blocker[] = []
  if (packet.status === 'linked' || packet.linked_person_id || await one(env, `SELECT 1 WHERE ${EMPLOYEE}`, packet.email, packet.id)) {
    blockers.push({ kind: 'hired_preboarding', ref: packetId, reason: 'This packet became an employee record; erase the worker instead' })
  }
  if (packet.status === 'active' && packet.expires_at > now()) {
    blockers.push({ kind: 'active_preboarding', ref: packetId, reason: 'The preboarding invitation is still active; withdraw it or wait for expiry' })
  }
  if (!adopted || adopted.table_version !== TABLE_VERSION) blockers.push({ kind: 'retention_not_adopted', ref: TABLE_VERSION, reason: 'The owner has not adopted the current retention table' })
  const answers = (await one<{ n: number; at: number | null; day: string | null }>(env,
    'SELECT COUNT(*) AS n, MAX(recorded_at) AS at, MAX(recorded_on) AS day FROM wl_preboard_eeo_answers WHERE packet_id = ?', packet.id))!
  const firstDay = [packet.source_on, dayOf(zone, Math.min(packet.created_at, packet.identity_created_at))].sort()[0]
  // Expiry is exclusive for portal authority, but retention uses the expiry day itself.
  const recordDay = [packet.source_on, packet.expires_on, dayOf(zone, Math.max(packet.created_at, packet.identity_created_at,
    packet.expires_at, packet.revoked_at ?? 0, answers.at ?? 0)), answers.day ?? ''].sort().at(-1)!
  const signature=await one<{n:number;bytes:number}>(env,'SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS bytes FROM wl_preboard_signatures WHERE packet_id=?',packet.id)
  const definitions = [
    {id:'preboard_signatures',table:'wl_preboard_signatures',label:'Preboarding signed receipt and certificate',column:'packet_id',subject:packet.id,cls:'personnel' as const,rows:signature!.n,bytes:signature!.bytes},
    {id:'preboard_language',table:'wl_display_languages',label:'Preboarding display language',column:'subject',subject:packet.id,cls:null,rows:(await one<{n:number}>(env,"SELECT COUNT(*) AS n FROM wl_display_languages WHERE kind='preboarding' AND subject=?",packet.id))!.n},

    { id: 'preboard_eeo', table: 'wl_preboard_eeo_answers', label: 'Preboarding self-identification answers', column: 'packet_id', subject: packet.id, cls: 'eeo' as const, rows: answers.n },
    { id: 'preboard_packets', table: 'wl_preboard_packets', label: 'Preboarding invitation metadata', column: 'id', subject: packet.id, cls: null, rows: 1 },
    { id: 'preboard_identities', table: 'wl_preboard_identities', label: 'Preboarding identity', column: 'id', subject: packet.identity_id, cls: 'personnel' as const, rows: 1 },
  ]
  const stores: PreboardStore[] = definitions.map(definition => {
    const cls = definition.cls, applicable = matchingHolds(activeHolds, packet, cls, firstDay, recordDay)
    const expiry = cls ? classExpiry(cls, { hire: firstDay, end: recordDay, record: recordDay }, contractor) : recordDay
    const disposition: Item['disposition'] = applicable.length ? 'held' : cls && expiry > actor.today ? 'retained' : 'erased'
    const item: Item = { id: definition.id, table: definition.table, label: definition.label, class: cls, rule: cls ? CLASSES[cls].citation : null,
      expiry: cls || applicable.length ? expiry : null, hold: applicable[0]?.id ?? null, disposition, rows: definition.rows, blobs: definition.table==='wl_preboard_signatures'?definition.rows:0, bytes:'bytes' in definition?definition.bytes??0:0 }
    return { ...definition, item, holds: applicable }
  })
  const items = stores.filter(store => store.item.rows).map(store => store.item)
  const exports = (await one<{ n: number; first: number | null }>(env,
    "SELECT COUNT(*) AS n, MIN(at) AS first FROM wl_audit WHERE (action LIKE '%export%' OR action LIKE '%bundle%') AND at >= ?", Math.min(packet.created_at, packet.identity_created_at)))!
  const copies = {
    exports: { count: exports.n, since: exports.first === null ? null : new Date(exports.first).toISOString().slice(0, 10), statement: 'Exports and archives made while this preboarding identity existed may include it; Willow does not record which identities each contained.' },
    providers: packet.delivery_status === 'accepted' ? [{ provider: 'MAIL_PROVIDER (preboarding invitation)', copies: 1 }] : [] as { provider: string; copies: number }[],
  }
  const request = await one<{ id: string; status: string; source: string; received_on: string }>(env,
    "SELECT id, status, source, received_on FROM wl_erasure_requests WHERE preboarding_id = ? AND status IN ('open', 'confirmed')", packetId)
  blockers.sort((a, b) => (a.kind + a.ref).localeCompare(b.kind + b.ref))
  const digest = await sha256Hex(JSON.stringify({ sequence, asOf: actor.today, version: TABLE_VERSION, adopted: adopted?.id ?? null, contractor,
    packet, recordDay, answers, items, holds: stores.map(store => [store.id, store.holds.map(hold => [hold.id, hold.review_date])]), blockers, copies, request }))
  const total = (disposition: Item['disposition']) => items.filter(item => item.disposition === disposition).reduce((sum, item) => sum + item.rows, 0)
  const view = {
    person: { id: packetId, name: packet.name }, preboarding: true, asOf: actor.today, tableVersion: TABLE_VERSION,
    adopted: adopted ? { version: adopted.table_version, at: adopted.adopted_at } : null, states: [] as string[],
    eligible: !blockers.some(blocker => ['hired_preboarding', 'active_preboarding'].includes(blocker.kind)), confirmable: blockers.length === 0,
    blockers, request, examined: stores.length,
    summary: { rows: items.reduce((sum, item) => sum + item.rows, 0), blobs:items.reduce((sum,item)=>sum+item.blobs,0), bytes:items.reduce((sum,item)=>sum+item.bytes,0), erased: total('erased'), anonymized: 0, redacted: 0, retained: total('retained'), held: total('held') },
    items, copies, digest,
  }
  return { sequence, view, packet, stores }
}

export async function previewPreboarding(env: Bindings, actor: Actor, packetId: string) {
  const { view } = await planPreboarding(env, actor, packetId)
  await auditRead(env, actor.id, 'erasure.preview', packetId, { digest: view.digest, blockers: view.blockers.length })
  return view
}

export async function confirmPreboarding(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['preboarding', 'digest', 'returnTo'])
  const packetId = input.text('preboarding', { max: 64 }), digest = input.text('digest', { max: 64 })
  const plan = await planPreboarding(env, actor, packetId), { view, packet } = plan
  const request = view.request
  insist(request?.status === 'open', 'erasure_request_required', 409)
  insist(view.digest === digest, 'preview_stale', 409)
  if (view.blockers.length) throw new WillowError('erasure_blocked', 409, view.blockers)
  const randomLabel = Array.from(crypto.getRandomValues(new Uint8Array(4)), byte => byte.toString(16).padStart(2, '0')).join('')
  const label = `Former person ${randomLabel}`, stub = newId(), erasure = newId(), at = now()
  const scrub = preboardRedactions(env, packet, label)
  const counts = view.items.map(item => ({ store: item.id, table: item.table, disposition: item.disposition, class: item.class, expiry: item.expiry, hold: item.hold, rows: item.rows }))
  const targets:RowTarget[]=plan.stores.map(store=>({id:store.id,table:store.table,item:store.item,...store.table==='wl_preboard_signatures'?{blob:'t.size'}:{},from:store.table+" t WHERE t."+store.column+"='"+store.subject.replaceAll("'","''")+"'"+(store.table==='wl_display_languages'?" AND t.kind='preboarding'":"")}))
  const {ids,blobs}=await readTargets(env,targets,[]),blobList=[...blobs]
  await commit(env, [
    guard(env, 'preview_stale', `${BUSINESS_SEQUENCE} = ?`, plan.sequence),
    guard(env, 'preview_stale', `EXISTS (SELECT 1 FROM wl_preboard_packets WHERE id = ? AND revision = ? AND linked_person_id IS NULL
      AND (status = 'revoked' OR (status = 'active' AND expires_at <= ${SQL_NOW})))`, packetId, packet.revision),
    guard(env, 'preview_stale', `NOT (${EMPLOYEE})`, packet.email, packetId),
    guard(env, 'preview_stale', "EXISTS (SELECT 1 FROM wl_erasure_requests WHERE id = ? AND preboarding_id = ? AND status = 'open')", request.id, packetId),
    guard(env, 'stale', `EXISTS (SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email) = m.email
      WHERE m.id = ? AND m.status = 'active' AND o.status = 'active' AND o.role = 'owner')`, actor.id),
    stmt(env, 'INSERT INTO wl_erasure_window (token) VALUES (?)', erasure),
    ...await moveRows(env, targets, ids, erasure, at),
    stmt(env, 'UPDATE wl_erasure_requests SET preboarding_id = ? WHERE preboarding_id = ?', stub, packetId),
    stmt(env, `INSERT INTO wl_erasure_receipts
      (id, request_id, label, source, received_on, approved_by, approved_at, digest, counts_json, blobs_total, blobs_bytes, scrubbed_json, copies_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${scrub.countsSql}, ?)`,
    erasure, request.id, label, request.source, request.received_on, actor.id, at, digest, JSON.stringify(counts), blobList.length,blobList.reduce((sum,[,size])=>sum+size,0),JSON.stringify(view.copies)),
    ...blobList.map(([sha,size])=>stmt(env,'INSERT INTO wl_erasure_blobs(erasure_id,sha256,size) VALUES(?,?,?)',erasure,sha,size)),
    ...scrub.statements,
    ...view.copies.providers.map(provider => stmt(env, 'INSERT INTO wl_provider_requests (id, erasure_id, provider, copies, assignee, due_date, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      newId(), erasure, provider.provider, provider.copies, actor.id, addDays(actor.today, 30), at)),
    stmt(env, "UPDATE wl_erasure_requests SET status = 'confirmed', confirmed_digest = ?, confirmed_by = ?, confirmed_at = ?, receipt_id = ? WHERE id = ? AND status = 'open'", digest, actor.id, at, erasure, request.id),
    ...await erasureStatements(env.DB, 'wl_preboard_packets', { id: packetId }),
    ...await erasureStatements(env.DB, 'wl_preboard_identities', { id: packet.identity_id }),
    ...await redactionStatements(env.DB), ...await invalidateTransfersStatements(env.DB),
    stmt(env, 'DELETE FROM wl_erasure_window'),
  ], { actor: actor.id, action: 'erasure.execute', subject: erasure, detail: { digest, rows: view.summary.rows } })
  await finishBlobs(env,erasure).catch(()=>0)
  return { id: request.id, status: 'confirmed', receipt: erasure, label, digest }
}
