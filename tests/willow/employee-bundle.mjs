// DATA-001's current-edition history/document slice through real download doors.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { file, harness } from './harness.mjs'
import { fixture, day } from './regression-fixture.mjs'
import { readZip } from './export-reader.mjs'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const h = await harness()
try {
  await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const { api, staff: s, document } = await fixture(h, owner)
  const v2 = await api('document.add', { document: document.id, file: file('contract-revised.txt', 'REVISED-CONTRACT') })
  await h.api('document.acknowledge', s.employee.cookie, { version: v2.version }, 409)
  const sharedCategory = await api('category.create', { name: 'Manager notes', managerReads: true, subjectReads: true, acknowledgement: true })
  const shared = await api('document.add', { person: s.employee.person, category: sharedCategory.id, title: 'Check-in', file: file('check-in.txt', 'MANAGER-READABLE') })
  await h.api('document.acknowledge', s.employee.cookie, { version: shared.version })
  const privateCategory = await api('category.create', { name: 'Restricted medical' })
  const privateDoc = await api('document.add', { person: s.employee.person, category: privateCategory.id, title: 'HR ONLY', file: file('private.txt', 'CONFIDENTIAL-DOCUMENT') })
  const request = await h.api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(-3), endDate: day(-3), reason: 'CONFIDENTIAL-LEAVE' })
  await api('leave.decide', { request: request.id, decision: 'approve' })
  const caseView = await api(`cases/${s.employee.case}`)
  await api('task.complete', { task: caseView.tasks[0].id })
  const cancelled = await api('mover.schedule', { period: s.employee.period, effectiveFrom: day(-20), jobTitle: 'Withdrawn title', reason: 'Withdrawn reorganization' })
  await api('terms.cancel', { terms: cancelled.terms })
  await api('mover.schedule', { period: s.employee.period, effectiveFrom: day(20), jobTitle: 'Scheduled lead', reason: 'Planned promotion' })

  async function bundle(cookie, scope, extra = {}, status = 200) {
    const params = new URLSearchParams({ scope, fields: 'name,phone,payAmount', history: 'employment,leave,lifecycle,documents', person: s.employee.person, ...extra })
    const response = await h.raw(`/app/exports/employees.zip?${params}`, { cookie })
    assert.equal(response.status, status)
    if (status !== 200) return
    assert.match(response.headers.get('content-type'), /application\/zip/)
    assert.match(response.headers.get('cache-control'), /no-store/)
    const bytes = Buffer.from(await response.arrayBuffer()), files = readZip(bytes)
    const manifest = JSON.parse(files.get('manifest.json'))
    for (const item of manifest.files) {
      assert.ok(files.has(item.path))
      assert.equal(files.get(item.path).length, item.size)
      assert.equal(sha(files.get(item.path)), item.sha256)
    }
    assert.equal(files.size, manifest.files.length + 1)
    assert.equal(manifest.people, 1)
    return { bytes, files, manifest, record: JSON.parse(files.get('records.json')).records[0] }
  }
  const manager = await bundle(s.managera.cookie, 'team')
  assert.deepEqual(manager.record.documents.map(row => row.id), [shared.id])
  assert.equal(manager.files.get(manager.record.documents[0].versions[0].path).toString(), 'MANAGER-READABLE')
  assert.ok(manager.record.documents[0].versions[0].acknowledgedAt)
  assert.ok(!manager.bytes.includes(Buffer.from('CONFIDENTIAL-DOCUMENT')))
  assert.ok(!manager.bytes.includes(Buffer.from('CONFIDENTIAL-LEAVE')))
  assert.ok(!manager.bytes.includes(Buffer.from('PRIVATE-employee')))
  assert.ok(!manager.bytes.includes(Buffer.from('81234.56')))
  assert.ok(manager.record.employment[0].terms.some(term => term.id === cancelled.terms && term.status === 'cancelled'))
  assert.equal(manager.record.lifecycle.find(row => row.id === s.employee.case).tasks[0].status, 'completed')
  assert.equal(manager.record.leave.requests.find(row => row.id === request.id).status, 'approved')
  const hr = await bundle(s.hr.cookie, 'organization')
  assert.equal(hr.record.documents.length, 3)
  assert.ok(hr.bytes.includes(Buffer.from('CONFIDENTIAL-DOCUMENT')))
  assert.ok(hr.bytes.includes(Buffer.from('CONFIDENTIAL-LEAVE')))
  assert.ok(!hr.bytes.includes(Buffer.from('81234.56')))
  const employee = await bundle(s.employee.cookie, 'self')
  assert.equal(employee.record.documents.find(row => row.id === document.id).versions.length, 2)
  assert.ok(employee.bytes.includes(Buffer.from('REVISED-CONTRACT')))
  assert.ok(employee.bytes.includes(Buffer.from('81234.56')))
  assert.ok(!employee.bytes.includes(Buffer.from('CONFIDENTIAL-DOCUMENT')))
  const historic = await bundle(owner, 'organization', { asOf: day(-2) })
  assert.equal(historic.record.documents.length, 0)
  assert.equal(historic.record.lifecycle.length, 0)
  assert.equal(historic.record.leave.accounts[0].ledger.filter(row => row.kind === 'use').length, 1)
  assert.equal(historic.manifest.files.filter(row => row.versionId).length, 0)
  const omitted = await bundle(owner, 'organization', { history: 'employment' })
  assert.ok(!Object.hasOwn(omitted.record, 'documents') && !Object.hasOwn(omitted.record, 'leave'))
  await bundle(owner, 'organization', { history: '__proto__' }, 400)
  await bundle(owner, 'organization', { history: 'leave,leave' }, 400)
  await bundle(s.managera.cookie, 'team', { person: s.hr.person }, 403)
  await api('member.permissions', { member: s.hr.member, permissions: ['people.manage'] })
  const restricted = await bundle(s.hr.cookie, 'organization')
  assert.deepEqual(restricted.record.withheldSections, ['leave', 'documents'])
  assert.ok(!restricted.bytes.includes(Buffer.from('CONFIDENTIAL-DOCUMENT')))
  const audit = await api('audit')
  assert.ok(audit.some(event => event.action === 'employee.bundle.export' && event.actor === s.managera.member))
  assert.ok(audit.some(event => event.action === 'document.download' && event.subject === privateDoc.version && event.actor === s.hr.member))
  if (process.env.WILLOW_EVIDENCE_DIR) {
    await mkdir(process.env.WILLOW_EVIDENCE_DIR, { recursive: true })
    await writeFile(`${process.env.WILLOW_EVIDENCE_DIR}/DATA-001-records.zip`, hr.bytes)
  }
  console.log('DATA-001 scoped, dated histories and checksummed document bundle passed (complete target portability remains partial)')
} finally { await h.close() }
