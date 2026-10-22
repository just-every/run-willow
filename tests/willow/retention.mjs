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
import { findText, rowCounts, stubIdentities } from './retention-counts.mjs'
import { browserEvidence } from './retention-browser.mjs'
import { payrollErasure } from './retention-payroll.mjs'
import { importErasure } from './retention-import.mjs'

const directory = await mkdtemp(join(tmpdir(), 'willow-retention-'))
const h = await harness({ persistTo: directory, scheduled: true })
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
  const quinnMemberId = (await api('access.give', { person: q })).id
  const quinnCookie = await h.signIn('quinn@example.com', { requested: true })
  await h.api('eeo.self.write', quinnCookie, { raceEthnicity: 'asian', sex: 'female' })
  const offers = (await api('category.create', { name: 'Offer letters' })).id, forms = (await api('category.create', { name: 'Payroll forms' })).id
  const text = value => ({ filename: 'a.txt', base64: Buffer.from(value).toString('base64') })
  const offerVersion = (await api('document.add', { person: q, category: offers, title: 'Offer', file: text('synthetic-willow-1') })).version
  const formVersion = (await api('document.add', { person: q, category: forms, title: 'Withholding form', file: text('synthetic-willow-2') })).version
  const badge = await as('hr', 'customField.define', { definition: { key: 'badge', classification: 'hr', type: 'text', validation: { maxLength: 40 }, effectiveFrom: day(-60), label: 'Badge', required: false, employeeRead: false, managerRead: false, retired: false } })
  await as('hr', 'customField.write', { person: q, effectiveFrom: day(-1), values: { badge: 'synthetic-willow-3' } })
  await as('hr', 'recordRow.write', { person: q, table: 'certifications', effectiveFrom: day(-1), values: { name: 'Forklift', issuer: 'Board', number: 'FL-9', issued_on: day(-300), expires_on: day(40) } })
  const quinnAccount = await f.account(quinn.period)
  const oakland = await api('location.create', { name: 'Oakland', timezone: 'UTC', workState: 'CA' })
  await api('mover.schedule', { period: quinn.period, effectiveFrom: day(-50), locationId: oakland.id, reason: 'Moved' })
  await h.api('goal.create', quinnCookie, { person: q, title: 'synthetic-willow-6', milestones: ['Start'], dueDate: day(60), development: true, owner: quinnMemberId })
  await as('hr', 'protected.open', { person: q, title: 'synthetic-willow-7', startDate: day(-2), endDate: day(5), entitlementHours: '24', reviewNote: 'Employer reviewed policy', certification: file('medical.txt', 'synthetic-willow-8') })
  await api('connections.notices', { enabled: true })
  const leave = await h.api('leave.request', quinnCookie, { account: quinnAccount, startDate: day(3), endDate: day(3), reason: 'synthetic-willow-5' })
  await api('leave.decide', { request: leave.id, decision: 'approve' })
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
  assert.equal((await as('hr', 'erasure.withdraw', { request: request.id }, 403)).error, 'owner_required')
  assert.equal((await as('hr', 'erasure.confirm', { person: q, digest: first.digest }, 403)).error, 'owner_required')
  assert.equal((await api('erasure.confirm', { person: q, digest: first.digest }, 409)).error, 'preview_stale')
  assert.equal((await api('erasure.confirm', { person: q, digest: (await preview('owner', q)).digest }, 409)).error, 'erasure_blocked')
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

  // A hold's review date is its owner's FLOW-002 work and moves to the owner when they lose access.
  const second = await api('hold.place', { scope: 'person', ref: s.invited.person, reason: 'Investigation', holdOwner: s.hr.member, reviewDate: day(10) })
  assert.ok((await as('hr', 'work')).items.some(row => row.kind === 'hold-review'))
  assert.equal((await as('managera', 'hold.review', { hold: second.id, nextReviewDate: day(40) }, 403)).error, 'forbidden')
  await as('hr', 'hold.review', { hold: second.id, nextReviewDate: day(40) })
  assert.equal((await get('owner', 'retention')).holds.find(row => row.id === second.id).review_date, day(40))
  await api('access.end', { person: s.hr.person })
  assert.ok((await get('owner', 'work')).items.some(row => row.kind === 'hold-review'))

  // Import custody: a person created by a Base import shows retained originals and plans as redacted.
  await api('location.create', { name: 'Parramatta', timezone: 'UTC', workState: 'CA' })
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
  await browserEvidence(h, owner, [['census', '/app/retention'], ['preview', `/app/retention/erasure?person=${q}`]])

  // The digest binds the preview: a changed state is refused as stale; HR cannot withdraw; the second hold changes the preview and is released.
  const watch = await api('hold.place', { scope: 'record_class', ref: 'eeo', reason: 'Audit of EEO records', reviewDate: day(30) })
  const changed = await preview('owner', q)
  assert.notEqual(changed.digest, clean.digest)
  assert.equal(Object.fromEntries(changed.items.map(row => [row.id, row]))['eeo'].disposition, 'held')
  assert.equal((await api('erasure.confirm', { person: q, digest: clean.digest }, 409)).error, 'preview_stale')
  await api('hold.release', { hold: watch.id })
  const final = await preview('owner', q)
  assert.notEqual(final.digest, changed.digest, 'releasing the hold changes the digest again')

  // Erasure: one journaled batch. Retained and held records move to restricted custody; nothing else names the person.
  const members = await api('members')
  const quinnMember = members.find(member => member.person === q).id
  const sourceBefore = await rowCounts(directory)
  const erased = await api('erasure.confirm', { person: q, digest: final.digest })
  assert.equal(erased.status, 'confirmed')
  assert.match(erased.label, /^Former person [0-9a-f]{8}$/)
  assert.equal((await api('erasure.confirm', { person: q, digest: final.digest }, 409)).error, 'erasure_request_required')
  await preview('owner', q, 404)
  await api(`people/${q}`, undefined, 404)
  assert.ok(!(await api('people')).some(person => person.id === q), 'the directory no longer lists the person')
  assert.equal((await h.raw('/api/willow/me', { cookie: quinnCookie })).status, 401, 'their session ended')
  await assert.rejects(h.signIn('quinn@example.com'), /no sign-in message/)
  const afterCounts = await rowCounts(directory)
  assert.ok(afterCounts.tables.rer_portability_journal > sourceBefore.tables.rer_portability_journal, 'portability fence advanced in the same batch')
  const strings = [q, quinnMember, 'quinn@example.com', 'synthetic-willow-3', 'synthetic-willow-6', 'synthetic-willow-7']
  const found = await findText(directory, strings)
  assert.deepEqual(Object.keys(found), ['wl_retained_records'], `only restricted custody holds the person: ${JSON.stringify(found)}`)
  // Nothing else still points at the person: only the stub identity and the audit, request and member rows that carry it.
  const stubIds = await stubIdentities(directory, erased.label)
  assert.equal(stubIds.length, 2, 'one stub person and one stub member carry the label')
  const pointing = await findText(directory, stubIds)
  assert.deepEqual(Object.keys(pointing).sort(), ['wl_audit', 'wl_erasure_requests', 'wl_members', 'wl_people', 'wl_work_history', 'wl_work_schedule'].sort(), `only identity, audit, request and work-history rows carry the stub: ${JSON.stringify(pointing)}`)
  const auditAfter = JSON.stringify(await api('audit'))
  for (const value of [q, quinnMember, 'quinn@example.com']) assert.ok(!auditAfter.includes(value), 'audit and history no longer name the person')
  assert.ok(auditAfter.includes(erased.label.split(' ')[2]) === false, 'the label is stored as a stub identity, not as text')
  const receipt = await api(`erasure/receipts/${erased.receipt}`)
  assert.equal(receipt.label, erased.label)
  for (const [kind, expected] of [['erased', final.summary.erased], ['retained', final.summary.retained], ['held', final.summary.held]]) assert.equal(receipt.totals[kind], expected, `receipt ${kind} count matches the preview`)
  assert.ok(receipt.totals.anonymized >= final.summary.anonymized, 'audit rows written by the preview itself are anonymized too')
  assert.ok(!JSON.stringify(receipt).match(new RegExp([q, quinnMember, 'quinn', 'Quinn'].join('|'))), 'the receipt holds no identifier')
  await browserEvidence(h, owner, [['receipt', `/app/retention/receipts/${erased.receipt}`], ['retained', '/app/retention/retained']])
  assert.equal(receipt.source, 'own_request')
  assert.deepEqual(receipt.providerRequests.map(r => [r.provider, r.status, r.open]), [['Email notice provider', 'open', true]], 'the provider that received a notice gets a tracked deletion request')
  const providerWork = (await get('owner', 'work')).items.find(item => item.kind === 'provider-deletion')
  assert.ok(providerWork, 'the request is the owner\'s FLOW-002 work')
  const requestId = receipt.providerRequests[0].id
  await as('managera', 'erasure.provider', { request: requestId, outcome: 'deleted', evidence: 'x' }, 403)
  await api('erasure.provider', { request: requestId, outcome: 'failed' }, 400)
  await api('erasure.provider', { request: requestId, outcome: 'failed', evidence: 'provider API returned 503' })
  assert.equal((await api(`erasure/receipts/${erased.receipt}`)).providerRequests[0].open, true, 'a failed provider deletion remains open')
  assert.ok((await get('owner', 'work')).items.some(item => item.kind === 'provider-deletion'), 'and stays work')
  await api('erasure.provider', { request: requestId, outcome: 'retained', evidence: 'provider reply 12', reason: 'legal hold at the provider', expiry: day(90) })
  assert.equal((await api(`erasure/receipts/${erased.receipt}`)).providerRequests[0].open, false)
  await api('erasure.provider', { request: requestId, outcome: 'deleted', evidence: 'x' }, 409)
  await as('managera', `erasure/receipts/${erased.receipt}`, undefined, 403)
  const custodyRecords = (await api('retained')).records
  const kept = Object.fromEntries(custodyRecords.map(record => [record.store, record]))
  assert.equal(kept[`documents:${forms}`].hold, hold.id, 'the held document class is in custody under its hold')
  assert.equal(kept.terms.class, 'payroll')
  assert.equal(kept.eeo.values, null, 'EEO values in custody need eeo.individual even for the owner')
  assert.ok(kept.people.values.legal_name, 'the owner reads the retained identity')
  await as('managera', 'retained', undefined, 403)
  for (const version of [offerVersion, formVersion]) for (const who of ['managera', 'employee']) assert.equal((await h.raw(`/app/files/document/${version}`, { cookie: s[who].cookie })).status, 404, 'documents are no longer served')
  assert.equal(afterCounts.blobs, sourceBefore.blobs, 'retained and held bytes stay in custody')


  // REPORT-001: a result where the erased person would have counted says so and never lists them.
  const then = day(-30)
  assert.equal((await api(`eeo/report?asOf=${then}`)).excludesErased, 1)
  assert.equal((await api('eeo/report')).excludesErased, 0, 'no label where they would not have counted')
  assert.equal((await api(`reports?asOf=${then}`)).excludesErased, 1)
  const past = await api('report.save', { definition: { name: 'Past headcount', columns: ['name'], asOf: then, from: day(-60), to: then, status: 'active' } })
  const pastRun = await api(`custom-reports/${past.id}`)
  assert.equal(pastRun.result.excludesErased, 1)
  assert.ok(!JSON.stringify(pastRun).includes(q) && !JSON.stringify(pastRun).includes('quinn'), 'drill-down never reaches them')

  // A class whose period has run out is erased with its bytes: an I-9-class document of someone who left years ago.
  const rae = await f.join('rae', { startDate: '2019-01-01' })
  const identity = (await api('category.create', { name: 'Identity checks' })).id
  const raeVersion = (await api('document.add', { person: rae.person, category: identity, title: 'Identity', file: text('synthetic-willow-4') })).version
  await api('retention.map', { kind: 'document_category', ref: identity, class: 'i9' })
  const raeLeaver = await api('leaver.start', { period: rae.period, template: f.templates.leaver, endDate: '2020-06-30', reason: 'Left' })
  for (const open of (await api(`people/${rae.person}`)).cases.filter(item => item.status === 'open')) {
    for (const task of (await api(`cases/${open.id}`)).tasks) await api('task.complete', { task: task.id, evidence: 'Done' })
    await api('case.complete', { case: open.id })
  }
  assert.ok(raeLeaver.case)
  await api('erasure.request', { person: rae.person, source: 'retention_expiry', receivedOn: today })
  const raePlan = await preview('owner', rae.person)
  assert.deepEqual(raePlan.blockers, [])
  const raeDocument = raePlan.items.find(row => row.id === `documents:${identity}`)
  assert.deepEqual([raeDocument.disposition, raeDocument.class, raeDocument.blobs], ['erased', 'i9', 1])
  const blobsBefore = (await rowCounts(directory)).blobs
  const raeErased = await api('erasure.confirm', { person: rae.person, digest: raePlan.digest })
  const raeReceipt = await api(`erasure/receipts/${raeErased.receipt}`)
  assert.deepEqual([raeReceipt.blobs.total, raeReceipt.blobs.deleted], [1, 1], 'the bytes are deleted after the commit and the receipt says so')
  assert.equal((await rowCounts(directory)).blobs, blobsBefore - 1)
  assert.equal((await h.raw(`/app/files/document/${raeVersion}`, { cookie: owner })).status, 404)

  // The review list: a former worker who is not being erased has an I-9-class document past its period; the owner purges it by digest.
  const sol = await f.join('sol', { startDate: '2019-01-01' })
  const solVersion = (await api('document.add', { person: sol.person, category: identity, title: 'Identity', file: text('synthetic-willow-11') })).version
  await api('leaver.start', { period: sol.period, template: f.templates.leaver, endDate: '2020-06-30', reason: 'Left' })
  for (const open of (await api(`people/${sol.person}`)).cases.filter(item => item.status === 'open')) {
    for (const task of (await api(`cases/${open.id}`)).tasks) await api('task.complete', { task: task.id, evidence: 'Done' })
    await api('case.complete', { case: open.id })
  }
  await as('managera', 'retention/review', undefined, 403)
  const review = (await api('retention/review')).records.find(row => row.person.id === sol.person)
  assert.ok(review && review.purgeable && review.expired.every(item => item.class === 'i9'), 'the expired I-9-class records are on the owner\'s review list')
  await as('managera', 'retention.purge', { person: sol.person, digest: review.digest }, 403)
  assert.equal((await api('retention.purge', { person: sol.person, digest: 'stale' }, 409)).error, 'preview_stale')
  const blobsBeforePurge = (await rowCounts(directory)).blobs
  await api('retention.purge', { person: sol.person, digest: review.digest })
  assert.equal((await api(`people/${sol.person}`)).documents.length, 0, 'the expired documents are gone and the person is not')
  assert.equal((await rowCounts(directory)).blobs, blobsBeforePurge - 1, 'their bytes go with them')
  assert.ok(!(await api('retention/review')).records.some(row => row.person.id === sol.person), 'the list no longer carries them')
  assert.ok((await api('audit')).some(event => event.action === 'retention.purge'))
  assert.equal((await h.raw(`/app/files/document/${solVersion}`, { cookie: owner })).status, 404)

  // An applicant who was not hired: every linked application, resume and scorecard goes the same way.
  const job = await api('hiring.opening', { name: 'Open role', stages: ['New', 'Rejected', 'Hired'], members: [s.managera.member] })
  const candidate = await h.api('hiring.candidate', s.managera.cookie, { opening: job.id, name: 'Priya Applicant', contactEmail: 'priya.applicant@example.com', source: 'Referral' })
  await h.api('hiring.resume', s.managera.cookie, { application: candidate.id, version: 0, file: file('priya.txt', 'synthetic-willow-9', 'text/plain') })
  await h.api('hiring.scorecard', s.managera.cookie, { application: candidate.id, version: 0, evidence: 'synthetic-willow-10' })
  await api('erasure.request', { application: candidate.id, source: 'own_request', receivedOn: today })
  await api('erasure.request', { application: candidate.id, source: 'other', receivedOn: today }, 409)
  assert.deepEqual((await get('owner', `erasure/preview?application=${candidate.id}`)).blockers.map(b => b.kind), ['open_application'], 'an application still in selection blocks')
  await api('hiring.move', { application: candidate.id, revision: 1, stage: 'Rejected' })
  const applicantPlan = await get('owner', `erasure/preview?application=${candidate.id}`)
  assert.deepEqual(applicantPlan.blockers, [])
  assert.deepEqual(applicantPlan.items.map(row => [row.id, row.disposition, row.class]).sort(), [['applications', 'retained', 'personnel'], ['events', 'retained', 'personnel'], ['resumes', 'retained', 'personnel'], ['scorecards', 'retained', 'personnel']])
  await as('managera', `erasure/preview?application=${candidate.id}`, undefined, 403)
  const applicantErased = await api('erasure.confirm', { application: candidate.id, digest: applicantPlan.digest })
  assert.match(applicantErased.label, /^Former person [0-9a-f]{8}$/)
  await api(`hiring/applications/${candidate.id}`, undefined, 404)
  const applicantFound = await findText(directory, ['priya.applicant@example.com', 'Priya Applicant', candidate.id, 'synthetic-willow-10'])
  assert.deepEqual(Object.keys(applicantFound), ['wl_retained_records'], `only custody holds the applicant: ${JSON.stringify(applicantFound)}`)
  assert.ok(!JSON.stringify(await api('audit')).includes('priya.applicant@example.com'))
  assert.equal((await api(`erasure/receipts/${applicantErased.receipt}`)).totals.retained, applicantPlan.summary.retained)

  await importErasure(h, owner, f, transfer, planned, juno, directory)
  await payrollErasure(h, owner, f)

  // The purge: records warn 30 days ahead and go when their last rule has expired; held and longer-lived ones stay.
  const tick = async date => assert.equal((await h.raw(`/cdn-cgi/local/scheduled?time=${Date.parse(`${date}T09:00:00Z`)}&cron=${encodeURIComponent('*/15 * * * *')}&format=json`)).status, 200)
  const oneYear = years(today, 1)
  assert.equal((await get('owner', 'retention')).expiring.length, 0, 'nothing is inside its warning window yet')
  const beforePurge = await rowCounts(directory), baseline = (await api('retained')).records.length
  await tick(day(0))
  assert.deepEqual((await api('retained')).records.length, baseline, 'a tick before any expiry purges nothing')
  const warned = new Date(Date.parse(`${oneYear}T00:00:00Z`) - 20 * 86400000).toISOString().slice(0, 10)
  await tick(warned)
  assert.ok((await get('owner', `retention?asOf=${warned}`)).expiring.length > 0, 'the owner\'s retention page lists what expires within 30 days')
  assert.equal((await api('retained')).records.length, baseline, 'the warning purges nothing')
  await tick(oneYear)
  const remaining = (await api('retained')).records
  const stores = new Set(remaining.map(record => record.store))
  assert.ok(!stores.has('cases') && !stores.has(`documents:${offers}`), 'one-year personnel records are purged at their expiry')
  assert.ok(stores.has('terms') && stores.has(`documents:${forms}`) && stores.has('people'), 'longer rules, holds and the identity they need remain')
  assert.ok((await api('audit')).some(event => event.action === 'retained.purge'), 'the purge is audited without values')
  assert.equal((await rowCounts(directory)).blobs, beforePurge.blobs - 2, 'the purged offer letter\'s and resume\'s bytes go with their last record')
  console.log('DATA-002 retention census: passed')
} finally { await h.close(); await rm(directory, { recursive: true, force: true }) }
