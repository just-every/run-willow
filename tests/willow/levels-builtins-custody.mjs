// ROLE-012: every built-in stays scoped; compliance reports show native custody only.
import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'
import { builtinSelectionFixture } from './levels-builtins.mjs'
import { readZip } from './export-reader.mjs'

export async function builtinCustodyProof(h, owner, fx) {
 const ctx = await builtinSelectionFixture(h, owner, fx, 12200)
 const { api, read, apply, assign, reader, near, far, outside, catalog, scope } = ctx
 const file = n => ({ filename: `synthetic-willow-${n}.txt`, base64: Buffer.from(`synthetic-willow-${n}`).toString('base64') })
 const category = await api('category.create', { name: 'synthetic-willow-12206', subjectReads: true, managerReads: false, acknowledgement: true })
 const privateCategory = await api('category.create', { name: 'synthetic-willow-12207', subjectReads: false, managerReads: false, acknowledgement: true })
 for (const ref of [category.id, privateCategory.id]) await api('retention.map', { kind: 'document_category', ref, class: 'i9' })
 await read('retention.map', { kind: 'document_category', ref: category.id, class: 'personnel' }, 403)
 const published = await api('document.add', { person: near.person, category: category.id, title: 'synthetic-willow-12208', file: file(12209) })
 const privateDocument = await api('document.add', { person: near.person, category: privateCategory.id, title: 'synthetic-willow-12210', file: file(12211) })
 const outsideDocument = await api('document.add', { person: far.person, category: category.id, title: 'synthetic-willow-12212', file: file(12213) })
 await api('leaver.start', { period: far.period, endDate: day(-1), reason: 'synthetic-willow-12214', template: fx.templates.leaver })
 await api('access.give', { person: near.person })
 const subjectCookie = await h.signIn('synthetic-willow-12202@example.com', { requested: true })
 const reportIds = catalog.map(report => report.id)
 const plan = { kind: 'level', name: 'synthetic-willow-12215', permissions: [], reports: reportIds, scope }
 const selection = await apply(plan)
 await assign([selection.id])
 assert.deepEqual((await read('builtin-reports')).map(report => report.id).sort(), [...reportIds].sort())
 const result = id => read(`builtin-reports/${id}`)
 const forbidden = ['93456.78', '76543.21', 'PRIVATE-synthetic-willow-12202', 'PRIVATE-synthetic-willow-12204', far.person, 'synthetic-willow-12204', 'synthetic-willow-12210', 'synthetic-willow-12211', 'synthetic-willow-12212', 'synthetic-willow-12213']
 const excludes = (value, extra = []) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const secret of [...forbidden, ...extra]) assert.ok(!text.includes(secret), `The selected result withholds ${secret}`)
 }
 const downloaded = async (id, format) => {
  const response = await h.raw(`/app/reports/library/${id}.${format}`, { cookie: reader.cookie })
  assert.equal(response.status, 200)
  const bytes = Buffer.from(await response.arrayBuffer())
  return format === 'csv' ? bytes.toString() : [...readZip(bytes).values()].map(part => part.toString()).join('')
 }
 const documentIds = ['builtin-i9-documents', 'builtin-document-receipts']
 // Every catalog entry is exercised through its own public result and file doors.
 for (const entry of catalog) {
  if (entry.id === 'builtin-diversity') {
   // Selecting this definition supplies neither independent protected aggregate right.
   await read(`builtin-reports/${entry.id}`, undefined, 403)
   for (const suffix of ['', '.csv', '.xlsx']) assert.equal((await h.raw(`/app/reports/library/${entry.id}${suffix}`, { cookie: reader.cookie })).status, 403)
   continue
  }
  const report = await result(entry.id)
  assert.equal(report.id, entry.id)
  assert.ok(report.rows.every(row => row.personId === near.person))
  excludes(report, ['synthetic-willow-12208', 'synthetic-willow-12209'])
  const page = await h.raw(`/app/reports/library/${entry.id}`, { cookie: reader.cookie })
  assert.equal(page.status, 200)
  excludes(await page.text(), ['synthetic-willow-12208', 'synthetic-willow-12209'])
  for (const format of ['csv', 'xlsx']) excludes(await downloaded(entry.id, format), ['synthetic-willow-12208', 'synthetic-willow-12209'])
 }
 const headcount = await result('builtin-headcount')
 assert.deepEqual(headcount.totals, { headcount: 1 }, 'A headcount selection returns no unrelated leaver, leave, pay or work totals')
 assert.deepEqual(headcount.rows.map(row => row.measures), [{ headcount: 1 }])
 for (const row of headcount.rows) for (const key of ['workSources', 'exceptionSources', 'overdueSources']) assert.equal(row[key], undefined)
 assert.equal(headcount.workCoverage, undefined)
 const actualTurnover = await api(`builtin-reports/builtin-turnover?from=${day(-101)}&to=${day(0)}`)
 assert.ok(actualTurnover.totals.turnover.sources.some(source => source.personId === far.person), 'A real out-of-scope leaver exists behind the filtered results')
 const selectedTurnover = await read(`builtin-reports/builtin-turnover?from=${day(-101)}&to=${day(0)}`)
 assert.equal(selectedTurnover.totals.turnover.withheld, true)
 assert.deepEqual(selectedTurnover.totals.turnover.sources, [])
 assert.deepEqual(selectedTurnover.totals.turnover.denominatorSources, [])
 assert.equal((await result('builtin-payroll')).rows[0].cells.payAmount, null)
 for (const id of documentIds) {
  const report = await result(id)
  assert.equal(report.totals.withheldPeople, 1)
  assert.ok(report.rows.every(row => row.cells.document === null && row.cells.filename === null && row.withheld.includes('document')))
 }
 assert.equal((await h.raw(`/app/files/document/${published.version}`, { cookie: reader.cookie })).status, 404)

 // Category access alone opens its files, and still grants no report admission.
 const categoryPlan = { kind: 'level', name: 'synthetic-willow-12216', permissions: [], documentCategories: { self: {}, others: { [category.id]: 'view' } } }
 const categoryLevel = await apply(categoryPlan)
 await assign([categoryLevel.id])
 await read('builtin-reports', undefined, 403)
 await read('builtin-reports/builtin-i9-documents', undefined, 403)
 const bytes = await h.raw(`/app/files/document/${published.version}?download=1`, { cookie: reader.cookie })
 assert.equal(bytes.status, 200)
 assert.equal(await bytes.text(), 'synthetic-willow-12209')
 await assign([selection.id, categoryLevel.id])
 const i9 = await result('builtin-i9-documents')
 assert.deepEqual(i9.totals, { readableDocuments: 1, withheldPeople: 1 })
 const actual = i9.rows.find(row => row.source === `/app/files/document/${published.version}?download=1`)
 assert.ok(actual)
 assert.equal(actual.cells.document, 'synthetic-willow-12208')
 assert.equal(actual.cells.filename, 'synthetic-willow-12209.txt')
 assert.ok(actual.cells.publishedAt)
 assert.deepEqual(actual.measures, { readableDocuments: 1 }, 'I-9 mapping reports custody, without creating a statutory completion or verification measure')
 excludes(i9)
 assert.equal((await h.raw(`/app/files/document/${outsideDocument.version}`, { cookie: reader.cookie })).status, 200, 'The independent category source reaches an excluded person')
 assert.equal((await h.raw(`/app/files/document/${privateDocument.version}`, { cookie: reader.cookie })).status, 404)
 const before = await result('builtin-document-receipts')
 assert.deepEqual(before.totals, { acknowledged: 0, awaitingAcknowledgement: 1, withheldPeople: 1 })
 const pendingReceipt = before.rows.find(row => row.cells.filename === 'synthetic-willow-12209.txt')
 assert.ok(pendingReceipt)
 assert.equal(pendingReceipt.cells.acknowledgedAt, null)
 assert.deepEqual(pendingReceipt.measures, { acknowledged: 0, awaitingAcknowledgement: 1 })
 await read('document.acknowledge', { version: published.version }, 404)
 await h.api('document.acknowledge', subjectCookie, { version: published.version })
 const after = await result('builtin-document-receipts')
 assert.deepEqual(after.totals, { acknowledged: 1, awaitingAcknowledgement: 0, withheldPeople: 1 })
 const receipt = after.rows.find(row => row.cells.filename === 'synthetic-willow-12209.txt')
 assert.ok(receipt.cells.acknowledgedAt)
 assert.notEqual(receipt.cells.receipt, pendingReceipt.cells.receipt)
 assert.deepEqual(receipt.measures, { acknowledged: 1, awaitingAcknowledgement: 0 })
 assert.deepEqual((await result('builtin-i9-documents')).totals, i9.totals, 'A receipt does not turn native document custody into verification')
 for (const id of documentIds) for (const format of ['csv', 'xlsx']) {
  const text = await downloaded(id, format)
  excludes(text)
  assert.ok(text.includes('synthetic-willow-12209.txt'))
 }

 // A later published version replaces the visible file and needs its own receipt.
 const next = await api('document.add', { document: published.id, file: file(12217) })
 const revised = await result('builtin-document-receipts')
 assert.deepEqual(revised.totals, { acknowledged: 0, awaitingAcknowledgement: 1, withheldPeople: 1 })
 assert.ok(revised.rows.some(row => row.cells.filename === 'synthetic-willow-12217.txt'))
 excludes(revised, ['synthetic-willow-12209.txt'])
 await h.api('document.acknowledge', subjectCookie, { version: published.version }, 409)
 await h.api('document.acknowledge', subjectCookie, { version: next.version })
 assert.equal((await result('builtin-document-receipts')).totals.acknowledged, 1)

 // Live report reach is independent from retained category/file authority.
 const moved = await api('mover.schedule', { period: near.period, locationId: outside.id, effectiveFrom: day(0), reason: 'synthetic-willow-12218' })
 for (const id of documentIds) assert.deepEqual((await result(id)).rows, [])
 assert.equal((await h.raw(`/app/files/document/${next.version}`, { cookie: reader.cookie })).status, 200)
 await api('terms.cancel', { terms: moved.terms, reason: 'synthetic-willow-12219' })
 assert.equal((await result('builtin-i9-documents')).totals.readableDocuments, 1)

 // Revoking the field source leaves selected report admission, with its fields withheld.
 await apply({ ...categoryPlan, level: categoryLevel.id, documentCategories: { self: {}, others: {} } })
 for (const id of documentIds) {
  const report = await result(id)
  assert.equal(report.totals.withheldPeople, 1)
  assert.ok(report.rows.every(row => row.cells.document === null && row.cells.filename === null))
  excludes(report, ['synthetic-willow-12208', 'synthetic-willow-12209', 'synthetic-willow-12217'])
  for (const format of ['csv', 'xlsx']) excludes(await downloaded(id, format), ['synthetic-willow-12208', 'synthetic-willow-12209', 'synthetic-willow-12217'])
 }
 assert.equal((await h.raw(`/app/files/document/${next.version}`, { cookie: reader.cookie })).status, 404)
 assert.deepEqual((await read('me')).permissions, [])

 // The protected definition uses the native complete-population aggregate and suppression.
 const submitted = await h.api('eeo.self.write', fx.staff.employee.cookie, { hispanic: 'no', races: ['asian'], sex: 'female' })
 assert.equal((await h.api('eeo/self', fx.staff.employee.cookie)).current.sequence, submitted.sequence)
 const native = await api(`eeo/report?asOf=${day(0)}`)
 assert.equal(native.suppressed, true)
 assert.equal(native.total, null)
 const diversity = await api(`builtin-reports/builtin-diversity?asOf=${day(0)}`)
 assert.equal(diversity.asOf, native.asOf)
 assert.equal(diversity.scope, native.scope)
 assert.deepEqual(diversity.totals, { total: native.total, suppressed: native.suppressed })
 const nativeCells = [...native.raceEthnicity, ...native.sex]
 assert.deepEqual(diversity.rows.map(row => ({ category: row.cells.category, count: row.cells.count, measure: row.measures.count, withheld: row.withheld.includes('count') })), nativeCells.map(cell => ({ category: cell.label, count: cell.count === null ? null : String(cell.count), measure: cell.count, withheld: cell.suppressed })))
 assert.ok(diversity.rows.every(row => row.personId === '' && row.source === `/app/eeo/report?asOf=${native.asOf}` && row.cells.count === null && row.measures.count === null))
 const noIndividual = value => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const person of [near.person, far.person, ...Object.values(fx.staff).map(staff => staff.person)]) assert.ok(!text.includes(person), 'Protected aggregates contain no individual identifiers')
  for (const key of ['raceEthnicity', 'sex', 'hispanic', 'races']) assert.ok(!text.includes(`${JSON.stringify(key)}:${JSON.stringify(submitted[key])}`), 'Protected aggregates contain no individual submission payload')
 }
 noIndividual(diversity)
 for (const key of ['answers', 'current', 'history', 'recorded']) assert.equal(diversity[key], undefined)
 const protectedPage = await h.raw('/app/reports/library/builtin-diversity', { cookie: owner })
 assert.equal(protectedPage.status, 200)
 noIndividual(await protectedPage.text())
 for (const format of ['csv', 'xlsx']) {
  const response = await h.raw(`/app/reports/library/builtin-diversity.${format}?asOf=${day(0)}`, { cookie: owner })
  assert.equal(response.status, 200)
  const bytes = Buffer.from(await response.arrayBuffer())
  const text = format === 'csv' ? bytes.toString() : [...readZip(bytes).values()].map(part => part.toString()).join('')
  noIndividual(text)
  assert.ok(text.includes('Withheld'), 'Suppressed counts stay withheld in exported aggregates')
 }
 // No alternate result or download door can turn this aggregate into a filtered drilldown.
 for (const [key, value] of [['department', 'synthetic-willow-12220'], ['location', outside.id], ['from', day(-1)], ['to', day(0)], ['person', fx.staff.employee.person]]) {
  const query = `${key}=${encodeURIComponent(value)}`
  await api(`builtin-reports/builtin-diversity?${query}`, undefined, 400)
  for (const suffix of ['', '.csv', '.xlsx']) assert.equal((await h.raw(`/app/reports/library/builtin-diversity${suffix}?${query}`, { cookie: owner })).status, 400)
 }
 await read('builtin-reports/builtin-diversity', undefined, 403)
 console.log('ROLE-012 custody: PASS — full catalog current scope/field withholding, isolated headcount measures, mapped I-9 custody and versioned receipts, category revocation, protected diversity admission/native suppression equivalence and no filtered drilldown')
}
