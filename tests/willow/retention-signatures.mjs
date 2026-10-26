import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { file } from './harness.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const custodyStores = ['signature_requests', 'signature_events', 'signature_files', 'signature_payloads', 'signature_reviews']

// Business mutations use the real signed-in doors. Inspect object bytes only to
// establish custody after erasure has deliberately closed the original download.
async function persistedDigests(directory) {
  const hashes = new Set()
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) await walk(child)
      else if (child.includes('/r2/') && !/\.sqlite(?:-wal|-shm)?$/.test(child)) hashes.add(digest(await readFile(child)))
    }
  }
  await walk(join(directory, 'v3'))
  return hashes
}

export async function retentionSignatures(h, owner, staff, subject, directory) {
  const api = (path, body, status) => h.api(path, owner, body, status)
  const as = (cookie, path, body, status) => h.api(path, cookie, body, status)
  const category = await api('category.create', { name: 'synthetic-willow-16100', subjectReads: true, managerReads: true })
  const folder = await api('company.folder', { name: 'synthetic-willow-16101', audience: { kind: 'everyone', id: null } })
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792]).drawText('synthetic-willow-16102', { x: 40, y: 730, size: 14 })
  const source = await api('company.file', { folder: folder.id, title: 'synthetic-willow-16103', file: file('synthetic-willow-16104.pdf', await pdf.save()) })
  const template = await api('signature.template', { source: source.versionId, title: 'synthetic-willow-16105', category: category.id,
    signers: ['employee', 'hr'], fields: [
      { signer: 0, kind: 'employee_name', page: 1, x: 0.1, y: 0.15, width: 0.7, height: 0.08 },
      { signer: 0, kind: 'signature', page: 1, x: 0.1, y: 0.3, width: 0.7, height: 0.08 },
      { signer: 1, kind: 'signature', page: 1, x: 0.1, y: 0.6, width: 0.7, height: 0.08 },
    ] })
  const approved = (await api('signature-templates')).find(row => row.id === template.id)
  await api('signature.template.approve', { template: template.id, digest: approved.digest, reviewed: true })
  const review = await api('signature.preview', { template: template.id, people: [subject.person, staff.employee.person], hr: staff.hr.member, expiresAt: Date.now() + 7 * 86400000 })
  const issued = await api('signature.send', { review: review.id, digest: review.digest, approved: true })
  const completed = []
  for (const [person, cookie, name] of [[subject.person, subject.cookie, 'synthetic-willow-16106'], [staff.employee.person, staff.employee.cookie, 'synthetic-willow-16107']]) {
    const request = (await as(cookie, 'signature-requests')).find(row => issued.requests.includes(row.id) && row.person === person)
    assert.ok(request)
    for (const [signer, signature] of [[cookie, name], [staff.hr.cookie, 'synthetic-willow-16108']]) {
      const current = await as(signer, 'signature-requests/' + request.id)
      const bound = { request: request.id, revision: current.revision, digest: current.digest }
      const payload = await as(signer, 'signature.prepare', { ...bound, name: signature })
      await as(signer, 'signature.act', { ...bound, action: 'sign', payload: payload.id, consent: true })
    }
    const detail = await as(cookie, 'signature-requests/' + request.id)
    assert.equal(detail.state, 'signed')
    const response = await h.raw('/app/files/document/' + detail.sealedVersion, { cookie })
    assert.equal(response.status, 200)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(digest(bytes), detail.certificate.sha256)
    completed.push({ ...detail, bytes })
  }
  const unissued = await api('signature.preview', { template: template.id, people: [subject.person, staff.employee.person], hr: staff.hr.member, expiresAt: Date.now() + 7 * 86400000 })
  const reviews = [review, unissued]
  for (const preview of reviews) {
    const response = await h.raw('/app/signature-reviews/' + preview.id + '?person=' + subject.person, { cookie: owner })
    assert.equal(response.status, 200)
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), preview.recipients.find(row => row.id === subject.person).sha256)
  }
  const businessAudit = JSON.stringify((await api('audit')).filter(row => row.action.startsWith('signature.')))
  for (const signature of ['synthetic-willow-16106', 'synthetic-willow-16107', 'synthetic-willow-16108']) assert.ok(!businessAudit.includes(signature), 'General signing audit excludes entered signature values')
  const [erased, peer] = completed
  let hold
  const assertPreview = (plan, disposition) => {
    const document = plan.items.find(row => row.id === 'documents:' + category.id)
    assert.ok(document)
    assert.equal(document.disposition, disposition)
    for (const store of custodyStores) {
      const item = plan.items.find(row => row.id === store + ':' + category.id)
      assert.ok(item?.rows > 0, store + ' is inventoried')
      assert.deepEqual([item.disposition, item.class, item.expiry, item.hold], [document.disposition, document.class, document.expiry, document.hold], store + ' follows the signed document rule')
    }
    if (hold) assert.equal(document.hold, hold.id)
  }
  const checkPeer = async () => {
    const current = await as(staff.employee.cookie, 'signature-requests/' + peer.id)
    assert.equal(current.state, 'signed')
    assert.deepEqual(current.certificate, peer.certificate, 'Erasing one cohort recipient preserves the other certificate')
    const response = await h.raw('/app/files/document/' + peer.sealedVersion, { cookie: staff.employee.cookie })
    assert.equal(response.status, 200)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), peer.bytes)
  }
  const checkCustody = async records => {
    const own = records.filter(row => row.values && (row.values.id === erased.id || row.values.request_id === erased.id || row.values.person_id === subject.person || reviews.some(review => review.id === row.values.id)))
    for (const store of custodyStores) {
      const rows = own.filter(row => row.store === store + ':' + category.id)
      assert.ok(rows.length > 0, store + ' survives in restricted custody')
      assert.ok(rows.every(row => row.hold === hold.id && row.class === 'personnel'))
    }
    const request = own.find(row => row.store === 'signature_requests:' + category.id)
    assert.deepEqual(JSON.parse(request.values.certificate), erased.certificate)
    const events = own.filter(row => row.table === 'wl_sign_events' && row.values.kind === 'sign')
    assert.equal(events.length, erased.certificate.signers.length)
    assert.ok(events.every(row => {
      const evidence = JSON.parse(row.values.detail)
      return evidence.consent && evidence.language && evidence.payloadDigest && evidence.values
    }), 'Exact consent and signing payload evidence remains in protected custody')
    for (const preview of reviews) {
      const retained = own.find(row => row.store === 'signature_reviews:' + category.id && row.values.id === preview.id)
      assert.ok(retained, 'The exact shared review is retained under its category rule')
      assert.equal(digest(Buffer.from(retained.values.snapshot)), preview.digest)
      assert.ok(JSON.parse(retained.values.snapshot).recipients.some(row => row.id === subject.person))
    }
    const hashes = await persistedDigests(directory)
    const files = own.filter(row => row.table === 'wl_sign_files')
    assert.ok(files.some(row => row.values.sha256 === erased.certificate.sha256))
    for (const row of files) assert.ok(hashes.has(row.values.sha256), 'Held signing bytes remain present at their original digest')
    for (const preview of reviews) assert.ok(hashes.has(preview.recipients.find(row => row.id === subject.person).sha256), 'Unissued and issued recipient preview bytes remain held')
    await checkPeer()
  }
  return {
    async configure(reviewDate) {
      await purgePreviewProof(h, owner, staff, subject, source, template, directory)
      await api('retention.map', { kind: 'document_category', ref: category.id, class: 'personnel' })
      assertPreview(await api('erasure/preview?person=' + subject.person), 'retained')
      hold = await api('hold.place', { scope: 'document_category', ref: category.id, reason: 'synthetic-willow-16109', reviewDate })
    },
    preview(plan) { assertPreview(plan, 'held') },
    async afterErasure(records) {
      for (const cookie of [owner, staff.employee.cookie, staff.managera.cookie]) {
        await as(cookie, 'signature-requests/' + erased.id, undefined, 404)
        assert.equal((await h.raw('/app/signatures/' + erased.id + '.pdf', { cookie })).status, 404)
        assert.equal((await h.raw('/app/files/document/' + erased.sealedVersion, { cookie })).status, 404)
      }
      assert.equal((await h.raw('/api/willow/signature-requests/' + erased.id, { cookie: subject.cookie })).status, 401)
      for (const preview of reviews) {
        assert.equal((await h.raw('/app/signature-reviews/' + preview.id + '?person=' + subject.person, { cookie: owner })).status, 404)
        const response = await h.raw('/app/signature-reviews/' + preview.id + '?person=' + staff.employee.person, { cookie: owner })
        assert.equal(response.status, 200)
        assert.equal(digest(Buffer.from(await response.arrayBuffer())), preview.recipients.find(row => row.id === staff.employee.person).sha256)
      }
      await api('signature.send', { review: unissued.id, digest: unissued.digest, approved: true }, 409)
      await as(staff.employee.cookie, 'retained', undefined, 403)
      await checkCustody(records)
    },
    afterPurge: checkCustody,
  }
}


// A live former worker's expired preview is purged through the owner review,
// without erasing the worker or damaging another recipient of the same review.
async function purgePreviewProof(h, owner, staff, subject, source, template, directory) {
  const api = (path, body, status) => h.api(path, owner, body, status)
  const templates = await api('templates')
  const schedule = (await api('people/' + staff.employee.person)).current.schedule.id
  const old = await api('joiner.start', { template: templates.find(row => row.kind === 'joiner' && row.status === 'active').id,
    legalName: 'synthetic-willow-16110', workEmail: 'synthetic-willow-16110@example.com', startDate: '2010-01-01',
    employmentType: 'full_time', jobTitle: 'synthetic-willow-16111', payrollId: 'synthetic-willow-16112', scheduleId: schedule,
    payBasis: 'salary', payAmount: '80000' })
  await api('access.give', { person: old.person })
  const category = await api('category.create', { name: 'synthetic-willow-16113', subjectReads: true })
  const definition = (await api('signature-templates')).find(row => row.id === template.id)
  const signedTemplate = await api('signature.template', { source: source.versionId, title: 'synthetic-willow-16114', category: category.id, signers: definition.signers, fields: definition.fields })
  const current = (await api('signature-templates')).find(row => row.id === signedTemplate.id)
  await api('signature.template.approve', { template: current.id, digest: current.digest, reviewed: true })
  const review = await api('signature.preview', { template: current.id, people: [old.person, staff.employee.person], hr: staff.hr.member, expiresAt: Date.now() + 7 * 86400000 })
  const original = await h.raw('/app/signature-reviews/' + review.id + '?person=' + old.person, { cookie: owner })
  assert.equal(original.status, 200)
  const originalHash = digest(Buffer.from(await original.arrayBuffer()))
  await api('leaver.start', { template: templates.find(row => row.kind === 'leaver' && row.status === 'active').id, period: old.period, endDate: '2011-01-01', reason: 'synthetic-willow-16115' })
  for (const open of (await api('people/' + old.person)).cases.filter(row => row.status === 'open')) {
    for (const task of (await api('cases/' + open.id)).tasks) await api('task.complete', { task: task.id, evidence: 'synthetic-willow-16116' })
    await api('case.complete', { case: open.id })
  }
  await api('retention.map', { kind: 'document_category', ref: category.id, class: 'i9' })
  const plan = await api('erasure/preview?person=' + old.person)
  for (const store of ['signature_files', 'signature_reviews']) {
    const item = plan.items.find(row => row.id === store + ':' + category.id)
    assert.ok(item?.rows > 0)
    assert.equal(item.disposition, 'erased', 'Expired previews have an ordinary category expiry')
  }
  const purge = (await api('retention/review')).records.find(row => row.person.id === old.person)
  assert.ok(purge?.purgeable)
  await api('retention.purge', { person: old.person, digest: purge.digest })
  assert.equal((await api('people/' + old.person)).id, old.person)
  assert.equal((await h.raw('/app/signature-reviews/' + review.id + '?person=' + old.person, { cookie: owner })).status, 404)
  const peer = await h.raw('/app/signature-reviews/' + review.id + '?person=' + staff.employee.person, { cookie: owner })
  assert.equal(peer.status, 200)
  assert.equal(digest(Buffer.from(await peer.arrayBuffer())), review.recipients.find(row => row.id === staff.employee.person).sha256)
  await api('signature.send', { review: review.id, digest: review.digest, approved: true }, 409)
  assert.ok(!(await persistedDigests(directory)).has(originalHash), 'Expired recipient preview bytes are removed')
}
