// PEOPLE-003: dated record tables, company assets and certifications through the migrated Worker's public doors.
import assert from 'node:assert/strict'
import { file, harness } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'
import { imports } from './import-transport.mjs'
import { readZip } from './export-reader.mjs'
import { browserEvidence } from './record-tables-browser.mjs'

const table = (person, key) => person.recordTables.tables.find(item => item.key === key)
const keys = person => person.recordTables.tables.map(item => item.key).sort()
const hasNone = (value, secrets) => secrets.forEach(secret => assert.ok(!JSON.stringify(value).includes(secret), `PEOPLE-003 withholds ${secret}`))
const encodeCsv = rows => rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n'
const SECRETS = ['CONTACT-PHONE-111', 'CONTACT-PHONE-222', 'VISA-SECRET-CA']

const h = await harness()
let fresh
try {
  await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const { api, staff: s, templates } = await fixture(h, owner)
  const person = s.employee.person, hr = s.hr.cookie
  const record = await api(`people/${person}`)
  await api('person.update', { person, revision: record.revision, legalName: 'Elena Patel', preferredName: '', workEmail: record.workEmail, employeeNumber: 'E-1001' })
  const write = (body, cookie = hr, status = 200) => h.api('recordRow.write', cookie, body, status)
  const read = (cookie, asOf) => h.api(`people/${person}${asOf ? `?asOf=${asOf}` : ''}`, cookie)

  // Two emergency contacts with one primary; the person writes their own, a manager cannot reach them.
  await write({ person, table: 'emergency_contacts', effectiveFrom: day(-30), values: { name: 'Rosa Patel', relationship: 'Sister', phone: 'CONTACT-PHONE-111', primary: true } })
  await write({ person, table: 'emergency_contacts', values: { name: 'Second primary', phone: '555', primary: true } }, hr, 409)
  await write({ person, table: 'emergency_contacts', effectiveFrom: day(-30), values: { name: 'Dev Patel', relationship: 'Partner', phone: 'CONTACT-PHONE-222', primary: false } }, s.employee.cookie)
  await write({ person, table: 'emergency_contacts', values: { name: 'Manager guess', phone: '1', primary: false } }, s.managera.cookie, 404)
  // Typed built-in columns: a certification near expiry, education and a laptop asset.
  const certification = await write({ person, table: 'certifications', effectiveFrom: day(-60), values: { name: 'Forklift license', issuer: 'State board', number: 'FL-778', issued_on: day(-345), expires_on: day(20) } })
  const education = await write({ person, table: 'education', effectiveFrom: day(-60), values: { institution: 'State University', credential: 'BSc', field: 'Logistics', completed_on: day(-2000) } })
  for (const values of [{ type: 'Laptop', serial: 'SN-1', assigned_on: day(-90), condition: 'shiny' }, { type: 'Laptop', assigned_on: day(-90), condition: 'good' },
    { type: 'Laptop', serial: 'SN-1', assigned_on: day(-90), returned_on: day(-91), condition: 'good' }, { type: 'Laptop', serial: 'SN-1', assigned_on: day(-90), condition: 'good', colour: 'grey' }]) await write({ person, table: 'assets', values }, hr, 400)
  await write({ person, table: 'assets', values: { type: 'Laptop', serial: 'SN-1', assigned_on: day(-90), condition: 'good' } }, s.employee.cookie, 403)
  const laptop = await write({ person, table: 'assets', effectiveFrom: day(-90), values: { type: 'Laptop', serial: 'SN-LAPTOP-42', description: 'MacBook Pro 14', assigned_on: day(-90), condition: 'good' } })

  // Custom tables use PEOPLE-001's typed columns and classification rules.
  const visaColumns = [{ key: 'country', label: 'Country', type: 'text', required: true, validation: { maxLength: 60 } }, { key: 'expires_on', label: 'Expires on', type: 'date', required: true, validation: {} }]
  for (const cookie of [s.managera.cookie, s.employee.cookie, s.payroll.cookie]) await h.api('recordTable.define', cookie, { key: 'visas', classification: 'hr', label: 'Work visas', columns: visaColumns }, 403)
  await h.api('recordTable.define', hr, { key: 'visas', classification: 'hr', label: 'Work visas', columns: visaColumns, employeeRead: true }, 400)
  await h.api('recordTable.define', hr, { key: 'visas', classification: 'hr', label: 'Work visas', columns: [{ key: 'country', label: 'Country', type: 'colour', required: true, validation: {} }] }, 400)
  const visas = await h.api('recordTable.define', hr, { key: 'visas', classification: 'hr', label: 'Work visas', columns: visaColumns })
  await h.api('recordTable.define', hr, { table: visas.id, classification: 'general', label: 'Work visas', columns: visaColumns }, 400)
  await write({ person, table: 'visas', values: { country: 'VISA-SECRET-CA', expires_on: '2027-02-30' } }, hr, 400)
  await write({ person, table: 'visas', values: { country: 'VISA-SECRET-CA', expires_on: day(200) } })

  // Each level reads only its tables, on every door.
  assert.deepEqual(keys(await read(s.employee.cookie)), ['assets', 'certifications', 'education', 'emergency_contacts'], 'PEOPLE-003 employee reads own contacts and general tables')
  const managerView = await read(s.managera.cookie)
  assert.deepEqual(keys(managerView), ['assets', 'certifications', 'education'], 'PEOPLE-003 manager reads general tables only')
  hasNone(managerView, SECRETS)
  const hrView = await read(hr)
  assert.deepEqual(keys(hrView), ['assets', 'certifications', 'education', 'emergency_contacts', 'visas'], 'PEOPLE-003 HR reads every table')
  assert.equal(table(hrView, 'emergency_contacts').rows.length, 2)
  assert.deepEqual(table(hrView, 'emergency_contacts').rows.map(row => row.values.primary).sort(), [false, true])
  assert.deepEqual(keys(await read(s.payroll.cookie)), [], 'PEOPLE-003 payroll without people access reads no tables')
  hasNone(await h.api(`context/${person}`, s.managera.cookie), SECRETS)
  assert.deepEqual(keys((await h.api(`context/${person}`, s.employee.cookie)).record), ['assets', 'certifications', 'education', 'emergency_contacts'])
  assert.ok((await api('audit')).some(event => event.action === 'recordTable.private.read' && event.subject === person && event.actor !== s.employee.member), 'PEOPLE-003 private table reads are audited')
  const preview = await api(`preview?member=${s.managera.member}&person=${person}`)
  hasNone(preview, SECRETS)
  // A visibility change governs current and historical reads at once.
  await h.api('recordTable.define', hr, { table: 'assets', label: 'Company assets', employeeRead: true })
  for (const asOf of [undefined, day(-40)]) assert.equal(table(await read(s.managera.cookie, asOf), 'assets'), undefined, 'PEOPLE-003 manager loses assets on every date')
  await h.api('recordTable.define', hr, { table: 'assets', label: 'Company assets', employeeRead: true, columns: [] }, 400)
  await h.api('recordTable.define', hr, { table: 'assets', label: 'Company assets', employeeRead: true, managerRead: true })

  // Rows are dated: a corrected asset and a removed education row keep their history.
  await write({ person, table: 'assets', row: laptop.id, effectiveFrom: day(-10), values: { type: 'Laptop', serial: 'SN-LAPTOP-42', description: 'MacBook Pro 14 (new battery)', assigned_on: day(-90), condition: 'good' } })
  assert.equal(table(await read(hr, day(-20)), 'assets').rows[0].values.description, 'MacBook Pro 14')
  assert.equal(table(await read(hr), 'assets').rows[0].values.description, 'MacBook Pro 14 (new battery)')
  assert.equal(table(await read(hr), 'assets').rows[0].history.length, 2)
  await write({ person, table: 'education', row: education.id, remove: true })
  assert.equal(table(await read(hr), 'education').rows.length, 0)
  assert.equal(table(await read(hr), 'education').formerRows[0].history.length, 2)
  assert.equal(table(await read(hr, day(-1)), 'education').rows[0].values.credential, 'BSc')

  // Reports: one table across the people a reader may read it for.
  const report = await h.api('record-tables/assets', hr)
  assert.ok(report.rows.some(row => row.personId === person && row.values.serial === 'SN-LAPTOP-42'))
  assert.deepEqual((await h.api('record-tables/assets', s.employee.cookie)).rows.map(row => row.personId), [person])
  assert.equal((await h.api('record-tables/emergency_contacts', s.managera.cookie)).rows.length, 0)
  const reportCsv = await (await h.raw(`/app/reports/tables/assets.csv?asOf=${today}`, { cookie: hr })).text()
  assert.ok(reportCsv.includes('SN-LAPTOP-42') && reportCsv.includes('E-1001'))
  hasNone(await (await h.raw(`/app/reports/tables/visas.csv?asOf=${today}`, { cookie: s.managera.cookie })).text(), SECRETS)

  // Expiring and expired certifications create HR renewal work that a renewal closes.
  await write({ person: s.managerb.person, table: 'certifications', effectiveFrom: day(-400), values: { name: 'First aid', expires_on: day(-5) } })
  const renewals = async cookie => (await h.api('work', cookie)).items.filter(item => item.kind === 'renewal')
  const due = await renewals(hr)
  assert.deepEqual(due.map(item => item.dueDate).sort(), [day(-5), day(20)], 'PEOPLE-003 renewal work for near-expiry and expired certifications')
  assert.ok(due.find(item => item.dueDate === day(-5)).overdue)
  assert.deepEqual((await renewals(s.employee.cookie)).map(item => item.dueDate), [day(20)])
  assert.deepEqual(await renewals(s.managera.cookie), [])
  await write({ person, table: 'certifications', row: certification.id, values: { name: 'Forklift license', issuer: 'State board', number: 'FL-778', issued_on: today, expires_on: day(700) } })
  assert.deepEqual((await renewals(hr)).map(item => item.dueDate), [day(-5)], 'PEOPLE-003 renewal closes the work')

  // A leaver's held laptop becomes an IT return task that closes only with return evidence.
  const leaver = await api('leaver.start', { period: s.employee.period, endDate: day(5), reason: 'Relocating', template: templates.leaver })
  const tasks = (await api(`cases/${leaver.case}`)).tasks
  const returnTask = tasks.find(task => task.action === 'asset_return')
  assert.ok(returnTask && returnTask.title.includes('SN-LAPTOP-42') && returnTask.assignee === 'it' && returnTask.evidenceRequired, 'PEOPLE-003 device-return task')
  await api('task.complete', { task: tasks.find(task => task.action !== 'asset_return').id, evidence: 'Checklist reviewed' })
  await api('case.complete', { case: leaver.case }, 409)
  await h.api('task.complete', s.employee.cookie, { task: returnTask.id, evidence: 'I dropped it off', returnedOn: today, condition: 'good' }, 403)
  await api('task.complete', { task: returnTask.id, returnedOn: today, condition: 'good' }, 400)
  await api('task.complete', { task: returnTask.id, evidence: 'Received at IT desk' }, 400)
  await api('task.complete', { task: returnTask.id, evidence: 'Received at IT desk, ticket IT-91', returnedOn: today, condition: 'fair' })
  const returned = table(await read(hr), 'assets').rows[0]
  assert.equal(returned.values.returned_on, today)
  assert.equal(returned.values.condition, 'fair')
  await api('case.complete', { case: leaver.case })

  // Export the tables under the reader's level, then import them into a fresh employer.
  const bundle = async (cookie, scope) => readZip(Buffer.from(await (await h.raw(`/app/exports/employees.zip?${new URLSearchParams({ scope, fields: 'name,employeeNumber', person, history: 'tables' })}`, { cookie })).arrayBuffer()))
  const hrBundle = await bundle(hr, 'organization')
  assert.deepEqual(JSON.parse(hrBundle.get('records.json')).records[0].tables.tables.map(item => item.key).sort(), ['assets', 'certifications', 'education', 'emergency_contacts', 'visas'])
  assert.ok(hrBundle.get('tables/assets.csv').toString().includes('SN-LAPTOP-42'))
  const managerBundle = await bundle(s.managera.cookie, 'team')
  assert.ok(!managerBundle.has('tables/emergency_contacts.csv') && !managerBundle.has('tables/visas.csv'))
  hasNone([...managerBundle.values()].map(bytes => bytes.toString()), SECRETS)
  const zipBytes = Buffer.from(await (await h.raw(`/app/exports/employees.zip?${new URLSearchParams({ scope: 'organization', fields: 'name,employeeNumber', person, history: 'tables' })}`, { cookie: hr })).arrayBuffer())
  await browserEvidence(h, owner, s, person, leaver.case)

  fresh = await harness()
  await fresh.raw('/auth/bootstrap', { body: { token: fresh.vars.SETUP_TOKEN, displayName: 'Fresh Owner' } })
  const freshOwner = await fresh.signIn(fresh.vars.OWNER_EMAIL)
  await fresh.raw('/setup', { cookie: freshOwner, form: new URLSearchParams({ confirm: 'yes' }) })
  await fresh.api('employer.configure', freshOwner, { name: 'Fresh employer', timezone: 'UTC', country: 'AU', currency: 'AUD' })
  const transfer = imports(fresh, freshOwner)
  const input = { employees: file('employees.csv', encodeCsv([['employeeNumber', 'firstName', 'lastName', 'workEmail', 'hireDate', 'status', 'employmentStatus', 'jobTitle'], ['E-1001', 'Elena', 'Patel', 'elena@example.com', day(-100), 'Active', 'Full-Time', 'Analyst']])), tables: file('willow-records.zip', zipBytes) }
  const missing = await transfer.plan({ ...input, tables: file('visas.csv', hrBundle.get('tables/visas.csv')) })
  assert.ok(missing.rejected.some(row => row.reason.includes('no Willow record table "visas"')), 'PEOPLE-003 import names an undefined custom table')
  await transfer.undo(missing)
  await fresh.api('recordTable.define', freshOwner, { key: 'visas', classification: 'hr', label: 'Work visas', columns: visaColumns })
  const plan = await transfer.plan(input)
  assert.deepEqual(plan.rejected, [])
  assert.equal((await fresh.api('people', freshOwner)).length, 0, 'PEOPLE-003 import planning writes nothing')
  await transfer.apply(plan)
  assert.equal((await transfer.reconcile(plan)).ok, true)
  const [imported] = await fresh.api('people', freshOwner)
  const moved = await fresh.api(`people/${imported.id}`, freshOwner)
  assert.deepEqual(table(moved, 'emergency_contacts').rows.map(row => row.values.phone).sort(), ['CONTACT-PHONE-111', 'CONTACT-PHONE-222'])
  assert.deepEqual(table(moved, 'assets').rows.map(row => [row.values.serial, row.values.returned_on, row.values.condition]), [['SN-LAPTOP-42', today, 'fair']])
  assert.equal(table(moved, 'certifications').rows[0].values.expires_on, day(700))
  assert.equal(table(moved, 'visas').rows[0].values.country, 'VISA-SECRET-CA')
  await transfer.apply(await transfer.plan(input))
  assert.deepEqual(await fresh.api(`people/${imported.id}`, freshOwner), { ...moved, revision: (await fresh.api(`people/${imported.id}`, freshOwner)).revision }, 'PEOPLE-003 repeat import adds no rows')
  await transfer.undo(plan)
  await fresh.api(`people/${imported.id}`, freshOwner, undefined, 404)
} finally { await h.close(); await fresh?.close() }
console.log('PEOPLE-003 record tables: PASS')
