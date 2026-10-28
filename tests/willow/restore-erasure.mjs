// DATA-004's restore fence on actual CLI export/import: an archive made before an erasure is refused,
// whole, when the later archive is supplied as the journal; the later archive restores without the person.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { command } from './cli.mjs'
import { freePort, harness } from './harness.mjs'
import { fixture, day } from './regression-fixture.mjs'

const work = await mkdtemp(join(tmpdir(), 'willow-restore-erasure-'))
const source = join(work, 'source'), target = join(work, 'target')
let server, destination
async function clone(path) {
  execFileSync('git', ['clone', '--quiet', process.cwd(), path])
  const changed = new Set([
    ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n'),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'),
  ].filter(Boolean))
  for (const name of changed) {
    try { await mkdir(dirname(join(path, name)), { recursive: true }); await copyFile(name, join(path, name)) }
    catch (error) { if (error.code !== 'ENOENT') throw error; await rm(join(path, name), { force: true }) }
  }
  await command(path, ['install'])
}
async function setup(path) {
  await mkdir(join(path, 'exports'), { recursive: true })
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(path, 'exports/answers.json'), JSON.stringify({ OWNER_EMAIL: 'owner@example.com' }), { mode: 0o600 })
  const port = await freePort()
  await command(path, ['setup', '--answers', 'exports/answers.json', '--non-interactive', '--port', String(port)])
  return port
}
const confirm = async (base, cookie) => {
  const r = await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual', headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes' }); assert.equal(r.status, 303)
}
try {
  await clone(source); const sourcePort = await setup(source)
  server = await harness({ persistTo: join(source, '.wrangler/state'), port: sourcePort })
  const owner = await server.signIn('owner@example.com')
  await confirm(server.origin, owner)
  const f = await fixture(server, owner), api = f.api
  const gone = await f.join('synthetic-willow-920'), peer = await f.join('synthetic-willow-921')
  const targetBonus = await api('compensation.record', { person: gone.person, kind: 'bonus', effectiveDate: day(-10), amount: '125.25', currency: 'AUD', note: 'synthetic-willow-922' })
  const targetCorrection = await api('compensation.record', { person: gone.person, kind: 'bonus', record: targetBonus.id, revision: targetBonus.revision, effectiveDate: day(-10), amount: '150.50', currency: 'AUD', note: 'synthetic-willow-923' })
  const targetEquity = await api('compensation.record', { person: gone.person, kind: 'equity', effectiveDate: day(-9), units: '12.0625', security: 'synthetic-willow-924', note: 'synthetic-willow-925' })
  await api('compensation.record', { person: peer.person, kind: 'bonus', effectiveDate: day(-8), amount: '300.75', currency: 'AUD', note: 'synthetic-willow-926' })
  await api('compensation.record', { person: peer.person, kind: 'equity', effectiveDate: day(-7), units: '99.123456', security: 'synthetic-willow-927', note: 'synthetic-willow-928' })
  const peerAwards = (await api(`people/${peer.person}`)).compensationRecords
  await api('leaver.start', { period: gone.period, template: f.templates.leaver, endDate: day(-1), reason: 'Left' })
  for (const open of (await api(`people/${gone.person}`)).cases.filter(item => item.status === 'open')) {
    for (const task of (await api(`cases/${open.id}`)).tasks) await api('task.complete', { task: task.id, evidence: 'Done' })
    await api('case.complete', { case: open.id })
  }
  await server.close(); server = null
  await command(source, ['export', '--output', 'exports/before.rer'])

  server = await harness({ persistTo: join(source, '.wrangler/state'), port: sourcePort })
  const sourceOwner = await server.signIn('owner@example.com')
  const sourceApi = (path, body, status) => server.api(path, sourceOwner, body, status)
  await sourceApi('retention.adopt', { version: (await sourceApi('retention')).tableVersion })
  await sourceApi('erasure.request', { person: gone.person, source: 'own_request', receivedOn: day(-1) })
  const preview = await sourceApi(`erasure/preview?person=${gone.person}`)
  assert.deepEqual(preview.blockers, [])
  assert.deepEqual([preview.items.find(row => row.id === 'comp_records').rows, preview.items.find(row => row.id === 'comp_records').class], [3, 'payroll'])
  await sourceApi('erasure.confirm', { person: gone.person, digest: preview.digest })
  assert.ok(!(await sourceApi('people')).some(person => person.id === gone.person))
  await server.close(); server = null
  await command(source, ['export', '--output', 'exports/after.rer'])

  // An archive older than the erasure is refused whole when the later archive is the journal; the person cannot return.
  await clone(target)
  await mkdir(join(target, 'exports'), { recursive: true })
  for (const name of ['before.rer', 'after.rer']) await copyFile(join(source, 'exports', name), join(target, 'exports', name))
  const refused = await command(target, ['import', '--input', 'exports/before.rer', '--journal', 'exports/after.rer', '--yes'], { expectedExit: 4 })
  assert.match(refused, /erasure_epoch|erased_row/, 'the refusal names the erasure fence')

  // The later archive restores into the same destination, and the erased person is not there.
  await command(target, ['import', '--input', 'exports/after.rer', '--yes'])
  const targetPort = await setup(target)
  destination = await harness({ persistTo: join(target, '.wrangler/state'), port: targetPort })
  const restoredOwner = await destination.signIn('owner@example.com')
  await confirm(destination.origin, restoredOwner)
  const people = await destination.api('people', restoredOwner)
  assert.ok(!people.some(person => person.id === gone.person), 'the erased person is not restored')
  assert.ok(people.some(person => person.id === f.staff.employee.person), 'everyone else is')
  const restoredAwards = (await destination.api(`people/${peer.person}`, restoredOwner)).compensationRecords
  assert.deepEqual(restoredAwards, peerAwards, 'Native bonus/equity values, exact units and immutable award identities survive the owner archive')
  const custody = (await destination.api('retained', restoredOwner)).records
  assert.ok(custody.length > 0, 'the retained remainder travels in the owner archive')
  const heldAwards = custody.filter(row => row.store === 'comp_records' && [targetBonus.id, targetEquity.id].includes(row.values?.record_id))
  assert.deepEqual(heldAwards.map(row => row.values.revision).sort(), [targetBonus.revision, targetCorrection.revision, targetEquity.revision].sort(), 'The erased worker’s full native award history restores only into restricted custody')
  assert.ok(heldAwards.every(row => row.class === 'payroll'))
  const restoredHr = await destination.signIn('hr@example.com')
  await destination.api('retained', restoredHr, undefined, 403)
  console.log('DATA-004 restore fence: passed')
} finally {
  if (destination) await destination.close()
  if (server) await server.close()
  await rm(work, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
