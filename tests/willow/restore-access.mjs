// Actual CLI export/import and ordinary email links; no SQL or dev identities.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { command, serving, devKey, signIn } from './cli.mjs'
import { fixture, day } from './regression-fixture.mjs'
import { readArchive } from '@runeditrun/rer/modules/portability'
const work = await mkdtemp(join(tmpdir(), 'willow-restore-access-'))
const source = join(work, 'source'), target = join(work, 'target')
const origin = 'http://127.0.0.1:45931', restored = 'http://127.0.0.1:45932'
let server, destination
const request = (base, path, cookie, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { origin: base, 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
const apiAt = base => async (path, cookie, body, status = 200) => { const r = await request(base, `/api/willow/${path}`, cookie, body); const text = await r.text(); assert.equal(r.status, status, `${path}: ${r.status} ${text.slice(0, 200)}`); return JSON.parse(text) }
async function clone(path) {
  execFileSync('git', ['clone', '--quiet', '--no-local', process.cwd(), path])
  // The root verifies the final committed SHA; this focused proof also runs before commit.
  const changed = new Set([
    ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n'),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'),
  ].filter(Boolean))
  for (const name of changed) { await mkdir(dirname(join(path, name)), { recursive: true }); await copyFile(name, join(path, name)) }
  await command(path, ['install'])
}
async function setup(path, port) {
  await mkdir(join(path, 'exports'), { recursive: true })
  await writeFile(join(path, 'exports/answers.json'), JSON.stringify({ OWNER_EMAIL: 'owner@example.test' }), { mode: 0o600 })
  await command(path, ['setup', '--answers', 'exports/answers.json', '--non-interactive', '--port', String(port)])
}
async function confirm(base, cookie) {
  const r = await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual', headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes' }); assert.equal(r.status, 303)
}
async function outstanding(base, key, email) {
  await request(base, '/auth/magic-link', undefined, { email })
  const listing = await (await fetch(`${base}/__dev/outbox`, { headers: { 'x-rer-dev-key': key } })).text()
  for (const match of listing.matchAll(/href="(\/__dev\/outbox\?message=[^"]+)"/g)) {
    const detail = await (await fetch(base + match[1].replaceAll('&amp;', '&'), { headers: { 'x-rer-dev-key': key } })).text()
    const link = detail.includes(email) && detail.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)
    if (link) return new URL(link[1].replaceAll('&amp;', '&'), base).searchParams.get('token')
  }
  throw Error('No outstanding source token')
}
try {
  await clone(source); await setup(source, 45931)
  server = await serving(source, 'dev', 45931, ['--login'])
  const key = await devKey(source), owner = await signIn(origin, key, 'owner@example.test')
  await confirm(origin, owner)
  const api = apiAt(origin)
  const f = await fixture({ api, signIn: email => signIn(origin, key, email) }, owner)
  const { staff: s } = f
  const leave = await api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(3), endDate: day(3), reason: 'RESTORE-CONFIDENTIAL' })
  await api('leave.decide', owner, { request: leave.id, decision: 'approve' })
  await api('access.end', owner, { person: s.ended.person })
  const members = await api('members', owner)
  const token = await outstanding(origin, key, 'employee@example.test')
  assert.equal((await request(origin, `/auth/confirm?token=${encodeURIComponent(token)}`)).status, 200, 'source token is outstanding and valid')
  const before = await api(`people/${s.employee.person}`, owner)
  await server.stop(); server = null
  await command(source, ['export', '--output', 'exports/access.rer'])
  const data = await readFile(join(source, 'exports/access.rer')), records = []
  for await (const record of readArchive(new ReadableStream({ start(c) { c.enqueue(data); c.close() } }))) records.push(record)
  const header = records[0]
  assert.ok(!header.tables.some(t => /^oa_/.test(t.name)), 'auth credentials, sessions and tokens excluded')
  const items = records.filter(r => r.kind === 'part').flatMap(r => r.items)
  assert.ok(items.some(r => r.table === 'wl_permissions'), 'grants are portable')
  await clone(target)
  await mkdir(join(target, 'exports'), { recursive: true }); await copyFile(join(source, 'exports/access.rer'), join(target, 'exports/access.rer'))
  await command(target, ['import', '--input', 'exports/access.rer', '--yes'])
  await setup(target, 45932)
  destination = await serving(target, 'dev', 45932, ['--login'])
  const newKey = await devKey(target)
  // First restored-member request uses the actual HTML form, before any JSON
  // magic-link request could recreate identities as a side effect.
  const htmlEmployee = await signIn(restored, newKey, 'employee@example.test', { form: true })
  const newOwner = await signIn(restored, newKey, 'owner@example.test')
  await confirm(restored, newOwner)
  const after = apiAt(restored)
  await after('me', s.employee.cookie, undefined, 401)
  assert.notEqual((await request(restored, '/auth/confirm', undefined, { token })).status, 303, 'source token cannot confirm at destination')
  const restoredMembers = await after('members', newOwner)
  for (const member of members) {
    const found = restoredMembers.find(m => m.id === member.id)
    assert.ok(found); assert.equal(found.person, member.person); assert.deepEqual(found.permissions, member.permissions); assert.equal(found.status, member.status)
  }
  const cookies = {}, failures = []
  for (const who of ['employee', 'payroll', 'hr', 'invited']) {
    try { cookies[who] = who === 'employee' ? htmlEmployee : await signIn(restored, newKey, `${who}@example.test`); const me = await after('me', cookies[who]); assert.equal(me.id, s[who].member); console.log(`restored ${who}: email sign-in PASS`) }
    catch (error) { failures.push(who); console.log(`restored ${who}: email sign-in FAIL (${error.message.split('\n')[0]})`) }
  }
  await assert.rejects(signIn(restored, newKey, 'ended@example.test'), /no sign-in message/)
  console.log('restored ended: denied; source cookie/token: denied; IDs/grants: preserved')
  assert.deepEqual(failures, [], 'every active restored member can sign in')
  for (const [who, expected] of [['employee', 'member'], ['payroll', 'member'], ['hr', 'admin'], ['invited', 'member']]) {
    const session = await (await request(restored, '/auth/session', cookies[who])).json()
    assert.equal(session.operator.role, expected)
  }
  const allMembers = await after('members', newOwner)
  assert.equal(allMembers.find(m => m.id === s.hr.member).signIn, 'active')
  const self = await after(`people/${s.employee.person}`, cookies.employee)
  assert.deepEqual(self.private, before.private)
  assert.deepEqual(self.employment, before.employment.map(({ payrollId, ...period }) => period))
  assert.deepEqual(self.leave.accounts[0].ledger, before.leave.accounts[0].ledger)
  assert.ok(!('private' in await after(`people/${s.employee.person}`, cookies.payroll)))
  assert.ok((await after(`people/${s.employee.person}`, cookies.payroll)).pay)
  assert.ok(!(await after(`people/${s.employee.person}`, cookies.hr)).pay)
  const employeeDoc = self.documents[0].versions[0].id
  const file = `/app/files/document/${employeeDoc}`
  assert.equal(await (await request(restored, file, cookies.employee)).text(), 'RESTORED-CONTRACT')
  assert.equal((await request(restored, file, cookies.payroll)).status, 404)
  assert.equal((await after(`leave/${leave.id}`, cookies.hr)).reason, 'RESTORE-CONFIDENTIAL')
  await after(`leave/${leave.id}`, cookies.payroll, undefined, 404)
  // HR's restored admin auth role can invite and end access through real auth.
  const newcomer = await after('joiner.start', cookies.hr, { template: f.templates.joiner, legalName: 'After restore', workEmail: 'new@example.test', startDate: day(0), employmentType: 'full_time', jobTitle: 'Staff', scheduleId: f.schedule })
  await after('access.give', cookies.hr, { person: newcomer.person })
  await after('access.end', cookies.hr, { person: newcomer.person })
  console.log('restore-access: PASS; ordinary identities, roles, private/pay/document/leave boundaries and HR invitation work')
} finally {
  if (destination) await destination.stop()
  if (server) await server.stop()
  await rm(work, { recursive: true, force: true })
}
