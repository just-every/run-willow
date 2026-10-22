// Native award custody: field-aware bundles, holds, erasure and surviving peer awards.
import assert from 'node:assert/strict'
import { day, today } from './regression-fixture.mjs'
import { readZip } from './export-reader.mjs'

export async function compensationCustodyProof(h, owner, fx) {
 const { api, join, templates, staff } = fx
 const key = 'synthetic-willow-901', person = await join(key), peer = await join('synthetic-willow-902')
 const invited = await h.raw('/api/willow/access.give', { cookie: owner, body: { person: person.person }, ip: '192.0.2.91' })
 assert.equal(invited.status, 200)
 const member = (await invited.json()).id, cookie = await h.signIn(`${key}@example.com`, { requested: true, ip: '192.0.2.91' })
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 const level = await apply({ kind: 'level', name: 'synthetic-willow-903', permissions: [], compensationFields: { self: {}, others: { bonus: 'edit', equity: 'edit', history: 'view' } } })
 await apply({ kind: 'assignment', member, levels: [level.id] })
 const ownBonus = { kind: 'bonus', effectiveDate: day(-10), amount: '175.51', currency: 'AUD', note: 'synthetic-willow-904' }
 const ownEquity = { kind: 'equity', effectiveDate: day(-9), units: '17.125', security: 'synthetic-willow-905', note: 'synthetic-willow-906' }
 const first = await api('compensation.record', { person: person.person, ...ownBonus })
 const correction = await api('compensation.record', { person: person.person, ...ownBonus, record: first.id, revision: first.revision, amount: '200.25' })
 const equity = await api('compensation.record', { person: person.person, ...ownEquity })
 const bundle = async () => {
  const response = await h.raw('/app/exports/employees.zip?scope=self&fields=name&history=employment', { cookie })
  assert.equal(response.status, 200)
  return JSON.parse(readZip(Buffer.from(await response.arrayBuffer())).get('records.json')).records[0]
 }
 const withheld = await bundle()
 assert.equal((withheld.compensationRecords?.bonus ?? []).length, 0)
 assert.equal((withheld.compensationRecords?.equity ?? []).length, 0)
 assert.ok(!JSON.stringify(withheld).includes(ownBonus.note) && !JSON.stringify(withheld).includes(ownEquity.security), 'A readable bundle cannot disclose ungranted award fields')
 await apply({ kind: 'level', level: level.id, name: 'synthetic-willow-903', permissions: [], compensationFields: { self: { bonus: 'view', equity: 'view', history: 'view' }, others: { bonus: 'edit', equity: 'edit', history: 'view' } } })
 const exported = await bundle()
 assert.deepEqual(exported.compensationRecords.bonus.map(row => [row.revision, row.amountCents]), [[correction.revision, 20025], [first.revision, 17551]])
 assert.deepEqual(exported.compensationRecords.equity.map(row => [row.revision, row.units]), [[equity.revision, '17.125']])

 const identifying = [key, `${key}@example.com`, person.person, member]
 const authoredText = identifying.join(' ')
 const peerBonus = await h.api('compensation.record', cookie, { person: peer.person, kind: 'bonus', effectiveDate: day(-8), amount: '425.75', currency: 'AUD', note: authoredText })
 const peerEquity = await h.api('compensation.record', cookie, { person: peer.person, kind: 'equity', effectiveDate: day(-7), units: '8.0625', security: authoredText, note: authoredText })
 const peerBefore = (await api(`people/${peer.person}`)).compensationRecords
 await api('leaver.start', { period: person.period, template: templates.leaver, endDate: day(-1), reason: 'synthetic-willow-907' })
 for (const item of (await api(`people/${person.person}`)).cases.filter(row => row.status === 'open')) {
  for (const task of (await api(`cases/${item.id}`)).tasks.filter(row => row.status === 'open')) await api('task.complete', { task: task.id, evidence: 'synthetic-willow-908' })
  await api('case.complete', { case: item.id })
 }
 const retention = await api('retention')
 await api('retention.adopt', { version: retention.tableVersion })
 const hold = await api('hold.place', { scope: 'person', ref: person.person, reason: 'synthetic-willow-909', reviewDate: day(30) })
 await api('erasure.request', { person: person.person, source: 'own_request', receivedOn: today })
 const preview = await api(`erasure/preview?person=${person.person}`)
 assert.deepEqual(preview.blockers, [])
 const ownItem = preview.items.find(row => row.id === 'comp_records'), authoredItem = preview.items.find(row => row.id === 'wl_comp_records:recorded_by')
 assert.deepEqual([ownItem.rows, ownItem.class, ownItem.disposition, ownItem.hold], [3, 'payroll', 'held', hold.id])
 assert.deepEqual([authoredItem.rows, authoredItem.disposition, authoredItem.hold], [2, 'held', hold.id])
 const erased = await api('erasure.confirm', { person: person.person, digest: preview.digest })
 await api(`people/${person.person}`, undefined, 404)
 await h.api('me', cookie, undefined, 401)
 const receipt = await api(`erasure/receipts/${erased.receipt}`)
 assert.equal(receipt.counts.find(row => row.store === 'comp_records').rows, 3)
 assert.equal(receipt.scrubbed.wl_comp_records, 2)
 const custody = (await api('retained')).records.filter(row => row.person === erased.label)
 const owned = custody.filter(row => row.store === 'comp_records')
 assert.equal(owned.length, 3)
 assert.ok(owned.every(row => row.hold === hold.id && row.class === 'payroll'))
 assert.deepEqual(owned.filter(row => row.values.kind === 'bonus').map(row => row.values.amount_cents).sort((a, b) => a - b), [17551, 20025])
 assert.equal(owned.find(row => row.values.kind === 'equity').values.units, '17.125')
 const heldAuthorship = custody.filter(row => row.store === 'wl_comp_records:recorded_by')
 assert.equal(heldAuthorship.length, 2)
 assert.ok(heldAuthorship.every(row => row.hold === hold.id && row.values.recorded_by === member), 'Only restricted custody preserves held original authorship')
 await h.api('retained', staff.hr.cookie, undefined, 403)
 await h.api('retained', staff.employee.cookie, undefined, 403)
 const peerAfter = (await api(`people/${peer.person}`)).compensationRecords
 const financial = records => [...records.bonus, ...records.equity].map(row => ({ id: row.id, revision: row.revision, effectiveDate: row.effectiveDate, amountCents: row.amountCents, currency: row.currency, units: row.units })).sort((a, b) => a.id.localeCompare(b.id))
 assert.deepEqual(financial(peerAfter), financial(peerBefore), 'Erasing an author preserves the peer’s committed financial values and immutable revisions')
 assert.ok(peerAfter.bonus.some(row => row.id === peerBonus.id) && peerAfter.equity.some(row => row.id === peerEquity.id))
 for (const value of identifying) assert.ok(!JSON.stringify(peerAfter).includes(value), 'The surviving peer projection contains no erased author identifier')
 assert.ok(peerAfter.bonus[0].note.includes(erased.label) && peerAfter.equity[0].security.includes(erased.label), 'Free-text attribution is scrubbed in the native surviving awards')
 console.log('ROLE-005 compensation custody: PASS — permission-aware bundle, held award versions, owner-only custody, subject erasure and retained peer financial values with scrubbed authorship')
 return { erased, peer, first, correction, equity, peerBonus, peerEquity }
}
