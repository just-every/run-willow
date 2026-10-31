import { requireNoAgentCustody } from '../agent-door/custody'
// DATA-002 for an applicant who was not hired: every application sharing the contact email, their resumes,
// scorecards and timeline are classified, previewed and erased exactly as a former worker's are, with the
// applicant's identity in audit replaced by one random label.
import { erasureStatements, invalidateTransfersStatements, redactionStatements } from '@runeditrun/rer/modules/portability/journal'
import type { Bindings } from '../../auth.server'
import { employerZone, requireOwner, type Actor } from '../actor'
import { all, auditRead, guard, insist, json, newId, now, one, sha256Hex, stmt, commit as commitBatch, WillowError } from '../core'
import { today as dayOf } from '../dates'
import type { Input } from '../input'
import { finishBlobs, moveRows, readTargets, type RowTarget } from './erase'
import { holds } from './holds'
import { classExpiry, CLASSES, TABLE_VERSION } from './rules'
import { adoption, contractorStatus } from './settings'
import { BUSINESS_SEQUENCE, type Blocker, type Item } from './erasure'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
const hex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
const TERMINAL = new Set(['hired', 'rejected', 'withdrawn'])

export async function planApplicant(env: Bindings, actor: Actor, applicationId: string) {
  await requireNoAgentCustody(env)
  requireOwner(actor)
  const sequence = (await one<{value:number}>(env,`SELECT ${BUSINESS_SEQUENCE} AS value`))!.value
  const app = await one<{ id: string; name: string; contact_email: string | null }>(env, 'SELECT id, name, contact_email FROM wl_hiring_applications WHERE id = ?', applicationId)
  insist(app, 'not_found', 404)
  const email = (app.contact_email ?? '').toLowerCase()
  const linked = email ? await all<{ id: string; stage: string; name: string }>(env, 'SELECT id, stage, name FROM wl_hiring_applications WHERE lower(contact_email) = ? ORDER BY created_at, id', email) : [{ id: app.id, stage: '', name: app.name }]
  if (!email) linked[0].stage = (await one<{ stage: string }>(env, 'SELECT stage FROM wl_hiring_applications WHERE id = ?', app.id))!.stage
  const list = linked.map(row => quote(row.id)).join(', ')
  const blockers: Blocker[] = []
  if (email && await one(env, 'SELECT 1 FROM wl_people WHERE lower(work_email) = ?', email)) blockers.push({ kind: 'hired_applicant', ref: applicationId, reason: 'The applicant became an employee; erase them as a worker' })
  for (const row of linked) if (!TERMINAL.has(row.stage.toLowerCase()) && !await one(env,'SELECT 1 FROM wl_hiring_closures WHERE application_id=?',row.id)) blockers.push({ kind: 'open_application', ref: row.id, reason: 'An application is still in selection' })
  const adopted = await adoption(env)
  if (!adopted) blockers.push({ kind: 'retention_not_adopted', ref: TABLE_VERSION, reason: 'The owner has not adopted the retention table' })
  const stores: (RowTarget & { label: string; ms: string })[] = [
    {id:'applicant_language',table:'wl_display_languages',label:'Applicant display language',ms:'0',from:`wl_display_languages t WHERE t.kind='applicant' AND t.subject IN (${list})`},
    { id: 'applicant_eeo', table: 'wl_applicant_eeo_answers', label: 'Application self-identification answers', ms: 't.recorded_at', from: `wl_applicant_eeo_answers t WHERE t.application_id IN (${list})` },
    { id: 'applicant_eeo_invites', table: 'wl_applicant_eeo_invitations', label: 'Application self-identification invitations', ms: 't.invited_at', from: `wl_applicant_eeo_invitations t WHERE t.application_id IN (${list})` },
    { id: 'application_closures', table: 'wl_hiring_closures', label: 'Application closure decisions', ms: 't.closed_at', from: `wl_hiring_closures t WHERE t.application_id IN (${list})` },
    { id: 'applications', table: 'wl_hiring_applications', label: 'Applications', ms: 't.created_at', from: `wl_hiring_applications t WHERE t.id IN (${list})` },
    { id: 'resumes', table: 'wl_hiring_resumes', label: 'Resume versions', ms: 't.uploaded_at', blob: 't.size', from: `wl_hiring_resumes t WHERE t.application_id IN (${list})` },
    { id: 'scorecards', table: 'wl_hiring_scorecards', label: 'Interviewer scorecards', ms: 't.created_at', from: `wl_hiring_scorecards t WHERE t.application_id IN (${list})` },
    { id: 'events', table: 'wl_hiring_events', label: 'Stage timeline', ms: 't.at', from: `wl_hiring_events t WHERE t.application_id IN (${list})` },
  ].map(store => ({ ...store, item: { disposition: 'erased' as Item['disposition'], class: (store.id === 'applicant_eeo' ? 'eeo' : 'personnel') as Item['class'], rule: CLASSES[store.id === 'applicant_eeo' ? 'eeo' : 'personnel'].citation, expiry: null, hold: null } }))
  const zone = await employerZone(env), contractor = await contractorStatus(env, actor.today), activeHolds = await holds(env, { active: true })
  const measured: { store: typeof stores[number]; rows: number; bytes: number; at: number | null }[] = []
  for (const store of stores) {
    const row = (await one<{ n: number; at: number | null; bytes: number }>(env, `SELECT COUNT(*) AS n, MAX(${store.ms}) AS at, ${store.blob ? `COALESCE(SUM(${store.blob}), 0)` : '0'} AS bytes FROM ${store.from}`))!
    measured.push({ store, rows: row.n, bytes: row.bytes, at: row.at })
  }
  const decided = Math.max(0, ...measured.map(row => row.at ?? 0))
  const recordDay = decided ? dayOf(zone, decided) : actor.today
  const expiry = classExpiry('personnel', { hire: recordDay, end: recordDay, record: recordDay }, contractor)
  const heldBy = activeHolds.find(hold => hold.scope_kind === 'employer' || (hold.scope_kind === 'record_class' && hold.scope_ref === 'personnel') || (hold.scope_kind === 'person' && linked.some(row => row.id === hold.scope_ref)))?.id ?? null
  const items: Item[] = measured.filter(row => row.rows).map(({ store, rows, bytes }) => {
    const recordClass = store.item.class!
    const recordExpiry = recordClass === 'eeo' ? classExpiry('eeo',{hire:recordDay,end:recordDay,record:recordDay},contractor) : expiry
    const recordHold = activeHolds.find(hold=>hold.scope_kind==='employer' || hold.scope_kind==='record_class' && hold.scope_ref===recordClass || hold.scope_kind==='person' && linked.some(row=>row.id===hold.scope_ref))?.id ?? null
    const disposition: Item['disposition'] = recordHold ? 'held' : recordExpiry > actor.today ? 'retained' : 'erased'
    Object.assign(store.item, { disposition, expiry:recordExpiry, hold:recordHold })
    return { id: store.id, table: store.table, label: store.label, disposition, class: recordClass, rule: CLASSES[recordClass].citation, expiry:recordExpiry, hold:recordHold, rows, blobs: store.blob ? rows : 0, bytes }
  })
  blockers.sort((a, b) => (a.kind + a.ref).localeCompare(b.kind + b.ref))
  const request = await one<{ id: string; status: string; source: string; received_on: string }>(env, "SELECT id, status, source, received_on FROM wl_erasure_requests WHERE application_id = ? AND status IN ('open', 'confirmed')", applicationId)
  const digest = await sha256Hex(JSON.stringify({ version: TABLE_VERSION, sequence, adopted: adopted?.id ?? null, holds: activeHolds.map(hold => [hold.id, hold.review_date]), contractor, applicationId, linked: linked.map(row => [row.id, row.stage]), items: items.map(item => [item.id, item.rows, item.bytes, item.disposition, item.expiry, item.hold]), blockers: blockers.map(b => [b.kind, b.ref]) }))
  const total = (kind: Item['disposition']) => items.filter(item => item.disposition === kind).reduce((sum, item) => sum + item.rows, 0)
  const view = {
    person: { id: applicationId, name: app.name }, applicant: true, asOf: actor.today, tableVersion: TABLE_VERSION, adopted: adopted ? { version: adopted.table_version, at: adopted.adopted_at } : null, states: [] as string[],
    eligible: !blockers.some(b => b.kind === 'hired_applicant'), confirmable: blockers.length === 0, blockers, request, examined: stores.length,
    summary: { rows: items.reduce((sum, item) => sum + item.rows, 0), blobs: items.reduce((sum, item) => sum + item.blobs, 0), bytes: items.reduce((sum, item) => sum + item.bytes, 0), erased: total('erased'), anonymized: 0, redacted: 0, retained: total('retained'), held: total('held') },
    items, copies: { exports: { count: 0, since: null as string | null, statement: 'Exports and archives made while this application existed may include the applicant; Willow does not record which people each contained.' }, providers: [] as { provider: string; copies: number }[] }, digest,
  }
  return { view, sequence, linked, email, name: app.name, stores }
}

export async function previewApplicant(env: Bindings, actor: Actor, applicationId: string) {
  const { view } = await planApplicant(env, actor, applicationId)
  await auditRead(env, actor.id, 'erasure.preview', applicationId, { digest: view.digest, blockers: view.blockers.length })
  return view
}

export async function confirmApplicant(env: Bindings, actor: Actor, input: Input) {
  await requireNoAgentCustody(env)
  requireOwner(actor)
  const applicationId = input.text('application', { max: 64 }), digest = input.text('digest', { max: 64 })
  const request = await one<{ id: string; source: string; received_on: string }>(env, "SELECT id, source, received_on FROM wl_erasure_requests WHERE application_id = ? AND status = 'open'", applicationId)
  insist(request, 'erasure_request_required', 409)
  const plan = await planApplicant(env, actor, applicationId)
  insist(plan.view.digest === digest, 'preview_stale', 409)
  if (plan.view.blockers.length) throw new WillowError('erasure_blocked', 409, plan.view.blockers)
  const label = `Former person ${hex(4)}`, stubId = newId(), erasureId = newId(), at = now()
  const rowTargets = plan.stores.filter(store => plan.view.items.some(item => item.id === store.id))
  const { ids, blobs } = await readTargets(env, rowTargets, [])
  const swap = ([...plan.linked.map(row => [row.id, stubId]), [plan.email, label], ...plan.linked.map(row => [row.name, label])] as [string, string][]).filter(([from]) => from.length >= 5)
  const replaced = (column: string) => swap.reduce((expression, [from, to]) => `replace(${expression}, ${quote(from)}, ${quote(to)})`, column)
  const scrubbed: Record<string, number> = {}
  for (const [table, column] of [['wl_audit', 'detail'], ['wl_work_history', 'detail']] as const) scrubbed[table] = (await one<{ n: number }>(env, `SELECT COUNT(*) AS n FROM ${table} WHERE ${swap.map(([from]) => `instr(${column}, ${quote(from)}) > 0`).join(' OR ') || '0'}`))!.n
  const counts = plan.view.items.map(item => ({ store: item.id, table: item.table, disposition: item.disposition, class: item.class, expiry: item.expiry, hold: item.hold, rows: item.rows }))
  const blobList = [...blobs]
  const statements = [
    guard(env,'preview_stale',`${BUSINESS_SEQUENCE} = ?`,plan.sequence),
    stmt(env, 'INSERT INTO wl_erasure_window (token) VALUES (?)', erasureId),
    stmt(env, 'PRAGMA defer_foreign_keys = on'),
    // Children first: the timeline, scorecards and resumes name the application.
    ...await moveRows(env, [...rowTargets].sort((a, b) => (a.id === 'applications' ? 1 : 0) - (b.id === 'applications' ? 1 : 0)), ids, erasureId, at),
    ...plan.linked.map(row => stmt(env, 'UPDATE wl_audit SET subject = ? WHERE subject = ?', stubId, row.id)),
    stmt(env, `UPDATE wl_audit SET detail = ${replaced('detail')}`),
    stmt(env, `UPDATE wl_work_history SET detail = ${replaced('detail')}`),
    stmt(env, 'UPDATE wl_erasure_requests SET application_id = ? WHERE application_id = ?', stubId, applicationId),
    stmt(env, 'INSERT INTO wl_erasure_receipts (id, request_id, label, source, received_on, approved_by, approved_at, digest, counts_json, blobs_total, blobs_bytes, scrubbed_json, copies_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      erasureId, request.id, label, request.source, request.received_on, actor.id, at, digest, JSON.stringify(counts), blobList.length, blobList.reduce((sum, [, size]) => sum + size, 0), JSON.stringify(scrubbed), JSON.stringify(plan.view.copies)),
    ...blobList.map(([sha, size]) => stmt(env, 'INSERT INTO wl_erasure_blobs (erasure_id, sha256, size) VALUES (?, ?, ?)', erasureId, sha, size)),
    stmt(env, "UPDATE wl_erasure_requests SET status = 'confirmed', confirmed_digest = ?, confirmed_by = ?, confirmed_at = ?, receipt_id = ? WHERE id = ? AND status = 'open'", digest, actor.id, at, erasureId, request.id),
    ...await erasureStatements(env.DB, 'wl_hiring_applications', { id: applicationId }), ...await redactionStatements(env.DB), ...await invalidateTransfersStatements(env.DB),
    stmt(env, 'DELETE FROM wl_erasure_window'),
  ]
  await commitBatch(env, statements, { actor: actor.id, action: 'erasure.execute', subject: erasureId, detail: { digest, rows: plan.view.summary.rows } })
  await finishBlobs(env, erasureId).catch(() => 0)
  void json
  return { id: request.id, status: 'confirmed', receipt: erasureId, label, digest }
}
