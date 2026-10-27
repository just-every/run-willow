import { signingCustodyProof } from './sign-custody.mjs'
import { signatureCohortProof } from './sign-cohorts.mjs'
import { signatureReportingProof } from './sign-reporting.mjs'
import { nativeSigningProof } from './sign-native.mjs'
import { signatureTemplateProof } from './sign-templates.mjs'
import { browserEvidence } from './company-home-browser.mjs'
// SELF-002: one public-door proof of current targeted delivery and voluntary celebrations.
import assert from 'node:assert/strict'
import { harness, file } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'
import { imports } from './import-transport.mjs'
import { HEADERS } from './fixtures.mjs'
const h = await harness({scheduled:true})
try {
  await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const { api, staff: s, join, schedule } = await fixture(h, owner,{names:{employee:'Maya Chen',hr:'Riley Morgan',managera:'Jordan Lee',managerb:'Sam Rivera',payroll:'Alex Patel'}})
  await signatureTemplateProof(h,owner,s)
  const nativeRecipients=await nativeSigningProof(h,owner,s,join)
  await signingCustodyProof(h,owner,s)
  await signatureReportingProof(h,owner,s)
  await signatureCohortProof(h,owner,s,join,nativeRecipients)
  const employee = s.employee.cookie, outsider = s.managerb.cookie, hr = s.hr.cookie
  const as = (cookie, path, body, status = 200) => h.api(path, cookie, body, status)
  const home = cookie => as(cookie, 'company')
  const everyone = { kind: 'everyone', id: null }
  const locationA = await api('location.create', { name: 'North', timezone: 'UTC' })
  const locationB = await api('location.create', { name: 'South', timezone: 'UTC' })
  const departmentA = await api('department.create', { name: 'Service' })
  const departmentB = await api('department.create', { name: 'Design' })
  const loc = { kind: 'location', id: locationA.id }, dep = { kind: 'department', id: departmentA.id }
  await api('mover.schedule', { period: s.employee.period, effectiveFrom: day(-1), locationId: locationA.id, departmentId: departmentA.id, reason: 'Current team' })
  const publish = extra => as(hr, 'company.announce', { title: 'Company update', body: 'TARGETED-COMPANY-UPDATE', startsOn: today, audience: everyone, ...extra })
  const all = await publish({ pinned: true, ackRequired: true, endsOn: today })
  const local = await publish({ audience: loc, body: 'NORTH-ONLY' })
  const departmental = await publish({ audience: dep, body: 'SERVICE-ONLY' })
  const future = await publish({ startsOn: day(1), body: 'FUTURE-NOT-YET' })
  const expired = await publish({ startsOn: day(-2), endsOn: day(-1), body: 'EXPIRED-COMPANY' })
  let visible = await home(employee), outside = await home(outsider)
  assert.ok(visible.announcements.some(a => a.id === local.id) && visible.announcements.some(a => a.id === departmental.id), 'SELF-002 location and department audiences use current employment')
  assert.equal(visible.announcements[0].id, all.id, 'SELF-002 pinned current announcements lead the home')
  assert.ok(visible.announcements.some(a => a.id === all.id), 'SELF-002 both inclusive schedule boundaries deliver today')
  assert.ok(!visible.announcements.some(a => [future.id, expired.id].includes(a.id)), 'SELF-002 future and ended announcements stay out')
  assert.ok(!outside.announcements.some(a => [local.id, departmental.id].includes(a.id)), 'SELF-002 outside employee gets no targeted content')
  assert.ok((await home(owner)).announcements.some(a => a.id === all.id) && !(await home(owner)).announcements.some(a => a.id === local.id), 'SELF-002 unlinked author receives everyone only')
  await as(employee, 'company.announce', { title: 'Unauthorized' }, 403)
  await as(employee, 'company.folder', { name: 'Unauthorized' }, 403)
  await as(employee, 'company.file', {}, 403)
  await as(employee, 'company-admin', undefined, 403)
  assert.ok((await as(employee,'work')).items.some(w=>w.source===`company-ack:${all.versionId}:${s.employee.member}`&&w.owner===s.employee.member),'SELF-002 required acknowledgment is owned FLOW-002 work')
  await as(employee, 'company.acknowledge', { version: all.versionId })
  assert.ok(!(await as(employee,'work')).items.some(w=>w.source===`company-ack:${all.versionId}:${s.employee.member}`),'SELF-002 acknowledgment stops its pending work')
  assert.ok((await home(employee)).announcements.find(a => a.id === all.id).acknowledgedAt, 'SELF-002 receipt attaches to the actual read version')
  const revision = await publish({ id: all.id, body: 'REVISED-COMPANY-UPDATE', ackRequired: true })
  await as(employee, 'company.acknowledge', { version: all.versionId }, 409)
  assert.equal((await home(employee)).announcements.find(a => a.id === all.id).acknowledgedAt, null, 'SELF-002 revised announcement requires a new receipt')
  await as(employee, 'company.acknowledge', { version: revision.versionId })
  await as(outsider, 'company.acknowledge', { version: local.versionId }, 404)
  await publish({ id: all.id, retired: true, ackRequired: true })
  assert.ok(!(await home(employee)).announcements.some(a => a.id === all.id), 'SELF-002 withdrawal removes the publication immediately')
  await as(employee, 'company.acknowledge', { version: revision.versionId }, 404)
  const folder = await as(hr, 'company.folder', { name: 'North handbook', audience: loc })
  const v1 = await as(hr, 'company.file', { folder: folder.id, title: 'Guide', file: file('guide.txt', 'NORTH-SHARED-V1') })
  const v2 = await as(hr, 'company.file', { id: v1.id, folder: folder.id, title: 'Guide', file: file('guide.txt', 'NORTH-SHARED-V2') })
  const download = async (cookie, version, expected, content) => {
    const response = await h.raw(`/app/company/files/${version}?download=1`, { cookie })
    assert.equal(response.status, expected, 'SELF-002 shared file delivery rechecks current audience')
    if (content) assert.equal(await response.text(), content, 'SELF-002 immutable file bytes remain associated with their version')
  }
  await download(employee, v1.versionId, 200, 'NORTH-SHARED-V1')
  await download(employee, v2.versionId, 200, 'NORTH-SHARED-V2')
  await download(outsider, v1.versionId, 404)
  const shared = (await home(employee)).folders.find(f => f.id === folder.id)
  assert.equal(shared.files[0].versions.length, 2, 'SELF-002 folder exposes its file history to its current audience')
  await as(hr, 'company.folder', { id: folder.id, name: 'Design handbook', audience: { kind: 'department', id: departmentB.id } })
  await download(employee, v1.versionId, 404)
  await download(employee, v2.versionId, 404)
  assert.ok(!(await home(employee)).folders.some(f => f.id === folder.id), 'SELF-002 folder audience revision revokes metadata and old links')
  // A scheduled membership change cannot deliver tomorrow's content today.
  const design = await publish({ audience: { kind: 'department', id: departmentB.id }, body: 'DESIGN-ONLY' })
  await api('mover.schedule', { period: s.employee.period, effectiveFrom: day(1), departmentId: departmentB.id, locationId: locationB.id, reason: 'Tomorrow team' })
  assert.ok(!(await home(employee)).announcements.some(a => a.id === design.id), 'SELF-002 future terms never grant present delivery')
  await download(employee, v1.versionId, 404)
  await api('mover.schedule', { period: s.employee.period, effectiveFrom: today, departmentId: departmentB.id, locationId: locationB.id, reason: 'Current transfer' })
  visible = await home(employee)
  assert.ok(visible.announcements.some(a => a.id === design.id) && !visible.announcements.some(a => a.id === departmental.id), 'SELF-002 effective transfer immediately changes targeted delivery')
  await download(employee, v1.versionId, 200, 'NORTH-SHARED-V1')
  await as(hr, 'company.folder', { id: folder.id, name: 'Withdrawn handbook', audience: everyone, retired: true })
  await download(employee, v1.versionId, 404)
  await download(employee, v2.versionId, 404)
  const admin = await as(hr, 'company-admin')
  assert.ok(admin.announcements.some(a => a.id === future.id) && admin.announcements.find(a => a.id === all.id).history.length > 1, 'SELF-002 separate author view retains scheduled and retired publication histories')
  assert.ok(admin.acknowledgements.some(a => a.versionId === revision.versionId), 'SELF-002 author can review version receipts')
  const hire = await join('company-new-hire', { startDate: day(-4) })
  const absence = await as(hr, 'leave.request', { account: s.employee.account, startDate: day(4), endDate: day(5), reason: 'PRIVATE-COMPANY-ABSENCE' })
  await api('leave.decide', { request: absence.id, decision: 'approve' })
  const managerHome = await home(s.managera.cookie)
  assert.ok(managerHome.newHires.some(p => p.person === hire.person && p.startsOn === day(-4)), 'SELF-002 new hire dates use the existing directory projection')
  assert.ok(managerHome.leave.some(l => l.person === s.employee.person && l.startDate === day(4)), 'SELF-002 manager sees permitted team leave dates')
  assert.ok(!(await home(outsider)).leave.some(l => l.person === s.employee.person), 'SELF-002 company home adds no access to another team leave')
  assert.ok(!JSON.stringify(managerHome).includes('PRIVATE-COMPANY-ABSENCE'), 'SELF-002 team calendar never includes confidential absence reasons')
  // Public Base import supplies native dated targets, with no private test database writes.
  const csv = records => [HEADERS, ...records.map(record => HEADERS.map(key => record[key] ?? ''))].map(row => row.join(',')).join('\r\n')
  const importer = imports(h, owner)
  const plan = await importer.plan({ schedule, employees: file('employees.csv', csv([
    { id: 'company-current', firstName: 'Current', lastName: 'Import', workEmail: 'company-current@example.com', hireDate: day(-10), status: 'Active', employmentStatus: 'Full-Time', jobTitle: 'Design associate', department: 'Design', location: 'South' },
    { id: 'company-future', firstName: 'Future', lastName: 'Import', workEmail: 'company-future@example.com', hireDate: day(10), status: 'Active', employmentStatus: 'Full-Time', jobTitle: 'Design associate', department: 'Design', location: 'South' },
  ])) })
  await importer.apply(plan)
  for (const [email, expected] of [['company-current@example.com', true], ['company-future@example.com', false]]) {
    const directory = await api('people'), person = directory.find(p => p.workEmail === email)
    assert.ok(person, 'SELF-002 imported target exists through public directory')
    assert.equal((await api(`people/${person.id}`)).status,expected?'active':'upcoming','SELF-002 representative import retains its actual employment status')
    await api('access.give', { person: person.id })
    const cookie = await h.signIn(email, { requested: true })
    assert.equal((await home(cookie)).announcements.some(a => a.id === design.id), expected, 'SELF-002 imported future employment never grants current department membership')
  }
  // Birthday date remains canonical private data; consent records contain booleans only.
  const anniversaryStart = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`
  const celebrant = await join('celebrant', { startDate: anniversaryStart })
  await api('access.give', { person: celebrant.person })
  const celebrantCookie = await h.signIn('celebrant@example.com', { requested: true })
  await as(celebrantCookie, 'company.celebrations', { birthday: true }, 400)
  let self = await as(celebrantCookie, `people/${celebrant.person}`)
  const privateDob = `1991${today.slice(4)}`
  await as(celebrantCookie, 'person.update', { person: celebrant.person, revision: self.revision, private: true, date_of_birth: privateDob })
  assert.ok(!(await home(outsider)).celebrations.some(c => c.person === celebrant.person), 'SELF-002 celebrations default to private')
  await as(hr, 'company.celebrations', { person: celebrant.person, birthday: true }, 400)
  await as(celebrantCookie, 'company.celebrations', { birthday: true, anniversary: false })
  let celebrations = (await home(outsider)).celebrations.filter(c => c.person === celebrant.person)
  assert.deepEqual(celebrations.map(c => c.kind), ['birthday'], 'SELF-002 birthday consent is independent from anniversary consent')
  assert.ok(celebrations.every(c => Object.keys(c).every(k => ['person', 'name', 'kind', 'month', 'day'].includes(k))), 'SELF-002 celebration projections contain only directory identity and month/day')
  assert.ok(!JSON.stringify(await home(outsider)).includes(privateDob), 'SELF-002 no birthday year leaves company home')
  await as(celebrantCookie, 'company.celebrations', { birthday: false, anniversary: true })
  celebrations = (await home(outsider)).celebrations.filter(c => c.person === celebrant.person)
  assert.deepEqual(celebrations.map(c => c.kind), ['anniversary'], 'SELF-002 withdrawing birthday is immediate and retains independent anniversary opt-in')
  await h.submit('company.celebrations', celebrantCookie, {}, '/app')
  assert.ok(!(await home(outsider)).celebrations.some(c => c.person === celebrant.person), 'SELF-002 form withdrawal removes every opted-out celebration immediately')
  for (const path of ['company', 'people', `people/${celebrant.person}`, `context/${celebrant.person}`]) {
    const value = await as(outsider, path)
    assert.ok(!JSON.stringify(value).includes(privateDob), 'SELF-002 ordinary doors never reveal the canonical private birthday')
  }
  assert.equal((await as(celebrantCookie, `people/${celebrant.person}`)).private.date_of_birth, privateDob, 'SELF-002 withdrawal preserves canonical private DOB for the subject')
  await browserEvidence(h,owner,s)
  console.log('SELF-002 current company delivery, immutable files, receipts and self-owned consent: PASS')
} finally { await h.close() }
