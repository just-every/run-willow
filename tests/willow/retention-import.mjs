// Base custody and repeat-import quarantine through the shared public door.
import assert from 'node:assert/strict'
import { today } from './regression-fixture.mjs'
import { file } from './harness.mjs'
import { employeesCsv } from './fixtures.mjs'
import { findText, originalPayloadCount } from './retention-counts.mjs'
import { browserEvidence } from './retention-browser.mjs'

export async function importErasure(h, owner, f, transfer, planned, person, directory) {
  const api = f.api
  const job = (await api('imports')).find(row => row.planId === planned.planId).id
  assert.ok(await originalPayloadCount(directory, job) > 0, 'the import starts with retained original bytes')
  await api('erasure.request', { person: person.id, source: 'own_request', receivedOn: today })
  const preview = await api(`erasure/preview?person=${person.id}`)
  assert.deepEqual(preview.blockers, [])
  assert.ok(preview.items.some(row => row.id.startsWith('import_') && row.disposition === 'redacted'))
  const keptPeople = (await api('people')).filter(row => row.id !== person.id)
  const erased = await api('erasure.confirm', { person: person.id, digest: preview.digest })
  await api(`people/${person.id}`, undefined, 404)
  assert.equal(await originalPayloadCount(directory, job), 0, 'all opaque job originals are withdrawn, including unmapped ZIP bytes')
  const found = await findText(directory, [person.id, 'Juno Ashby', 'juno.ashby@example.com', 'E104'])
  assert.deepEqual(Object.keys(found), ['wl_retained_records'], `import originals, plans, provenance and history no longer hold the identity: ${JSON.stringify(found)}`)
  assert.deepEqual(await api('people'), keptPeople, 'the other imported people are unchanged')
  const repeat = await transfer.plan({ employees: file('employees.csv', employeesCsv({ conflictingEmail: 'nobody@example.com' })), schedule: f.schedule }, { status: 409 })
  assert.equal(repeat.error, 'erased_import_source')
  assert.ok(JSON.stringify(repeat).includes(erased.receipt))
  assert.ok(!JSON.stringify(repeat).includes('Juno'))
  const afterRepeat = await findText(directory, ['juno.ashby@example.com', 'E104'])
  assert.deepEqual(Object.keys(afterRepeat), ['wl_retained_records'], 'a refused repeat leaves no newly uploaded unsanitized original')
  const undo = await transfer.request('undo', { planId: planned.planId }, 409)
  assert.ok(JSON.stringify(undo).includes(erased.receipt), 'undo names the erasure that withdrew its original')
  await browserEvidence(h, owner, [['import-receipt', `/app/retention/receipts/${erased.receipt}`], ['import-history', '/app/import']])
}
