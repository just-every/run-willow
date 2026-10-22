// Shared handoffs retain the other workers' frozen lines after erasure.
import assert from 'node:assert/strict'
import { genericColumns } from './phase2-fixtures.mjs'
import { today, day } from './regression-fixture.mjs'
import { browserEvidence, confirmThroughBrowser } from './retention-browser.mjs'

export async function payrollErasure(h, owner, f) {
  const api = f.api, target = await f.join('nina'), peer = await f.join('omar')
  await api('leaver.start', { period: target.period, template: f.templates.leaver, endDate: day(-1), reason: 'Left' })
  for (const item of (await api(`people/${target.person}`)).cases.filter(row => row.status === 'open')) {
    for (const task of (await api(`cases/${item.id}`)).tasks) await api('task.complete', { task: task.id, evidence: 'Complete' })
    await api('case.complete', { case: item.id })
  }
  let serial = 20
  for (const person of await api('people')) {
    for (const period of (await api(`people/${person.id}`)).employment ?? []) {
      if (!period.payrollId) await api('period.payroll', { period: period.id, payrollId: `synthetic-willow-${++serial}` })
    }
  }
  await api('payroll.layout', { format: 'generic', columns: genericColumns })
  const draft = await api('payroll.draft', { periodStart: day(-100), periodEnd: today })
  const file = await api('payroll.preview', { batch: draft.id })
  await api('payroll.export', { batch: draft.id, previewRevision: file.previewRevision })
  await api('payroll.acknowledge', { batch: draft.id, reference: 'synthetic-willow-12' })
  const before = await api(`payroll/${draft.id}`)
  assert.ok(before.lines.some(row => row.person === target.person) && before.lines.some(row => row.person === peer.person))
  assert.equal((await h.raw(`/app/payroll/${draft.id}.csv`, { cookie: owner })).status, 200)
  await api('erasure.request', { person: target.person, source: 'own_request', receivedOn: today })
  const preview = await api(`erasure/preview?person=${target.person}`)
  assert.deepEqual(preview.blockers, [])
  assert.equal(preview.items.find(row => row.id === 'payroll_batches').disposition, 'retained')
  const erased = await confirmThroughBrowser(h, owner, target.person) ?? await api('erasure.confirm', { person: target.person, digest: preview.digest })
  const after = await api(`payroll/${draft.id}`)
  assert.deepEqual(after.lines, before.lines.filter(row => row.person !== target.person))
  assert.equal(after.filePreview, null)
  assert.equal(after.erasureReceipt, erased.receipt)
  assert.ok(!JSON.stringify(after).includes(target.person) && !JSON.stringify(after).includes('nina'))
  const download = await h.raw(`/app/payroll/${draft.id}.csv`, { cookie: owner })
  assert.equal(download.status, 409)
  assert.ok(!download.headers.get('content-type')?.includes('text/csv'), 'withdrawal never serves a CSV')
  assert.ok(!(await download.text()).includes('nina@example.com'), 'the refusal carries no erased identity')
  const custody = (await api('retained')).records.filter(row => row.person === erased.label && row.store === 'payroll_batches')
  assert.equal(custody.length, 1)
  assert.deepEqual(custody[0].values.lines, before.lines.filter(row => row.person === target.person))
  assert.ok(!JSON.stringify(custody).includes(peer.person), 'retained payroll slice contains no other worker')
  const receipt = await api(`erasure/receipts/${erased.receipt}`)
  assert.ok(receipt.providerRequests.some(row => row.provider === 'Payroll provider (exported handoff files)' && row.open))
  await browserEvidence(h, owner, [['payroll-redacted', `/app/payroll/${draft.id}`], ['directory-after-erasure', '/app/people'], ['access-after-erasure', '/app/access']])
}
