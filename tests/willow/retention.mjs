// DATA-002 retention census on the production Worker: owner-only adoption, work-state rules, class
// mappings and holds; HR/owner erasure requests; the read-only, digest-bound preview of every store.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harness, file } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'
import { balancesCsv, documentsZip, employeesCsv } from './fixtures.mjs'
import { imports } from './import-transport.mjs'
import { rowCounts } from './retention-counts.mjs'
import { browserEvidence } from './retention-browser.mjs'

const directory = await mkdtemp(join(tmpdir(), 'willow-retention-'))
const h = await harness({ persistTo: directory })
const years = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10) }
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const f = await fixture(h, owner), s = f.staff, api = f.api
  const as = (who, path, body, status) => h.api(path, s[who].cookie, body, status)
  const get = (who, path, status = 200) => h.api(path, who === 'owner' ? owner : s[who].cookie, undefined, status)
  const preview = (who, person, status) => get(who, `erasure/preview?person=${person}`, status)

  // Authority: the owner reads everything, HR only the request list, nobody else anything.
  assert.deepEqual(Object.keys(await get('owner', 'retention')).includes('classes'), true)
  assert.deepEqual(Object.keys(await get('hr', 'retention')), ['requests'])
  for (const who of ['managera', 'employee', 'payroll']) assert.equal((await get(who, 'retention', 403)).error, 'forbidden')
  assert.equal((await h.raw('/app/retention', { cookie: s.managera.cookie })).status, 403)
  await api('access.end', { person: s.ended.person })
  assert.equal((await h.raw('/api/willow/retention', { cookie: s.ended.cookie })).status, 401)

  // A populated former worker: native records of every shape, a work state and a recorded departure.
  const quinn = await f.join('quinn'), q = quinn.person
  await api('access.give', { person: q })
  const quinnCookie = await h.signIn('quinn@example.com', { requested: true })
  await h.api('eeo.self.write', quinnCookie, { raceEthnicity: 'asian', sex: 'female' })
  const offers = (await api('category.create', { name: 'Offer letters' })).id, forms = (await api('category.create', { name: 'Payroll forms' })).id
  const text = value => ({ filename: 'a.txt', base64: Buffer.from(value).toString('base64') })
  await api('document.add', { person: q, category: offers, title: 'Offer', file: text('synthetic-willow-1') })
  await api('document.add', { person: q, category: forms, title: 'Withholding form', file: text('synthetic-willow-2') })
  const badge = await as('hr', 'customField.define', { definition: { key: 'badge', classification: 'hr', type: 'text', validation: { maxLength: 40 }, effectiveFrom: day(-60), label: 'Badge', required: false, employeeRead: false, managerRead: false, retired: false } })
  await as('hr', 'customField.write', { person: q, effectiveFrom: day(-1), values: { badge: 'synthetic-willow-3' } })
  await as('hr', 'recordRow.write', { person: q, table: 'certifications', effectiveFrom: day(-1), values: { name: 'Forklift', issuer: 'Board', number: 'FL-9', issued_on: day(-300), expires_on: day(40) } })
  await f.account(quinn.period)
  const oakland = await api('location.create', { name: 'Oakland', timezone: 'UTC', workState: 'CA' })
  await api('mover.schedule', { period: quinn.period, effectiveFrom: day(-50), locationId: oakland.id, reason: 'Moved' })
  const leaver = await api('leaver.start', { period: quinn.period, template: f.templates.leaver, endDate: day(-1), reason: 'Resigned' })

  // Before any decision: every blocker is named and nothing can be confirmed.
  const first = await preview('owner', q)
  const kinds = new Set(first.blockers.map(b => b.kind))
  for (const kind of ['open_case', 'retention_not_adopted', 'state_unconfirmed', 'unmapped_class']) assert.ok(kinds.has(kind), `${kind} blocks`)
  assert.equal(first.confirmable, false)
  assert.ok(first.examined > 140, 'the inventory classified every table')
  const byId = Object.fromEntries(first.items.map(item => [item.id, item]))
  for (const id of ['people', 'private', 'periods', 'terms', 'leave_accounts', 'eeo', 'members', 'sessions', 'audit', 'cases', `custom_field:${badge.id}`, `documents:${offers}`, `documents:${forms}`]) assert.ok(byId[id]?.rows > 0, `${id} is classified`)
  assert.equal(byId.eeo.class, 'eeo')
  assert.equal(byId.sessions.disposition, 'erased')
  for (const who of ['hr', 'managera', 'employee']) assert.equal((await preview(who, q, 403)).error, 'owner_required')
  assert.equal((await h.raw(`/app/retention/erasure?person=${q}`, { cookie: s.hr.cookie })).status, 403)

  // HR (or the owner) opens the request; managers and employees never do.
  const request = await as('hr', 'erasure.request', { person: q, source: 'own_request', receivedOn: day(-2) })
  assert.equal((await as('hr', 'erasure.request', { person: q, source: 'other', receivedOn: today }, 409)).error, 'request_exists')
  for (const who of ['managera', 'employee']) await as(who, 'erasure.request', { person: s.invited.person, source: 'counsel', receivedOn: today }, 403)
  assert.equal((await as('hr', 'erasure.request', { person: q, source: 'bogus', receivedOn: today }, 400)).error, 'invalid_source')
  assert.equal((await get('hr', 'retention')).requests[0].id, request.id)
  assert.equal((await as('hr', 'erasure.confirm', { person: q, digest: first.digest }, 403)).error, 'owner_required')
  assert.equal((await api('erasure.confirm', { person: q, digest: first.digest }, 409)).error, 'erasure_blocked')
  assert.ok((await as('hr', 'work')).items.every(item => item.kind !== 'erasure-request') && (await get('owner', 'work')).items.some(item => item.kind === 'erasure-request'), 'the open request is the owner\'s work')

  // The owner clears each blocker through the owner-only doors.
  for (const open of (await api(`people/${q}`)).cases.filter(item => item.status === 'open')) {
    for (const task of (await as('hr', `cases/${open.id}`)).tasks) await as('hr', 'task.complete', { task: task.id, evidence: 'Done' })
    await as('hr', 'case.complete', { case: open.id })
  }
  assert.equal((await as('hr', 'retention.adopt', { version: '2026-10-21' }, 403)).error, 'owner_required')
  assert.equal((await api('retention.adopt', { version: 'old' }, 400)).error, 'unknown_table_version')
  await api('retention.adopt', { version: '2026-10-21' })
  assert.equal((await as('hr', 'retention.state', { state: 'CA', decision: 'none' }, 403)).error, 'owner_required')
  await api('retention.state', { state: 'CA', decision: 'longer', class: 'payroll', years: 4, citation: 'owner-supplied state wage rule' })
  assert.equal((await api('retention.state', { state: 'CA', decision: 'longer', class: 'payroll', years: 4 }, 400)).error, 'missing_citation')
  await api('retention.map', { kind: 'document_category', ref: forms, class: 'payroll' })
  await api('retention.map', { target: `document_category:${offers}`, class: 'personnel' })
  await api('retention.map', { target: `custom_field:${badge.id}`, class: 'personnel' })
  assert.equal((await as('hr', 'retention.map', { kind: 'document_category', ref: forms, class: 'payroll' }, 403)).error, 'owner_required')
  const hold = await api('hold.place', { scope: 'document_category', ref: forms, reason: 'Wage claim', holdOwner: s.hr.member, reviewDate: day(30) })
  for (const who of ['hr', 'managera']) await as(who, 'hold.place', { scope: 'employer', reason: 'x', reviewDate: day(30) }, 403)
  assert.equal((await api('hold.place', { scope: 'document_category', ref: forms, reason: 'x', reviewDate: day(-1) }, 400)).error, 'invalid_reviewDate')

  // The populated, clean preview: classified item by item, with the held class shown as held.
  const clean = await preview('owner', q)
  assert.deepEqual(clean.blockers, [])
  assert.equal(clean.confirmable, true)
  const item = Object.fromEntries(clean.items.map(row => [row.id, row]))
  assert.equal(item[`documents:${forms}`].disposition, 'held')
  assert.equal(item[`documents:${forms}`].hold, hold.id)
  assert.equal(item[`documents:${offers}`].disposition, 'retained')
  assert.equal(item[`documents:${offers}`].expiry, years(today, 1))
  assert.equal(item.terms.expiry, years(today, 4), 'the confirmed California rule lengthens payroll records, counted from the latest record')
  assert.equal(item.cases.expiry, years(today, 1))
  assert.equal(item.eeo.expiry, years(today, 1))
  assert.equal(item.people.disposition, 'held', 'identity stays while anything is held')
  assert.equal(item.audit.disposition, 'anonymized')
  assert.equal(item.sessions.disposition, 'erased')
  assert.ok(clean.summary.held > 0 && clean.summary.retained > 0 && clean.summary.erased > 0 && clean.summary.anonymized > 0)
  assert.ok(clean.copies.exports.statement.includes('may include'))

  // Previewing writes nothing: every table and blob is unchanged except one audit row.
  const before = await rowCounts(directory)
  const again = await preview('owner', q)
  const after = await rowCounts(directory)
  assert.equal(again.digest, clean.digest, 'an unchanged state has an unchanged digest')
  assert.deepEqual({ ...after.tables, wl_audit: 0 }, { ...before.tables, wl_audit: 0 })
  assert.equal(after.tables.wl_audit, before.tables.wl_audit + 1)
  assert.equal(after.blobs, before.blobs)
  const audit = await api('audit')
  assert.ok(audit.some(event => event.action === 'erasure.preview' && event.subject === q && !event.detail.includes('Quinn')))

  // A stale digest is refused; a release changes the preview and its digest; then confirmation records.
  await api('hold.release', { hold: hold.id })
  const released = await preview('owner', q)
  assert.notEqual(released.digest, clean.digest)
  assert.equal(Object.fromEntries(released.items.map(row => [row.id, row]))[`documents:${forms}`].disposition, 'retained')
  assert.equal((await api('erasure.confirm', { person: q, digest: clean.digest }, 409)).error, 'preview_stale')
  const confirmed = await api('erasure.confirm', { person: q, digest: released.digest })
  assert.equal(confirmed.status, 'confirmed')
  assert.equal((await get('owner', 'retention')).requests[0].status, 'confirmed')
  assert.equal((await api('erasure.confirm', { person: q, digest: released.digest }, 409)).error, 'erasure_request_required')
  assert.equal((await as('hr', 'erasure.withdraw', { request: request.id }, 403)).error, 'owner_required')

  // A hold's review date is its owner's FLOW-002 work and moves to the owner when they lose access.
  const second = await api('hold.place', { scope: 'person', ref: s.invited.person, reason: 'Investigation', holdOwner: s.hr.member, reviewDate: day(10) })
  assert.ok((await as('hr', 'work')).items.some(row => row.kind === 'hold-review'))
  assert.equal((await as('managera', 'hold.review', { hold: second.id, nextReviewDate: day(40) }, 403)).error, 'forbidden')
  await as('hr', 'hold.review', { hold: second.id, nextReviewDate: day(40) })
  assert.equal((await get('owner', 'retention')).holds.find(row => row.id === second.id).review_date, day(40))
  await api('access.end', { person: s.hr.person })
  assert.ok((await get('owner', 'work')).items.some(row => row.kind === 'hold-review'))

  // Import custody: a person created by a Base import shows retained originals and plans as redacted.
  const transfer = imports(h, owner)
  await api('category.create', { name: 'Passport scans' })
  const planned = await transfer.plan({ employees: file('employees.csv', employeesCsv({ conflictingEmail: 'nobody@example.com' })), balances: file('balances.csv', balancesCsv), documents: file('documents.zip', documentsZip()), schedule: f.schedule })
  await transfer.apply(planned)
  const juno = (await api('people')).find(person => person.name === 'Juno Ashby')
  const custody = (await preview('owner', juno.id)).items.filter(row => row.id.startsWith('import_'))
  assert.ok(custody.some(row => row.id === 'import_originals' || row.id === 'import_plans') && custody.every(row => row.disposition === 'redacted'))

  // The owner's pages carry the same census; HR's page is only the request form and list.
  const page = await (await h.raw('/app/retention', { cookie: owner })).text()
  assert.ok(page.includes('Retention table') && page.includes('Legal holds') && page.includes('Erasure requests'))
  const erasure = await (await h.raw(`/app/retention/erasure?person=${q}`, { cookie: owner })).text()
  assert.ok(erasure.includes('Erasure preview') && erasure.includes('Every record, item by item'))
  await browserEvidence(h, { owner, hr: s.managera.cookie ? s.managera : s.hr }, q)
  console.log('DATA-002 retention census: passed')
} finally { await h.close(); await rm(directory, { recursive: true, force: true }) }
