// EEO-002 on the production Worker: HR's title and establishment mappings, EEO compliance's frozen
// snapshot runs (hire, leaver, declined and no-category answers, an unmapped title, people outside
// the period), reconciliation to the roster, the drill-down and the per-table suppressed aggregate.
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { fixture } from './regression-fixture.mjs'
import { browserEvidence } from './eeo-snapshot-browser.mjs'

const h = await harness()
const FROM = '2025-10-01', TO = '2025-12-31'
const after = date => new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const f = await fixture(h, owner), s = f.staff, api = f.api
  const as = (who, path, body, status) => h.api(path, who === 'owner' ? owner : s[who].cookie, body, status)
  const get = (who, path, status) => as(who, path, undefined, status)
  const oakland = await api('location.create', { name: 'Oakland', timezone: 'UTC', workState: 'CA' })
  const austin = await api('location.create', { name: 'Austin', timezone: 'UTC', workState: 'TX' })
  const denver = await api('location.create', { name: 'Denver', timezone: 'UTC', workState: 'CO' })

  // People employed around the 2025 fourth-quarter snapshot, each at a location with a title.
  const staff = {}
  const hire = async (key, title, location, startDate, answers) => {
    const joined = await f.join(key, { startDate, jobTitle: title })
    await api('mover.schedule', { period: joined.period, effectiveFrom: after(startDate), locationId: location.id, jobTitle: title, reason: 'Placed' })
    await api('access.give', { person: joined.person })
    const cookie = await h.signIn(`${key}@example.com`, { requested: true })
    if (answers) await h.api('eeo.self.write', cookie, answers)
    return (staff[key] = { ...joined, cookie })
  }
  await hire('anna', 'Engineer', oakland, '2025-02-01', { hispanic: 'no', races: ['asian'], sex: 'female' })
  await hire('ben', 'Engineer', austin, '2025-02-01', { hispanic: 'yes', sex: 'male' })
  await hire('cara', 'Sales Rep', oakland, '2025-10-14', { hispanic: 'declined', sex: 'declined' })
  const dev = await hire('dev', 'Analyst', austin, '2025-03-01', { hispanic: 'no', races: ['white'], sex: 'male' })
  await hire('gus', 'Mystery Role', oakland, '2025-03-01', { hispanic: 'no', races: ['white'], sex: 'nonbinary' })
  const frank = await hire('frank', 'Engineer', oakland, '2024-01-01', { hispanic: 'no', races: ['asian'], sex: 'male' })
  await api('leaver.start', { period: dev.period, template: f.templates.leaver, endDate: '2025-11-20', reason: 'Resigned' })
  await api('leaver.start', { period: frank.period, template: f.templates.leaver, endDate: '2025-06-30', reason: 'Resigned' })
  await hire('erin', 'Engineer', oakland, '2026-01-15', { hispanic: 'no', races: ['asian'], sex: 'female' })
  for (let i = 0; i < 5; i++) await hire(`denver${i}`, 'Technician', denver, '2025-04-01', { hispanic: 'no', races: ['black_african_american'], sex: 'female' })

  // Mappings are HR's; managers and the aggregate-only reader are refused.
  await as('managera', 'eeo.title', { title: 'Engineer', category: 'professionals' }, 403)
  await as('managera', 'eeo/mappings', undefined, 403)
  await as('hr', 'eeo.title', { title: 'Engineer', category: 'astronaut' }, 400)
  for (const [title, category] of [['Engineer', 'professionals'], ['Sales Rep', 'sales'], ['Analyst', 'professionals'], ['Technician', 'technicians']]) await as('hr', 'eeo.title', { title: ` ${title.toUpperCase()} `, category })
  await as('hr', 'eeo.establishment', { location: oakland.id, address: '1 Broadway, Oakland CA', naics: '541511', headquarters: true })
  await as('hr', 'eeo.establishment', { location: austin.id, address: '2 Congress Ave, Austin TX' })
  await as('hr', 'eeo.establishment', { location: denver.id, address: '3 Larimer St, Denver CO', naics: '541511' })
  await as('hr', 'eeo.establishment', { location: denver.id, naics: '54151' }, 400)
  const mappings = await get('hr', 'eeo/mappings')
  assert.deepEqual(mappings.titles.filter(t => !t.category).map(t => t.title).sort(), ['Mystery Role', 'Present role'])
  assert.equal(JSON.stringify(mappings).includes('hispanic'), false, 'mappings hold no EEO values')

  // Running the report needs EEO compliance: HR without the grant, the owner and managers are refused.
  for (const who of ['hr', 'owner', 'managera']) await as(who, 'eeo.run', { from: FROM, to: TO }, 403)
  for (const who of ['hr', 'managera']) await get(who, 'eeo/runs', 403)
  assert.deepEqual(await get('owner', 'eeo/runs'), [], 'the owner reads only the aggregate list without the grant')
  await as('owner', 'eeo.grant', { member: s.hr.member, enabled: true })
  await as('hr', 'eeo.run', { from: '2025-09-30', to: TO }, 400)
  await as('hr', 'eeo.run', { from: '2025-12-01', to: '2026-01-05' }, 400)
  await as('hr', 'eeo.run', { from: FROM, to: '2099-12-31' }, 400)
  const first = await as('hr', 'eeo.run', { from: FROM, to: TO })
  const report = await get('hr', `eeo/runs/${first.id}`)
  // Counts reconcile to the roster: the hire, the leaver and a person without a category are on it; the people before and after are not.
  assert.equal(report.roster, 10)
  assert.equal(report.reconciles, true)
  assert.equal(report.cells.reduce((sum, c) => sum + c.count, 0), 10)
  assert.equal(report.establishments.find(e => e.name === 'Oakland').count, 3)
  assert.equal(report.establishments.find(e => e.name === 'Austin').count, 2)
  assert.deepEqual(report.excluded.map(e => e.person.id).includes(frank.person) && report.excluded.map(e => e.person.id).includes(staff.erin.person), true)
  assert.equal(report.excluded.some(e => e.person.id === staff.dev.person), false, 'the leaver on payroll in the period is counted')
  assert.equal(report.excluded.some(e => e.person.id === staff.cara.person), false, 'the hire in the period is counted')
  assert.equal(report.payPeriod, 'matches no recorded payroll pay period')
  assert.equal(report.filing, null)
  assert.match(report.notice, /US-002/)
  const flags = Object.fromEntries(report.flags.map(row => [row.flag, row.count]))
  assert.equal(flags.declined_race, 1, 'the declined hire is flagged')
  assert.equal(flags.declined_sex, 1)
  assert.equal(flags.unmapped_title, 1)
  assert.equal(flags.no_category_in_rule_sex, 1, 'Nonbinary stays as answered and is flagged')
  assert.equal(flags.establishment_incomplete, 2)
  assert.equal(report.noFilingValue, 2)
  const noFiling = report.cells.filter(c => c.race === 'no_filing_value' || c.sex === 'no_filing_value').reduce((sum, c) => sum + c.count, 0)
  assert.equal(noFiling, 2, 'people without a filing value sit in an explicit row')
  assert.deepEqual(report.runFlags, [])
  // The drill-down names the people behind a flag, with their filing values and sources.
  const declined = await get('hr', `eeo/runs/${first.id}/people?flag=declined_race`)
  assert.deepEqual(declined.people.map(p => [p.id, p.race]), [[staff.cara.person, null]])
  const cell = report.cells.find(c => c.establishment === oakland.id && c.category === 'professionals')
  const behind = await get('hr', `eeo/runs/${first.id}/people?establishment=${cell.establishment}&category=${cell.category}&sex=${cell.sex}&race=${cell.race}`)
  assert.equal(behind.people.length, cell.count)
  assert.match(behind.people[0].race.source, /self-identified/)
  await get('hr', `eeo/runs/${first.id}/people?salary=1`, 400)

  // Map the missing title, record a category for the decliner from employment records, and rerun: the first run is frozen.
  await as('hr', 'eeo.title', { title: 'Mystery Role', category: 'service' })
  await as('hr', 'eeo.record', { person: staff.cara.person, dimension: 'race_ethnicity', category: 'white', employmentRecord: 'synthetic-willow-record-2', ruleVersion: 'eeo1-component1-2024' })
  const second = await as('hr', 'eeo.run', { from: FROM, to: TO })
  const rerun = await get('hr', `eeo/runs/${second.id}`)
  const rerunFlags = Object.fromEntries(rerun.flags.map(row => [row.flag, row.count]))
  assert.equal(rerunFlags.unmapped_title, undefined)
  assert.equal(rerunFlags.declined_race, undefined)
  assert.equal(rerunFlags.declined_sex, 1)
  assert.deepEqual((await get('hr', `eeo/runs/${first.id}`)).cells, report.cells, 'a frozen run never changes')
  const caraRow = (await get('hr', `eeo/runs/${second.id}/people?flag=declined_sex`)).people[0]
  assert.match(caraRow.race.source, /^HR-recorded from employment records/)
  assert.equal((await get('hr', 'eeo/runs')).length, 2)

  // A manager cannot open the report, its drill-down or its aggregate; the aggregate reader sees per-table suppressed counts only.
  for (const path of [`eeo/runs/${first.id}`, `eeo/runs/${first.id}/people`, `eeo/runs/${first.id}/aggregate`]) await get('managera', path, 403)
  for (const path of [`/app/eeo/runs/${first.id}`, `/app/eeo/runs/${first.id}/people`, '/app/eeo/runs', '/app/eeo/mappings']) assert.equal((await h.raw(path, { cookie: s.managera.cookie })).status, 403)
  await as('owner', 'member.permissions', { member: s.managerb.member, permissions: ['reports.read', 'eeo.read'] })
  for (const path of [`eeo/runs/${first.id}`, `eeo/runs/${first.id}/people`]) await get('managerb', path, 403)
  const aggregate = await get('managerb', `eeo/runs/${first.id}/aggregate`)
  const tables = Object.fromEntries(aggregate.tables.map(t => [t.name, t]))
  for (const name of ['Company', 'Oakland', 'Austin']) assert.deepEqual([tables[name].suppressed, tables[name].total, tables[name].cells], [true, null, []], `${name} is withheld whole`)
  assert.deepEqual([tables.Denver.suppressed, tables.Denver.total, tables.Denver.cells.length, tables.Denver.cells[0].count], [false, 5, 1, 5])
  assert.ok(![...Object.values(staff), ...Object.values(s)].some(row => row.person && JSON.stringify(aggregate).includes(row.person)) && !JSON.stringify(aggregate).includes('@example'), 'the aggregate names no one')
  assert.equal((await h.raw(`/app/eeo/runs/${first.id}/aggregate`, { cookie: s.managerb.cookie })).status, 200)
  const audit = await api('audit')
  for (const action of ['eeo.run.create', 'eeo.run.read', 'eeo.run.drill', 'eeo.run.aggregate.read', 'eeo.title.map', 'eeo.establishment.map']) assert.ok(audit.some(e => e.action === action), action)
  assert.ok(audit.filter(e => e.action.startsWith('eeo.run')).every(e => !/asian|white|female|male/.test(e.detail)), 'audit rows carry no values')

  const pages = await (await h.raw(`/app/eeo/runs/${first.id}`, { cookie: s.hr.cookie })).text()
  assert.ok(pages.includes('Reconciliation') && pages.includes('Pre-filing check'))
  await browserEvidence(h, { hr: s.hr.cookie, aggregate: s.managerb.cookie }, first.id)
  console.log('EEO-002 snapshot: passed')
} finally { await h.close() }
