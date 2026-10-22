// DATA-002's bridge to Base: retain SQL descriptions while building the native
// batch, then publish native erasure and import retirement in the same transaction.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { requireOwner } from '../actor'
import { all, insist, one } from '../core'
import { ownerPredicate } from '../movein/authority'
import { willowTargets } from '../movein/target'
import { erasureTargets } from './import-target'
import { canonicalJson, retireD1ImportCustody, sha256, type D1ImportContext, type D1ImportPerson, type D1Sql, type SourceRecord } from '../../modules/import-kit/src/d1/index'

/** Wrap BEFORE constructing statements, including portability's statements. No
 * D1 implementation internals are inspected; execution still uses the real DB. */
export function captureErasureSql(original: Bindings) {
  const descriptions = new WeakMap<object, D1Sql>()
  function wrap(statement: D1PreparedStatement, sql: string, params: unknown[] = []): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...values: unknown[]) => wrap(target.bind(...values), sql, values)
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    descriptions.set(proxy, { sql, params })
    return proxy
  }
  const database = new Proxy(original.DB, {
    get(target, property) {
      if (property === 'prepare') return (sql: string) => wrap(target.prepare(sql), sql)
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const env = new Proxy(original, { get(target, property) { return property === 'DB' ? database : Reflect.get(target, property, target) } })
  return {
    env,
    sql(statements: D1PreparedStatement[]): D1Sql[] {
      return statements.map(statement => {
        const captured = descriptions.get(statement)
        insist(captured, 'erasure_statement_not_captured', 500)
        return { sql: captured.sql, params: [...captured.params ?? []] }
      })
    },
  }
}

export interface ImportErasureSubject {
  personId: string
  workEmail?: string
  employeeNumber?: string
  memberEmail?: string
  legalName?: string
}

const normal = (header: string) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const aliases = {
  id: ['id', 'eeid', 'employeeid'],
  number: ['employeenumber', 'employee', 'employeeno'],
  email: ['workemail'],
  supervisor: ['supervisoreid', 'supervisorid'],
  managerName: ['reportsto', 'reportingto', 'supervisor'],
}
function cellsOf(record: Pick<SourceRecord, 'payload'>): Record<string, string> {
  const payload = record.payload as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const cells = payload.cells
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return {}
  return Object.fromEntries(Object.entries(cells).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([key, value]) => [normal(key), value.trim()]))
}
const field = (cells: Record<string, string>, names: string[]) => names.map(name => cells[name]).find(Boolean) ?? ''

/** Same source-key precedence as BambooHR's parser, independent of door namespace. */
export function bamboohrErasureKey(record: Pick<SourceRecord, 'payload'>): string | null {
  const cells = cellsOf(record), id = field(cells, aliases.id), number = field(cells, aliases.number)
  return id ? `id:${id}` : number ? `number:${number}` : null
}

export function importErasureContext(env: Bindings, actor: Actor): D1ImportContext {
  requireOwner(actor)
  return { destination: 'people', namespace: 'bamboohr', mappingVersion: 'bamboohr-people-1',
    storage: { database: env.DB as never, targets: erasureTargets },
    authorization: { principalId: actor.id, predicate: () => ownerPredicate(actor) } }
}

/** A read-only selector: exact native identity or exact source contact/key only.
 * Peer records that name this manager are withdrawn from undo custody whole;
 * their live rows remain the native erasure planner's responsibility. */
export async function selectImportErasure(env: Bindings, subject: ImportErasureSubject) {
  const employeeNumber = subject.employeeNumber ?? ''
  const emails = new Set([subject.workEmail, subject.memberEmail].filter((value): value is string => !!value).map(value => value.toLowerCase()))
  const keys = new Set<string>(), loaded: { id: string; sources: SourceRecord[] }[] = []
  if (employeeNumber) keys.add(`number:${employeeNumber}`)
  // Source ids survive in plan payloads even after a source employee number or
  // email has changed. Decode chunked plans through Base's own loader.
  const { loadPlans } = await import('../../modules/import-kit/src/d1/plans')
  const jobs = await all(env, 'SELECT j.*,s.revision AS custody_revision FROM ik_jobs j LEFT JOIN ik_d1_custody_states s ON s.job_id=j.id WHERE j.destination=? ORDER BY j.id', 'people')
  for (const job of jobs) {
    const plans = await loadPlans([job], env.DB as never, willowTargets.planCodec)
    loaded.push({ id: job.id, sources: plans.get(job.id)!.entries.filter(entry => !entry.erased).map(entry => entry.source) })
    for (const entry of plans.get(job.id)!.entries) {
      if (entry.erased) continue
      const cells = cellsOf(entry.source), key = bamboohrErasureKey(entry.source)
      const own = entry.effects.some(effect => effect.targetKind === 'person' && effect.targetId === subject.personId)
        || !!key && sha256(`willow:bamboohr:person:${key}`) === subject.personId
        || !!employeeNumber && field(cells, aliases.number) === employeeNumber
        || emails.has(field(cells, aliases.email).toLowerCase())
      if (own && key) keys.add(key)
    }
  }
  const source = (record: SourceRecord) => {
    const cells = cellsOf(record), key = bamboohrErasureKey(record)
    return !!key && (keys.has(key) || sha256(`willow:bamboohr:person:${key}`) === subject.personId)
      || !!employeeNumber && field(cells, aliases.number) === employeeNumber
      || emails.has(field(cells, aliases.email).toLowerCase())
      || keys.has(`id:${field(cells, aliases.supervisor)}`)
      || !!subject.legalName && field(cells, aliases.managerName) === subject.legalName
  }
  const person: D1ImportPerson = {
    target: { kind: 'person', id: subject.personId },
    values: [...new Set([subject.personId, subject.employeeNumber, subject.workEmail, subject.memberEmail].filter((value): value is string => !!value))],
    related: { source },
  }
  const headers = jobs.map(job => [job.id, job.fingerprint, job.custody_revision])
  const guards: D1Sql[] = [{
    sql: `INSERT INTO wl_guard(code,ok) SELECT 'stale',
      (SELECT COUNT(*) FROM ik_jobs WHERE destination='people')=? AND NOT EXISTS(
        SELECT 1 FROM json_each(?) h WHERE NOT EXISTS(
          SELECT 1 FROM ik_jobs j JOIN ik_d1_custody_states s ON s.job_id=j.id
          WHERE j.id=json_extract(h.value,'$[0]') AND j.fingerprint=json_extract(h.value,'$[1]')
          AND s.revision IS json_extract(h.value,'$[2]')))`,
    params: [headers.length, JSON.stringify(headers)],
  }]
  return { person, sourceKeys: [...keys].sort(), jobs: loaded.filter(job => job.sources.some(source)).map(job => job.id), guards, snapshot: sha256(canonicalJson(headers)) }
}

const encode = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
async function keyedDigest(secret: string, key: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return encode(new Uint8Array(await crypto.subtle.sign('HMAC', material, new TextEncoder().encode(canonicalJson(['bamboohr', key])))))
}

/** Call at confirmation only. The new key and quarantine rows are inserted in
 * the erasure publication, never during preview. A concurrent key creation fails
 * the SQL guard instead of recording digests under the wrong key. */
export async function erasedImportKeyStatements(env: Bindings, sourceKeys: string[], receiptId: string): Promise<D1Sql[]> {
  if (!sourceKeys.length) return []
  const existing = await one<{ secret: string }>(env, 'SELECT secret FROM wl_retention_import_secret WHERE singleton=1')
  const secret = existing?.secret ?? encode(crypto.getRandomValues(new Uint8Array(32)))
  return [
    { sql: 'INSERT OR IGNORE INTO wl_retention_import_secret(singleton,secret) VALUES(1,?)', params: [secret] },
    { sql: "INSERT INTO wl_guard(code,ok) SELECT 'stale',EXISTS(SELECT 1 FROM wl_retention_import_secret WHERE singleton=1 AND secret=?)", params: [secret] },
    ...await Promise.all([...new Set(sourceKeys)].map(async key => ({ sql: 'INSERT OR IGNORE INTO wl_erased_import_keys(digest,receipt_id) VALUES(?,?)', params: [await keyedDigest(secret, key), receiptId] }))),
  ]
}

/** Screening returns only matching positions and erasure receipts. The caller
 * must block publication of these source rows, including a pre-existing plan;
 * never retain their raw payload in a supposedly sanitized rejection record. */
export async function quarantinedImportSources(env: Bindings, records: Pick<SourceRecord, 'payload'>[]) {
  const secret = await one<{ secret: string }>(env, 'SELECT secret FROM wl_retention_import_secret WHERE singleton=1')
  const rows = await all<{ digest: string; receipt_id: string }>(env, 'SELECT digest,receipt_id FROM wl_erased_import_keys')
  insist(secret || !rows.length, 'erasure_import_key_missing', 409)
  if (!secret) return []
  const erased = new Map(rows.map(row => [row.digest, row.receipt_id]))
  const matches: { index: number; receiptId: string }[] = []
  for (const [index, record] of records.entries()) {
    const key = bamboohrErasureKey(record)
    if (!key) continue
    const receiptId = erased.get(await keyedDigest(secret.secret, key))
    if (receiptId) matches.push({ index, receiptId })
  }
  return matches
}

/** Both arrays must come from the capture above. Include the native audit row
 * and receipt in nativeSql; checkpoint is portability.redactionStatements(). */
export async function retireImportCustody(env: Bindings, actor: Actor, subject: ImportErasureSubject,
  nativeSql: D1Sql[], checkpoint: D1Sql[], receiptId: string) {
  const selection = await selectImportErasure(env, subject)
  const quarantine = await erasedImportKeyStatements(env, selection.sourceKeys, receiptId)
  return retireD1ImportCustody(selection.person, [...selection.guards, ...quarantine, ...selection.jobs.map(job => ({ sql: 'INSERT OR REPLACE INTO wl_import_erasure_fences(job_id,receipt_id) VALUES(?,?)', params: [job, receiptId] })), ...nativeSql], importErasureContext(env, actor), checkpoint)
}
