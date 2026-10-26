import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readZip } from './export-reader.mjs'

// Call after nativeSigningProof has completed an employee request in the shared fixture.
export async function signingCustodyProof(h, owner, s) {
  const api = (path, body) => h.api(path, owner, body)
  const completed = (await api('signature-requests')).find(row => row.person === s.employee.person && row.state === 'signed')
  assert.ok(completed, 'A real completed signature is required')
  const detail = await h.api('signature-requests/' + completed.id, s.employee.cookie)
  const bundle = async (cookie, scope) => {
    const params = new URLSearchParams({ scope, fields: 'name', history: 'documents', person: s.employee.person })
    const response = await h.raw('/app/exports/employees.zip?' + params, { cookie })
    assert.equal(response.status, 200)
    const files = readZip(Buffer.from(await response.arrayBuffer()))
    return { files, record: JSON.parse(files.get('records.json')).records.find(row => row.personId === s.employee.person) }
  }
  const employee = await bundle(s.employee.cookie, 'self')
  const evidence = employee.record.signing.find(row => row.request === completed.id)
  assert.ok(evidence)
  assert.equal(evidence.certificate.sha256, detail.certificate.sha256)
  assert.equal(evidence.events.filter(row => row.kind === 'sign').length, detail.certificate.signers.length)
  assert.ok(evidence.events.filter(row => row.kind === 'sign').every(row => row.consent && row.language && row.values && row.payloadDigest))
  assert.ok(!JSON.stringify(evidence).includes('sessionBinding'))
  const document = employee.record.documents.find(row => row.id === evidence.document)
  const version = document.versions.find(row => row.id === evidence.sealedVersion)
  assert.equal(createHash('sha256').update(employee.files.get(version.path)).digest('hex'), evidence.certificate.sha256)
  const manager = await bundle(s.managera.cookie, 'team')
  assert.ok(!manager.record.signing?.some(row => row.request === completed.id), 'Manager status grants no execution evidence')
  const privileged = await bundle(owner, 'organization')
  assert.ok(privileged.record.signing.some(row => row.request === completed.id))
  const category = document.categoryId
  assert.ok(category)
  await api('retention.map', { kind: 'document_category', ref: category, class: 'personnel' })
  const reviewDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const hold = await api('hold.place', { scope: 'document_category', ref: category, reason: 'synthetic-willow-15300', reviewDate })
  const preview = await api('erasure/preview?person=' + s.employee.person)
  const actual = preview.items.find(row => row.id === 'documents:' + category)
  for (const name of ['signature_requests', 'signature_events', 'signature_files', 'signature_payloads']) {
    const item = preview.items.find(row => row.id === name + ':' + category)
    assert.ok(item, name + ' is inventoried')
    assert.equal(item.disposition, 'held')
    assert.equal(item.hold, hold.id)
    assert.equal(item.class, actual.class)
    assert.equal(item.expiry, actual.expiry)
  }
  await api('hold.release', { hold: hold.id })
  console.log('Signing custody export and category hold proof passed')
}
