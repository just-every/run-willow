// Actual CLI export/import and ordinary email links; no SQL or dev identities.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { command } from './cli.mjs'
import { freePort, harness } from './harness.mjs'
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
async function setup(path) {
  await mkdir(join(path, 'exports'), { recursive: true })
  await writeFile(join(path, 'exports/answers.json'), JSON.stringify({ OWNER_EMAIL: 'owner@example.com' }), { mode: 0o600 })
  // A future fixed port can already be occupied by an earlier HTTP client's
  // ephemeral connection, including TIME_WAIT with no listening process.
  // Ask the OS immediately before setup, rather than claiming both ports early.
  const port = await freePort()
  await command(path, ['setup', '--answers', 'exports/answers.json', '--non-interactive', '--port', String(port)])
  return port
}
async function confirm(base, cookie) {
  const r = await fetch(`${base}/setup`, { method: 'POST', redirect: 'manual', headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' }, body: 'confirm=yes' }); assert.equal(r.status, 303)
}

async function archiveCustomFields(api, owner, person) {
  const common = { classification: 'general', effectiveFrom: day(-80), required: false, employeeRead: true, managerRead: false, retired: false }
  const definitions = [
    { key: 'archive_text', label: 'Recovery note', type: 'text', validation: { minLength: 1, maxLength: 200 } },
    { key: 'archive_number', label: 'Exact recovery amount', type: 'number', validation: { min: '0', max: '10000000000000000' } },
    { key: 'archive_date', label: 'Recovery date', type: 'date', validation: { min: day(-100), max: day(100) } },
    { key: 'archive_boolean', label: 'Recovery acknowledgement', type: 'boolean', validation: {} },
    { key: 'archive_select', label: 'Recovery credential', type: 'select', validation: { options: [{ value: 'paper', label: 'Paper' }, { value: 'badge', label: 'Badge' }] } },
  ].map(definition => ({ ...common, ...definition }))
  const created = []
  for (const definition of definitions) created.push(await api('customField.define', owner, { definition }))
  const values = { archive_text: 'ARCHIVE-ORIGINAL', archive_number: '9007199254740993.125', archive_date: day(-30), archive_boolean: true, archive_select: 'paper' }
  await api('customField.write', owner, { person, effectiveFrom: day(-70), values })
  const corrected = { archive_text: 'ARCHIVE-CORRECTED', archive_number: '9007199254740993.375', archive_date: day(-15), archive_boolean: false, archive_select: 'badge' }
  await api('customField.write', owner, { person, effectiveFrom: day(-70), values: corrected })
  const revised = { ...definitions[4], id: created[4].id, effectiveFrom: day(-60), label: 'Recovery credential format',
    validation: { options: [{ value: 'badge', label: 'Physical badge' }, { value: 'digital', label: 'Digital credential' }] } }
  const revisedSchema = await api('customField.define', owner, { definition: revised })
  await api('customField.write', owner, { person, effectiveFrom: day(-50), values: { archive_select: 'digital' } })
  await api('customField.write', owner, { person, effectiveFrom: day(-40), values: { archive_text: null } })
  const retiredSchema = await api('customField.define', owner, { definition: { ...revised, effectiveFrom: day(-20), retired: true } })
  const snapshots = []
  for (const asOf of [day(-65), day(-35), day(0)]) {
    snapshots.push((await api(`people/${person}?asOf=${asOf}`, owner)).customFields)
  }
  const current = snapshots.at(-1)
  assert.equal(current.fields.length, definitions.length, 'DATA-001: the recovery fixture contains every custom field type')
  for (const [index, definition] of definitions.entries()) {
    const field = current.fields.find(field => field.id === created[index].id)
    assert.equal(field.definition.type, definition.type)
    const original = field.history.find(row => row.value === values[definition.key])
    const correction = field.history.find(row => row.correctsId === original?.id)
    assert.ok(original && correction, 'DATA-001: native same-date correction retains its original revision')
    assert.equal(correction.value, corrected[definition.key])
    assert.equal(correction.definitionVersionId, created[index].versionId)
    assert.equal(correction.effectiveFrom, original.effectiveFrom)
  }
  const selected = current.fields.find(field => field.id === created[4].id)
  assert.equal(selected.value, 'digital')
  assert.equal(selected.definition.retired, true, 'DATA-001: retired definitions retain readable values and history')
  assert.deepEqual(selected.definitions.map(definition => definition.id), [retiredSchema.versionId, revisedSchema.versionId, created[4].versionId])
  assert.equal(selected.history[0].definitionVersionId, revisedSchema.versionId)
  assert.equal(current.fields.find(field => field.id === created[1].id).value, corrected.archive_number, 'DATA-001: exact decimal survives the native value path')
  assert.equal(current.fields.find(field => field.id === created[3].id).value, false)
  assert.equal(current.fields.find(field => field.id === created[0].id).value, null)
  assert.equal(snapshots[0].fields.find(field => field.id === selected.id).value, 'badge')
  assert.equal(snapshots[0].fields.find(field => field.id === selected.id).definition.definitionVersionId, created[4].versionId)
  return snapshots
}

try {
  await clone(source); const sourcePort = await setup(source)
  server = await harness({persistTo:join(source,'.wrangler/state'),port:sourcePort,bindings:modelBindings,provider:provider('source')})
  origin=server.origin
  const owner = await server.signIn('owner@example.com')
  await confirm(origin, owner)
  const api = apiAt(origin)
  const f = await fixture({ api, signIn: (email,options) => server.signIn(email,options) }, owner)
  const { staff: s } = f
  // Native level-bound credentials are environment authority, never portable data.
  const credentialReview = await api('level.preview', owner, { kind: 'level', name: 'synthetic-willow-restore-credential', permissions: [], scope: { kind: 'everyone' } })
  const credentialLevel = await api('level.apply', owner, { review: credentialReview.id })
  const credential = await api('apiKey.issue', owner, { name: 'synthetic-willow-restore-key', level: credentialLevel.id, expiresAt: new Date(Date.now() + 86400000).toISOString() })
  assert.ok(credential.token)
  const credentialRead = await fetch(origin + '/api/willow/people', { headers: { authorization: `Bearer ${credential.token}` } })
  assert.equal(credentialRead.status, 200, 'Source credential works and creates native rate-limit state')
  const customSnapshots = await archiveCustomFields(api, owner, s.employee.person)
  const leave = await api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(3), endDate: day(3), reason: 'RESTORE-CONFIDENTIAL' })
  await api('leave.decide', owner, { request: leave.id, decision: 'approve' })
  await api('access.end', owner, { person: s.ended.person })
  // EEO-001: answers, an HR-recorded category, the compliance grant and the contractor setting travel in the owner archive.
  await api('eeo.grant', owner, { member: s.hr.member, enabled: true })
  await api('eeo.self.write', s.employee.cookie, { hispanic: 'no', races: ['white', 'asian'], sex: 'female' })
  await api('eeo.self.write', s.payroll.cookie, { hispanic: 'declined', sex: 'declined' })
  await api('eeo.record', s.hr.cookie, { person: s.payroll.person, dimension: 'race_ethnicity', category: 'white', employmentRecord: 'synthetic-willow-restore', ruleVersion: 'eeo1-component1-2024' })
  await api('contractor.set', owner, { contractor: true, covered: true })
  const eeoBefore = [await api(`eeo/person/${s.employee.person}`, s.hr.cookie), await api(`eeo/person/${s.payroll.person}`, s.hr.cookie)]
  // DATA-001: restored authority must pause even when provider bindings are available.
  await api('connections.notices', owner, { enabled: true })
  await api('connections.model', owner, { model: 'restore-proof-model' })
  await api('import.settings', owner, { enabled: true, revokedKids: ['restore-revoked-key'] })
  const sourceImportSettings = await api('import-settings', owner)
  assert.equal(sourceImportSettings.enabled, true, 'DATA-001: source Business imports enabled through owner action')
  assert.deepEqual(sourceImportSettings.revokedKids, ['restore-revoked-key'])
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
  assert.ok(!data.includes(Buffer.from(credential.token)), 'Archive bytes never contain the generated bearer token')
  for (const table of ['wl_api_credentials', 'wl_api_credential_limits']) assert.ok(!header.tables.some(item => item.name === table), `${table} is excluded from the archive inventory`)
  assert.ok(!header.tables.some(t => /^oa_/.test(t.name)), 'auth credentials, sessions and tokens excluded')
  const items = records.filter(r => r.kind === 'part').flatMap(r => r.items)
  assert.ok(!items.some(item => ['wl_api_credentials', 'wl_api_credential_limits'].includes(item.table)), 'Credential custody and limits have no archived rows')
  for (const table of ['wl_eeo_answers', 'wl_eeo_recorded', 'wl_contractor_status']) assert.ok(items.some(item => item.table === table), `EEO-001: ${table} is in the owner archive`)
  // ROLE-001: portable authority is the exact union of direct and assigned grants.
  for (const member of members.filter(member => !member.owner)) {
    const assigned = items.filter(item => item.table === 'wl_member_levels' && item.row.member_id === member.id).map(item => item.row.level_id)
    const grants = items.filter(item => item.table === 'wl_permissions' && item.row.member_id === member.id || item.table === 'wl_level_permissions' && assigned.includes(item.row.level_id)).map(item => item.row.permission)
    assert.deepEqual([...new Set(grants)].sort(), [...member.permissions].sort(), 'ROLE-001 archive preserves the exact authority sources, including empty combinations')
  }
  const settings = items.find(item => item.table === 'wl_connections').row
  assert.equal(settings.notices, 0, 'DATA-001: export pauses notice authority')
  assert.equal(settings.oidc, 0, 'DATA-001: export pauses identity authority')
  assert.equal(settings.model, null, 'DATA-001: export pauses model authority')
  const importSettings = items.filter(item => item.table === 'ik_door_settings')
  assert.equal(importSettings.length, 1, 'DATA-001: owner enabled Business imports through the public setting')
  assert.equal(importSettings[0].row.enabled, 0, 'DATA-001: export pauses Business import authority')
  assert.ok(items.some(item => item.table === 'ik_door_revoked_keys' && item.row.kid === 'restore-revoked-key'), 'DATA-001: permanent key revocation is portable')
  server = await harness({persistTo:join(source,'.wrangler/state'),port:sourcePort,bindings:modelBindings,provider:provider('source')})
  const sourceOwner = await server.signIn('owner@example.com')
  const sourceConnections = await api('connections', sourceOwner)
  assert.equal(sourceConnections.notices, true)
  assert.equal(sourceConnections.model.selected, 'restore-proof-model', 'export leaves source authority unchanged')
  assert.deepEqual(await api('import-settings', sourceOwner), sourceImportSettings, 'DATA-001: export leaves source Business authority and revoked keys unchanged')
  for (const snapshot of customSnapshots) assert.deepEqual((await api(`people/${s.employee.person}?asOf=${snapshot.asOf}`, sourceOwner)).customFields, snapshot, 'DATA-001: export leaves source custom metadata, corrections and retirement unchanged')
  await server.close(); server = null
  await clone(target)
  await mkdir(join(target, 'exports'), { recursive: true }); await copyFile(join(source, 'exports/access.rer'), join(target, 'exports/access.rer'))
  const oldArchive = await enabledArchive(records)
  await writeFile(join(target, 'exports/enabled.rer'), oldArchive, { mode: 0o600 })
  const legacyRecords = []
  for await (const record of readArchive(new ReadableStream({ start(c) { c.enqueue(oldArchive); c.close() } }))) legacyRecords.push(record)
  const legacySettings = legacyRecords.filter(r => r.kind === 'part').flatMap(r => r.items).find(item => item.table === 'wl_connections').row
  assert.equal(legacySettings.notices, 1)
  assert.equal(legacySettings.oidc, 1)
  assert.equal(legacySettings.model, 'restore-proof-model', 'DATA-001: authentic legacy fixture carries live authority')
  const legacyImportSettings = legacyRecords.filter(r => r.kind === 'part').flatMap(r => r.items).filter(item => item.table === 'ik_door_settings')
  assert.equal(legacyImportSettings.length, 1)
  assert.equal(legacyImportSettings[0].row.enabled, 1, 'DATA-001: legacy archive carries live Business import authority')
  const imported = await command(target, ['import', '--input', 'exports/enabled.rer', '--yes', '--json'])
  const events = imported.split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  const report = events.find(event => event.event === 'result' && event.ok)
  assert.ok(report, 'DATA-001: public import returns a successful receipt')
  assert.deepEqual(report.safetyChanges?.toSorted((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column)), [
    { table: 'ik_door_settings', column: 'enabled', value: 0, rows: 1 },
    { table: 'wl_connections', column: 'model', value: null, rows: 1 },
    { table: 'wl_connections', column: 'notices', value: 0, rows: 1 },
    { table: 'wl_connections', column: 'oidc', value: 0, rows: 1 },
  ], 'DATA-001: Base reports actual staged changes, with only safe values and aggregate counts')
  assert.deepEqual(report.ownerReauthorizationRequired, ['notices', 'oidc', 'model', 'businessImport'])
  assert.equal(report.archiveHash, legacyRecords.at(-1).archiveHash, 'DATA-001: receipt authenticates original archive bytes')
  assert.equal(report.contentHash, legacyRecords.at(-1).contentHash, 'DATA-001: original content integrity is preserved')
  assert.deepEqual(await readFile(join(target, 'exports/enabled.rer')), oldArchive, 'DATA-001: original backup bytes untouched')
  const targetPort = await setup(target)
  destination = await harness({persistTo:join(target,'.wrangler/state'),port:targetPort,bindings:modelBindings,provider:provider('restored')})
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
  assert.equal((await fetch(restored + '/api/willow/people', { headers: { authorization: `Bearer ${credential.token}` } })).status, 401, 'A source bearer credential cannot authenticate after restore')
  assert.deepEqual(await after('api-credentials', newOwner), [], 'Restored owner credential metadata starts empty')
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
  assert.deepEqual(self.customFields, customSnapshots.at(-1), 'DATA-001: ordinary restored employee reads the complete custom schema and value history')
  for (const snapshot of customSnapshots) {
    const path = `people/${s.employee.person}?asOf=${snapshot.asOf}`
    assert.deepEqual((await after(path, newOwner)).customFields, snapshot, 'DATA-001: archive restores custom metadata and dated values through the owner profile')
    assert.deepEqual((await after(path, cookies.employee)).customFields, snapshot, 'DATA-001: restored employee retains original definitions, corrections, clears and retirement')
  }
  assert.deepEqual([await after(`eeo/person/${s.employee.person}`, cookies.hr), await after(`eeo/person/${s.payroll.person}`, cookies.hr)], eeoBefore, 'EEO-001: restored answers, sources, HR-recorded categories and the compliance grant read exactly as before')
  assert.equal((await after('eeo/self', cookies.employee)).form.contractor, true, 'EEO-001: the contractor setting is restored')
  await after(`eeo/person/${s.employee.person}`, newOwner, undefined, 403)
  for (const who of ['hr', 'payroll', 'employee']) assert.ok(!/asian|white|hispanic|declined|female/i.test(await (await request(restored, '/app/exports/employees.csv?scope=organization&fields=name,workEmail,jobTitle', cookies[who])).text()), 'EEO-001: no employee export carries an EEO value')
  assert.deepEqual(self.private, before.private)
  assert.deepEqual(self.employment, before.employment.map(({ payrollId, ...period }) => ({...period,terms:period.terms.map(({pay,...terms})=>terms)})))
  assert.equal(self.pay,undefined,'A restored self profile still needs its explicit compensation right')
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
  const restoredImportSettings = await after('import-settings', newOwner)
  assert.equal(restoredImportSettings.enabled, false, 'DATA-001: Business import authority stays paused after native sign-in')
  assert.deepEqual(restoredImportSettings.revokedKids, sourceImportSettings.revokedKids, 'DATA-001: restore preserves permanent key revocations')
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
  await after('import.settings', newOwner, { enabled: true })
  assert.deepEqual(await after('import-settings', newOwner), sourceImportSettings, 'DATA-001: owner reauthorizes Business imports without unrevoking a key')
  await after('joiner.start', newOwner, { template: f.templates.joiner, legalName: 'Authorized after restore', workEmail: 'authorized@example.com', startDate: day(1), employmentType: 'full_time', jobTitle: 'Staff', scheduleId: f.schedule })
  assert.ok(restoredNotices > 0)
  const resumed = await after('connections', newOwner)
  assert.equal(resumed.model.selected, 'restore-proof-model')
  for (const notice of noticeHistory) assert.deepEqual(resumed.history.find(row => row.id === notice.id), notice, 'old deliveries never replay')
  console.log('DATA-001 restore pause: PASS; source unchanged, old enabled archive normalized and reported, typed custom metadata/value history and retirement preserved, preserved work/history, no replay, owner reauthorization')
  console.log('restore-access: PASS; ordinary identities, roles, private/pay/document/leave boundaries and HR invitation work')
} finally {
  if (browser) await browser.close()
  if (destination) await destination.close()
  if (server) await server.close()
  await rm(work, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
