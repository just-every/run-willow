import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { file } from './harness.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const custodyStores = ['signature_requests', 'signature_events', 'signature_files', 'signature_payloads']

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
    const own = records.filter(row => row.values && (row.values.id === erased.id || row.values.request_id === erased.id))
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
    const hashes = await persistedDigests(directory)
    const files = own.filter(row => row.table === 'wl_sign_files')
    assert.ok(files.some(row => row.values.sha256 === erased.certificate.sha256))
    for (const row of files) assert.ok(hashes.has(row.values.sha256), 'Held signing bytes remain present at their original digest')
    await checkPeer()
  }
  return {
    async configure(reviewDate) {
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
      await as(staff.employee.cookie, 'retained', undefined, 403)
      await checkCustody(records)
    },
    afterPurge: checkCustody,
  }
}
