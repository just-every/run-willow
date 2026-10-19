// Actual CLI export/import and ordinary email links; no SQL or dev identities.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { command } from './cli.mjs'
import { harness } from './harness.mjs'
import { fixture, day } from './regression-fixture.mjs'
import { readArchive } from '@runeditrun/rer/modules/portability'
import { enabledArchive } from './restore-archive-fixture.mjs'
import { pathToFileURL } from 'node:url'
const work = await mkdtemp(join(tmpdir(), 'willow-restore-access-'))
const source = join(work, 'source'), target = join(work, 'target')
let origin, restored
let server, destination, browser
const modelBindings = { MODELS_ENDPOINT: 'https://models.example.test/v1/chat/completions', MODELS_KEY: 'restore-test-provider-key' }
let sourceNotices = 0, restoredNotices = 0, modelCalls = 0
const provider = side => async request => {
  if (new URL(request.url).hostname === 'api.sendgrid.com') {
    const body = await request.json()
    if (body.subject === 'Willow: an update is ready') { if (side === 'source') sourceNotices++; else restoredNotices++ }
    return new Response(null, { status: 202 })
  }
  modelCalls++
  throw new Error('No model call is authorized during restore')
}
const request = (base, path, cookie, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { origin: base, 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
const apiAt = base => async (path, cookie, body, status = 200) => { const r = await request(base, `/api/willow/${path}`, cookie, body); const text = await r.text(); assert.equal(r.status, status, `${path}: ${r.status} ${text.slice(0, 200)}`); return JSON.parse(text) }
async function clone(path) {
  execFileSync('git', ['clone', '--quiet', process.cwd(), path])
  // The root verifies the final committed SHA; this focused proof also runs before commit.
  const changed = new Set([
    ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n'),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'),
  ].filter(Boolean))
  for (const name of changed) {
    try { await mkdir(dirname(join(path, name)), { recursive: true }); await copyFile(name, join(path, name)) }
    catch (error) { if (error.code !== 'ENOENT') throw error; await rm(join(path,name),{force:true}) }
  }
  await command(path, ['install'])
}
async function setup(path, port) {
  await mkdir(join(path, 'exports'), { recursive: true })
  await writeFile(join(path, 'exports/answers.json'), JSON.stringify({ OWNER_EMAIL: 'owner@example.com' }), { mode: 0o600 })
  await command(path, ['setup', '--answers', 'exports/answers.json', '--non-interactive', '--port', String(port)])
}
async function confirm(base, cookie) {
  const r = await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual', headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes' }); assert.equal(r.status, 303)
}

try {
  await clone(source); await setup(source, 45931)
  server = await harness({persistTo:join(source,'.wrangler/state'),port:45931,bindings:modelBindings,provider:provider('source')})
  origin=server.origin
  const owner = await server.signIn('owner@example.com')
  await confirm(origin, owner)
  const api = apiAt(origin)
  const f = await fixture({ api, signIn: (email,options) => server.signIn(email,options) }, owner)
  const { staff: s } = f
  const leave = await api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(3), endDate: day(3), reason: 'RESTORE-CONFIDENTIAL' })
  await api('leave.decide', owner, { request: leave.id, decision: 'approve' })
  await api('access.end', owner, { person: s.ended.person })
  // DATA-001: restored authority must pause even when provider bindings are available.
  await api('connections.notices', owner, { enabled: true })
  await api('connections.model', owner, { model: 'restore-proof-model' })
  const pending = await f.join('restorequeue', { startDate: day(10) })
  const pendingCase = await api(`cases/${pending.case}`, owner)
  const payroll = await api('payroll.draft', owner, { periodStart: day(-120), periodEnd: day(20) })
  const noticeHistory = (await api('connections', owner)).history
  assert.ok(sourceNotices > 0)
  const members = await api('members', owner)
  const token = await server.outstanding('employee@example.com')
  assert.equal((await request(origin, `/auth/confirm?token=${encodeURIComponent(token)}`)).status, 200, 'source token is outstanding and valid')
  const before = await api(`people/${s.employee.person}`, owner)
  await server.close(); server = null
  await command(source, ['export', '--output', 'exports/access.rer'])
  const data = await readFile(join(source, 'exports/access.rer')), records = []
  for await (const record of readArchive(new ReadableStream({ start(c) { c.enqueue(data); c.close() } }))) records.push(record)
  const header = records[0]
  assert.ok(!header.tables.some(t => /^oa_/.test(t.name)), 'auth credentials, sessions and tokens excluded')
  const items = records.filter(r => r.kind === 'part').flatMap(r => r.items)
  assert.ok(items.some(r => r.table === 'wl_permissions'), 'grants are portable')
  const settings = items.find(item => item.table === 'wl_connections').row
  assert.equal(settings.notices, 0); assert.equal(settings.oidc, 0); assert.equal(settings.model, null)
  server = await harness({persistTo:join(source,'.wrangler/state'),port:45931,bindings:modelBindings,provider:provider('source')})
  const sourceOwner = await server.signIn('owner@example.com')
  const sourceConnections = await api('connections', sourceOwner)
  assert.equal(sourceConnections.notices, true)
  assert.equal(sourceConnections.model.selected, 'restore-proof-model', 'export leaves source authority unchanged')
  await server.close(); server = null
  await clone(target)
  await mkdir(join(target, 'exports'), { recursive: true }); await copyFile(join(source, 'exports/access.rer'), join(target, 'exports/access.rer'))
  const oldArchive = await enabledArchive(records)
  await writeFile(join(target, 'exports/enabled.rer'), oldArchive, { mode: 0o600 })
  const imported = await command(target, ['import', '--input', 'exports/enabled.rer', '--yes', '--json'])
  const events = imported.split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  const report = events.find(event => event.event === 'result' && event.ok && event.connectionNormalization)?.connectionNormalization
  assert.ok(report, 'the public import report records connection normalization')
  assert.equal(report.normalized, true)
  assert.deepEqual(report.disabled, ['notices', 'oidc', 'model'])
  assert.deepEqual(report.ownerReauthorizationRequired, ['notices', 'oidc', 'model'])
  assert.equal(report.importedArchiveHash, records.at(-1).archiveHash, 'only connection consent changed')
  assert.notEqual(report.sourceArchiveHash, report.importedArchiveHash)
  assert.equal(await readFile(join(target, 'exports/enabled.rer'), 'utf8'), oldArchive, 'original backup untouched')
  await setup(target, 45932)
  destination = await harness({persistTo:join(target,'.wrangler/state'),port:45932,bindings:modelBindings,provider:provider('restored')})
  restored=destination.origin
  // First restored-member request uses the actual HTML form, before any JSON
  // magic-link request could recreate identities as a side effect.
  const formPage=await destination.raw('/signin')
  assert.match(await formPage.text(),/action="\/auth\/magic-link"/)
  await destination.raw('/auth/magic-link',{form:new URLSearchParams({email:'employee@example.com',returnTo:'/app'})})
  const htmlEmployee = await destination.signIn('employee@example.com',{requested:true})
  const newOwner = await destination.signIn('owner@example.com')
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
    try { cookies[who] = who === 'employee' ? htmlEmployee : await destination.signIn(`${who}@example.com`); const me = await after('me', cookies[who]); assert.equal(me.id, s[who].member); console.log(`restored ${who}: email sign-in PASS`) }
    catch (error) { failures.push(who); console.log(`restored ${who}: email sign-in FAIL (${error.message.split('\n')[0]})`) }
  }
  await assert.rejects(destination.signIn('ended@example.com'), /no sign-in message/)
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
  const paused = await after('connections', newOwner)
  assert.equal(paused.notices, false)
  assert.equal(paused.identity.enabled, false)
  assert.equal(paused.model.configured, true)
  assert.equal(paused.model.selected, null)
  assert.equal((await after('model.draft', newOwner, { template: f.templates.joiner }, 409)).error, 'model_not_configured')
  assert.equal(modelCalls, 0)
  assert.deepEqual((await after(`cases/${pending.case}`, newOwner)).tasks, pendingCase.tasks)
  assert.equal((await after(`payroll/${payroll.id}`, newOwner)).status, 'draft')
  for (const notice of noticeHistory) assert.deepEqual(paused.history.find(row => row.id === notice.id), notice)
  if (process.env.WILLOW_RESTORE_BROWSER === '1') {
    const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(newOwner.split('; ').map(value => ({ name: value.slice(0, value.indexOf('=')), value: value.slice(value.indexOf('=') + 1), url: restored })))
    const page = await context.newPage()
    assert.ok(process.env.WILLOW_EVIDENCE_DIR)
    await mkdir(process.env.WILLOW_EVIDENCE_DIR, { recursive: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(restored + '/app/connections')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: `${process.env.WILLOW_EVIDENCE_DIR}/DATA-001-restored-connections-${width}.png`, fullPage: true })
    }
    await context.close(); await browser.close(); browser = null
  }
  // HR's restored admin auth role can invite and end access through real auth.
  const newcomer = await after('joiner.start', cookies.hr, { template: f.templates.joiner, legalName: 'After restore', workEmail: 'new@example.com', startDate: day(0), employmentType: 'full_time', jobTitle: 'Staff', scheduleId: f.schedule })
  await after('access.give', cookies.hr, { person: newcomer.person })
  await after('access.end', cookies.hr, { person: newcomer.person })
  assert.equal(restoredNotices, 0, 'business work stays quiet until owner reauthorization')
  assert.equal((await after('connections', newOwner)).history.length, noticeHistory.length)
  await after('connections.notices', newOwner, { enabled: true })
  await after('connections.model', newOwner, { model: 'restore-proof-model' })
  await after('joiner.start', newOwner, { template: f.templates.joiner, legalName: 'Authorized after restore', workEmail: 'authorized@example.com', startDate: day(1), employmentType: 'full_time', jobTitle: 'Staff', scheduleId: f.schedule })
  assert.ok(restoredNotices > 0)
  const resumed = await after('connections', newOwner)
  assert.equal(resumed.model.selected, 'restore-proof-model')
  for (const notice of noticeHistory) assert.deepEqual(resumed.history.find(row => row.id === notice.id), notice, 'old deliveries never replay')
  console.log('DATA-001 restore pause: PASS; source unchanged, old enabled archive normalized and reported, preserved work/history, no replay, owner reauthorization')
  console.log('restore-access: PASS; ordinary identities, roles, private/pay/document/leave boundaries and HR invitation work')
} finally {
  if (browser) await browser.close()
  if (destination) await destination.close()
  if (server) await server.close()
  await rm(work, { recursive: true, force: true })
}
