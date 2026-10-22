// ROLE-012: built-in selections admit rows, never add field or operational rights.
import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'
import { readZip } from './export-reader.mjs'

export const selectedBuiltinIds = ['builtin-headcount', 'builtin-payroll']

// Shared public-door fixture; the browser creates its own level through native forms.
export async function builtinSelectionFixture(h, owner, fx, n = 12000) {
 const api = (path, body, status) => h.api(path, owner, body, status)
 const reader = fx.staff.managerb
 const read = (path, body, status) => h.api(path, reader.cookie, body, status)
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 const assign = levels => apply({ kind: 'assignment', member: reader.member, levels })
 await assign([])
 const location = await api('location.create', { name: `synthetic-willow-${n}`, timezone: 'UTC' })
 const outside = await api('location.create', { name: `synthetic-willow-${n + 1}`, timezone: 'UTC' })
 const near = await fx.join(`synthetic-willow-${n + 2}`, { locationId: location.id, jobTitle: `synthetic-willow-${n + 3}`, payAmount: '93456.78' })
 const far = await fx.join(`synthetic-willow-${n + 4}`, { locationId: outside.id, jobTitle: `synthetic-willow-${n + 5}`, payAmount: '76543.21' })
 const catalog = await api('builtin-reports')
 for (const id of selectedBuiltinIds) assert.ok(catalog.some(report => report.id === id))
 const hidden = catalog.find(report => !selectedBuiltinIds.includes(report.id))
 assert.ok(hidden, 'The fixture selects a subset of the built-in library')
 return { api, read, apply, assign, reader, location, outside, near, far, catalog, hidden, scope: { kind: 'group', dimensions: { location: [location.id] } } }
}

export async function builtinSelectionProof(h, owner, fx) {
 const ctx = await builtinSelectionFixture(h, owner, fx)
 const { api, read, apply, assign, reader, location, outside, near, far, catalog, hidden, scope } = ctx
 await read('builtin-reports', undefined, 403)
 const plan = { kind: 'level', name: 'synthetic-willow-12006', permissions: [], scope, reports: selectedBuiltinIds, compensationFields: { self: {}, others: {} } }
 const level = await apply(plan)
 const reviewed = await api('level.preview', { kind: 'assignment', member: reader.member, levels: [level.id] })
 assert.deepEqual(reviewed.impact[0].afterReports.flatMap(source => source.reports).sort(), [...selectedBuiltinIds].sort())
 await api('level.apply', { review: reviewed.id })
 const list = () => read('builtin-reports')
 assert.deepEqual((await list()).map(report => report.id).sort(), [...selectedBuiltinIds].sort())
 const reach = async person => (await api(`preview?member=${reader.member}&person=${person}`)).reportSelections
 for (const person of [near.person, far.person]) {
  const selections = await reach(person)
  assert.deepEqual(selections.map(report => report.id).sort(), [...selectedBuiltinIds].sort())
  for (const report of selections) {
   assert.equal(report.name, catalog.find(item => item.id === report.id).name)
   assert.equal(report.withheldFromYou, false)
   assert.equal(report.reachesThisPerson, person === near.person)
  }
 }
 const result = id => read(`builtin-reports/${id}`)
 for (const id of selectedBuiltinIds) {
  const report = await result(id)
  assert.equal(report.id, id)
  assert.deepEqual(report.rows.map(row => row.personId), [near.person])
  assert.ok(!JSON.stringify(report).includes(`synthetic-willow-12004`))
  assert.ok(!JSON.stringify(report).includes('93456.78'))
 }
 const payroll = await result('builtin-payroll')
 assert.equal(payroll.rows[0].cells.payAmount, null)
 assert.ok(payroll.rows[0].withheld.includes('payAmount'))
 assert.equal((await read(`people/${near.person}`)).pay, undefined)
 assert.equal((await read(`people/${near.person}`)).private, undefined)
 assert.deepEqual((await read('me')).permissions, [])
 const downloads = async (id, payVisible) => {
  for (const format of ['csv', 'xlsx']) {
   const response = await h.raw(`/app/reports/library/${id}.${format}`, { cookie: reader.cookie })
   assert.equal(response.status, 200)
   assert.ok(response.headers.get('content-disposition').startsWith('attachment;'))
   assert.ok(response.headers.get('cache-control').includes('no-store'))
   const bytes = Buffer.from(await response.arrayBuffer())
   const text = format === 'csv' ? bytes.toString() : [...readZip(bytes).values()].map(part => part.toString()).join('')
   assert.ok(text.includes('synthetic-willow-12002'))
   assert.ok(!text.includes('synthetic-willow-12004') && !text.includes('76543.21'))
   assert.equal(text.includes('93456.78'), payVisible)
   if (id === 'builtin-payroll' && !payVisible) assert.ok(text.includes('Withheld'))
  }
 }
 for (const id of selectedBuiltinIds) {
  assert.equal((await h.raw(`/app/reports/library/${id}`, { cookie: reader.cookie })).status, 200)
  await downloads(id, false)
 }
 await read(`builtin-reports/${hidden.id}`, undefined, 404)
 for (const suffix of ['', '.csv', '.xlsx']) assert.equal((await h.raw(`/app/reports/library/${hidden.id}${suffix}`, { cookie: reader.cookie })).status, 404)
 const definition = { name: 'synthetic-willow-12007', columns: ['name', 'payAmount'], asOf: 'today', status: 'active' }
 const saved = await api('report.save', { definition })
 await read(`custom-reports/${saved.id}`, undefined, 404)
 await read('report.save', { definition }, 403)
 await read('report.save', { report: 'builtin-payroll', definition }, 403)
 await read('report.schedule', { report: 'builtin-payroll', version: 'synthetic-willow-12008', firstDate: day(1), cadenceDays: 7, recipients: [reader.member], enabled: true }, 403)
 for (const door of ['reports', 'payroll']) await read(door, undefined, 403)
 await read('payroll.export', { batch: 'synthetic-willow-12009' }, 403)
 assert.equal((await h.raw('/app/exports/employees.csv?scope=organization&fields=name,phone', { cookie: reader.cookie })).status, 403)

 await apply({ ...plan, level: level.id, compensationFields: { others: { pay: 'view' } } })
 const visiblePay = await result('builtin-payroll')
 assert.equal(visiblePay.rows[0].cells.payAmount, 'AUD 93456.78 salary')
 assert.ok(!visiblePay.rows[0].withheld.includes('payAmount'))
 await downloads('builtin-payroll', true)
 const record = await api(`people/${near.person}`)
 await read('compensation.pay', { person: near.person, period: near.period, revision: record.employment.find(period => period.id === near.period).revision, effectiveFrom: day(1), payBasis: 'salary', payAmount: '1', reason: 'synthetic-willow-12010' }, 403)
 await read('payroll', undefined, 403)
 await apply({ ...plan, level: level.id })
 assert.equal((await result('builtin-payroll')).rows[0].cells.payAmount, null)

 // Scope follows current terms; it is not frozen when a selection is assigned.
 const moved = await api('mover.schedule', { period: near.period, locationId: outside.id, effectiveFrom: day(0), reason: 'synthetic-willow-12011' })
 for (const id of selectedBuiltinIds) assert.deepEqual((await result(id)).rows, [])
 assert.ok((await reach(near.person)).every(report => !report.reachesThisPerson))
 await api('terms.cancel', { terms: moved.terms, reason: 'synthetic-willow-12012' })
 assert.deepEqual((await result('builtin-headcount')).rows.map(row => row.personId), [near.person])
 assert.equal((await api(`people/${near.person}`)).current.location.id, location.id)

 // Removing one selection keeps the independent selected definition usable.
 await apply({ ...plan, level: level.id, reports: ['builtin-headcount'] })
 assert.deepEqual((await list()).map(report => report.id), ['builtin-headcount'])
 await read('builtin-reports/builtin-payroll', undefined, 404)
 for (const suffix of ['', '.csv', '.xlsx']) assert.equal((await h.raw(`/app/reports/library/builtin-payroll${suffix}`, { cookie: reader.cookie })).status, 404)
 await downloads('builtin-headcount', false)
 await assign([])
 await read('builtin-reports', undefined, 403)
 assert.deepEqual(await reach(near.person), [])
 for (const id of selectedBuiltinIds) {
  await read(`builtin-reports/${id}`, undefined, 403)
  for (const suffix of ['', '.csv', '.xlsx']) assert.equal((await h.raw(`/app/reports/library/${id}${suffix}`, { cookie: reader.cookie })).status, 403)
 }
 assert.equal((await h.raw('/app/reports/library', { cookie: reader.cookie })).status, 403)
 console.log('ROLE-012: PASS — exact built-in selection, current scope, field-filtered JSON/page/CSV/XLSX, no edit/schedule/general/payroll authority, combined preview and same-session revocation')
 return ctx
}
