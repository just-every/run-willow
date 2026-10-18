// Date-selected people and organization flows, through real Worker HTTP doors.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { file, harness } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'

const h = await harness()
let browser
const screenshots = async (cookie, path, name, use) => {
  if (process.env.WILLOW_PEOPLE_BROWSER !== '1') return
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  browser ??= await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  await context.addCookies(cookie.split('; ').map(c => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: h.origin })))
  try {
    const page = await context.newPage()
    const directory = process.env.WILLOW_EVIDENCE_DIR
    assert.ok(directory, 'Screenshots must be outside the checkout')
    await mkdir(directory, { recursive: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(h.origin + path)
      if (use) await use(page)
      await page.evaluate(() => document.fonts.ready)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits ${width}`)
      await page.screenshot({ path: `${directory}/${name}-${width}.png`, fullPage: true })
      if (name === 'PEOPLE-002-directory') await page.screenshot({ path: `${directory}/${name}-top-${width}.png` })
    }
  } finally { await context.close() }
}

try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const { api, join, staff: s, templates, schedule } = await fixture(h, owner)
  await api('member.permissions', { member: s.hr.member, permissions: ['people.manage', 'people.private', 'documents.private', 'leave.manage', 'pay.read'] })
  s.hr.cookie = await h.signIn('hr@example.com')

  // PEOPLE-005: dates change versioned state, never the reader's current rights.
  const employee = await join('Avery Brooks', { workEmail: 'avery@example.com', startDate: day(-800), managerPersonId: s.managerb.person, jobTitle: 'Support Associate' })
  const department = (await api('department.create', { name: 'Customer Success' })).id
  const location = (await api('location.create', { name: 'Austin', timezone: 'America/Chicago' })).id
  const later = await api('mover.schedule', { period: employee.period, effectiveFrom: day(-365), jobTitle: 'Support Lead', departmentId: department, locationId: location, payBasis: 'salary', payAmount: '92000', reason: 'Annual review' })
  await api('mover.schedule', { period: employee.period, effectiveFrom: day(-200), managerPersonId: s.managera.person, reason: 'Reporting change' })
  const cancelled = await api('mover.schedule', { period: employee.period, effectiveFrom: day(-180), jobTitle: 'Cancelled role', reason: 'Plan withdrawn' })
  await api('terms.cancel', { terms: cancelled.terms, reason: 'Withdrawn' })
  const future = await api('mover.schedule', { period: employee.period, effectiveFrom: day(30), managerPersonId: s.managerb.person, jobTitle: 'Customer Success Manager', reason: 'Scheduled transfer' })
  const policy = await api('policy.write', { name: 'Historical PTO', summary: 'Versioned hours', accrualWeeks: '4', negativeLimitHours: '0' })
  await api('policy.approve', { version: policy.id })
  const account = await api('account.open', { period: employee.period, policy: policy.policy, cutoverDate: day(-700), openingHours: '80', note: 'Reconciled cutover' })
  await api('account.approve', { account: account.id })
  await api('leave.adjust', { account: account.id, hours: '-8', effectiveDate: day(-300), note: 'Historical leave used' })
  const request = await api('leave.request', { person: employee.person, account: account.id, startDate: day(5), endDate: day(5) })
  await h.api('leave.decide', s.managera.cookie, { request: request.id, decision: 'approve' })
  const category = (await api('category.create', { name: 'Historical shared contract', managerReads: true, subjectReads: true })).id
  const document = await api('document.add', { person: employee.person, category, title: 'Employment agreement', file: file('agreement-v1.txt', 'AGREEMENT-ONE') })
  const second = await api('document.add', { document: document.id, file: file('agreement-v2.txt', 'AGREEMENT-TWO') })
  const privateCategory = (await api('category.create', { name: 'HR restricted' })).id
  await api('document.add', { person: employee.person, category: privateCategory, title: 'PRIVATE-DOCUMENT', file: file('restricted.txt', 'PRIVATE-BYTES') })
  const dated = (date, cookie = s.hr.cookie) => h.api(`people/${employee.person}?asOf=${date}`, cookie)
  for (const [date, title, cents, manager] of [
    [day(-366), 'Support Associate', 8123456, s.managerb.person],
    [day(-365), 'Support Lead', 9200000, s.managerb.person],
    [day(-201), 'Support Lead', 9200000, s.managerb.person],
    [day(-200), 'Support Lead', 9200000, s.managera.person],
    [day(-180), 'Support Lead', 9200000, s.managera.person],
    [day(29), 'Support Lead', 9200000, s.managera.person],
    [day(30), 'Customer Success Manager', 9200000, s.managerb.person],
  ]) {
    const record = await dated(date)
    assert.equal(record.asOf, date)
    assert.equal(record.current.jobTitle, title)
    assert.equal(record.current.manager.id, manager)
    assert.equal(record.current.schedule.id, schedule)
    const selected = record.employment.flatMap(p => p.terms).filter(t => t.inForce)
    assert.equal(selected.length, 1)
    assert.equal(selected[0].pay.amountCents, cents)
    assert.notEqual(selected[0].id, cancelled.terms)
    assert.deepEqual((await h.api(`context/${employee.person}?asOf=${date}`, s.hr.cookie)).record, record)
    const page = await h.raw(`/app/people/${employee.person}?asOf=${date}`, { cookie: s.hr.cookie })
    assert.equal(page.status, 200)
    assert.ok((await page.text()).includes(`href="#terms-${selected[0].id}"`))
    const restricted = await dated(date, s.managera.cookie)
    const serialized = JSON.stringify(restricted)
    assert.ok(!restricted.pay && !restricted.private)
    assert.ok(!serialized.includes('amountCents') && !serialized.includes('PRIVATE-'))
    assert.ok(!restricted.documents.some(d => d.title === 'PRIVATE-DOCUMENT'))
  }
  assert.equal((await dated(day(-301))).leave.accounts[0].balanceMinutes, 4800)
  assert.equal((await dated(day(-300))).leave.accounts[0].balanceMinutes, 4320)
  assert.equal((await dated(day(4))).leave.accounts[0].balanceMinutes, 4320)
  assert.equal((await dated(day(5))).leave.accounts[0].balanceMinutes, 3840)
  assert.deepEqual((await dated(day(-1))).documents, [])
  assert.deepEqual((await dated(today)).documents.find(d => d.id === document.id).versions.map(v => v.id), [second.version, document.version])
  assert.equal((await dated(day(-1))).cases.length, 0, 'Cases not yet opened are absent')
  assert.equal((await dated(today)).cases.find(c => c.id === employee.case).openTasks, 1)
  const task = (await api(`cases/${employee.case}`)).tasks[0]
  await api('task.complete', { task: task.id })
  await api('case.complete', { case: employee.case })
  assert.equal((await dated(today)).cases.find(c => c.id === employee.case).status, 'completed')
  assert.ok((await api('audit')).some(e => e.action === 'person.private.read' && e.subject === employee.person && JSON.parse(e.detail).asOf === day(-365)))
  assert.equal((await dated(day(30))).current.scheduled, true)
  assert.equal((await dated(day(-366))).selectedPeriod, employee.period)
  await h.api(`people/${employee.person}?asOf=2026-02-30`, s.hr.cookie, undefined, 400)
  await h.api(`context/${employee.person}?asOf=bad`, s.hr.cookie, undefined, 400)
  // A future manager cannot obtain today's employment/document authority by selecting their future date.
  const futureManager = await dated(day(30), s.managerb.cookie)
  assert.ok(!futureManager.employment && !futureManager.documents && !futureManager.leave)
  await screenshots(s.hr.cookie, `/app/people/${employee.person}`, 'PEOPLE-005-current')
  await screenshots(s.hr.cookie, `/app/people/${employee.person}`, 'PEOPLE-005-past', async page => {
    await page.getByLabel('Record as of').fill(day(-366))
    await page.getByRole('button', { name: 'View date', exact: true }).click()
    await page.waitForURL(url => url.searchParams.get('asOf') === day(-366))
    assert.equal(await page.locator('.facet-directory dd').filter({ hasText: 'Support Associate' }).count(), 1)
  })
  await screenshots(s.hr.cookie, `/app/people/${employee.person}?asOf=${day(30)}`, 'PEOPLE-005-future')
  await screenshots(s.managera.cookie, `/app/people/${employee.person}?asOf=${day(-366)}`, 'PEOPLE-005-manager')
  console.log('PEOPLE-005: PASS')

  // PEOPLE-002: one dated source for scoped search, chart navigation and profiles.
  const names = { managera: 'Jordan Lee', managerb: 'Maya Chen', employee: 'Riley Nguyen', payroll: 'Morgan Davis', hr: 'Hana Reid', ended: 'Rowan Ellis', invited: 'Elliot James' }
  for (const [key, name] of Object.entries(names)) {
    const person = await api(`people/${s[key].person}`)
    await api('person.update', { person: person.id, revision: person.revision, legalName: name, preferredName: '', workEmail: person.workEmail, employeeNumber: person.employeeNumber ?? '' })
  }
  await api('mover.schedule', { period: s.managera.period, effectiveFrom: day(-1), managerPersonId: s.managerb.person, jobTitle: 'Director of Operations', reason: 'Leadership structure' })
  const staffNames = ['Amara Okafor', 'Noah Williams', 'Sofia Garcia', 'Liam Anderson', 'Isabella Martinez', 'Ethan Wilson', 'Zoe Thompson', 'Oliver Brown', 'Ava Robinson', 'Lucas Clark', 'Mia Lewis', 'Leo Walker', 'Aaliyah Hall', 'Henry Young', 'Aria King', 'Mateo Wright', 'Charlotte Scott', 'Elijah Green', 'Camila Adams', 'Benjamin Baker', 'Harper Nelson', 'Daniel Carter', 'Evelyn Mitchell', 'Samuel Perez', 'Nora Roberts', 'Sebastian Turner', 'Layla Phillips', 'Jack Campbell', 'Elena Parker', 'Owen Evans', 'Grace Edwards', 'Gabriel Collins', 'Chloe Stewart', 'Theodore Morris', 'Priya Shah', 'Isaac Rogers', 'Fatima Khan', 'Julian Reed', 'Ada Brooks', 'Kai Johnson']
  const team = []
  for (const [index, name] of staffNames.entries()) team.push(await join(`org-${index}`, { legalName: name, jobTitle: index % 3 === 0 ? 'Customer Success Specialist' : 'Support Engineer', managerPersonId: index % 2 ? s.managera.person : s.employee.person, departmentId: department, locationId: location }))
  const chart = (date = today, cookie = owner) => h.api(`organization?asOf=${date}`, cookie)
  const find = (data, id) => data.nodes.find(node => node.id === id)
  for (const cookie of [owner, s.employee.cookie, s.managera.cookie]) {
    const data = await chart(today, cookie)
    assert.equal(data.activeCount, (await h.api(`people?asOf=${today}&status=active`, cookie)).length)
    assert.equal(find(data, s.employee.person).parent, s.managera.person)
    assert.ok(find(data, s.employee.person).reports.includes(team[0].person))
    const serialized = JSON.stringify(data)
    for (const secret of ['amountCents', 'phone', 'PRIVATE-', 'PRIVATE-DOCUMENT']) assert.ok(!serialized.includes(secret))
    for (const [key, value] of [['name', 'Amara'], ['location', 'Austin'], ['department', 'Customer Success'], ['role', 'Support Engineer'], ['q', 'Austin']]) {
      const rows = await h.api(`people?${key}=${encodeURIComponent(value)}`, cookie)
      assert.ok(rows.length > 0)
      for (const row of rows) assert.ok(JSON.stringify(row).toLowerCase().includes(value.toLowerCase()))
    }
  }
  // A manager change effective today changes the chart immediately, without editing the chart.
  await api('mover.schedule', { period: team[0].period, effectiveFrom: today, managerPersonId: s.managerb.person, reason: 'Reporting transfer today' })
  assert.equal(find(await chart(), team[0].person).parent, s.managerb.person)
  assert.equal(find(await chart(day(-1)), team[0].person).parent, s.employee.person)
  assert.equal((await api(`people/${team[0].person}?asOf=${today}`)).current.manager.id, s.managerb.person)
  for (const date of [day(29), day(30)]) {
    const data = await chart(date)
    const profile = await api(`people/${employee.person}?asOf=${date}`)
    assert.equal(find(data, employee.person).parent, profile.current.manager.id)
    assert.equal(data.activeCount, (await api(`people?asOf=${date}&status=active`)).length)
  }
  const candidate = await join('vacant-manager', { legalName: 'Alex Rivera' })
  const report = await join('vacant-report', { legalName: 'Taylor Reed', managerPersonId: candidate.person })
  await api('leaver.start', { period: candidate.period, template: templates.leaver, endDate: today, reason: 'Recorded departure' })
  assert.equal(find(await chart(today), report.person).managerState, 'available', 'Last day inclusive')
  assert.equal(find(await chart(day(1)), report.person).managerState, 'vacant')
  assert.equal(find(await chart(day(1)), candidate.person).status, 'former')
  // Refuse self, indirect and future-only cycles without writing terms or cases.
  await api('mover.schedule', { period: s.managera.period, effectiveFrom: today, managerPersonId: s.managera.person, reason: 'Invalid self reporting' }, 409)
  await api('mover.schedule', { period: s.managerb.period, effectiveFrom: today, managerPersonId: s.employee.person, reason: 'Invalid indirect reporting' }, 409)
  await api('mover.schedule', { period: s.managerb.period, effectiveFrom: day(40), managerPersonId: employee.person, reason: 'Invalid future cycle' }, 409)
  const original = await api(`people/${s.managerb.person}`)
  assert.ok(!original.employment.flatMap(p => p.terms).some(t => t.reason.startsWith('Invalid')))
  // Canceling a version must not expose a previously hidden cycle.
  const x = await join('cycle-x', { legalName: 'Drew Cameron' })
  const y = await join('cycle-y', { legalName: 'Quinn Patel', managerPersonId: x.person })
  const breaksCycle = await api('mover.schedule', { period: y.period, effectiveFrom: day(10), managerPersonId: s.managerb.person, reason: 'Independent team' })
  await api('mover.schedule', { period: x.period, effectiveFrom: day(20), managerPersonId: y.person, reason: 'Future reporting' })
  await api('terms.cancel', { terms: breaksCycle.terms, reason: 'Would expose cycle' }, 409)
  // Two separately valid competing changes cannot commit a cycle together.
  const raceA = await join('race-a', { legalName: 'Reese Taylor' }), raceB = await join('race-b', { legalName: 'Cameron Hayes' })
  const race = await Promise.all([[raceA, raceB], [raceB, raceA]].map(([a, b]) => h.raw('/api/willow/mover.schedule', { cookie: owner, body: { period: a.period, effectiveFrom: today, managerPersonId: b.person, reason: 'Concurrent reporting' } })))
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409])
  // The move-in public door refuses a cyclic source graph before any person is written.
  const source = 'id,firstName,lastName,workEmail,hireDate,jobTitle,supervisorEId\ncycle-one,Alex,Import,cycle-one@example.com,2020-01-01,Lead,cycle-two\ncycle-two,Sam,Import,cycle-two@example.com,2020-01-01,Lead,cycle-one\n'
  const beforeImport = (await api('people')).length
  const invalidImport = await api('import.preview', { employees_name: 'cycle.csv', employees_b64: Buffer.from(source).toString('base64'), dateOrder: 'YMD' }, 409)
  assert.equal(invalidImport.error, 'manager_cycle')
  assert.equal((await api('people')).length, beforeImport)
  const imported = { employees_name: 'team.csv', employees_b64: Buffer.from(source.replace('Lead,cycle-one\n', 'Lead,\n')).toString('base64'), schedule }
  const preview = await api('import.preview', imported)
  await api('import.apply', { ...imported, fingerprint: preview.fingerprint })
  const importedPeople = await api('people?name=Import')
  assert.equal(importedPeople.length, 2)
  const importedManager = importedPeople.find(person => person.name === 'Sam Import')
  assert.equal(find(await chart(), importedPeople.find(person => person.name === 'Alex Import').id).parent, importedManager.id)
  await h.api('people?asOf=bad', owner, undefined, 400)
  await screenshots(s.hr.cookie, '/app/people', 'PEOPLE-002-directory', async page => {
    await page.getByLabel('Location', { exact: true }).first().fill('Austin')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page.waitForURL(url => url.searchParams.get('location') === 'Austin')
    assert.ok(await page.getByRole('link', { name: 'Amara Okafor', exact: true }).count())
  })
  await screenshots(s.hr.cookie, `/app/people?view=organization&focus=${s.managerb.person}`, 'PEOPLE-002-chart', async page => {
    await page.getByRole('link', { name: 'Jordan Lee', exact: true }).click()
    await page.waitForURL(url => url.searchParams.get('focus') === s.managera.person)
    await page.getByRole('link', { name: 'Riley Nguyen', exact: true }).click()
    await page.waitForURL(url => url.searchParams.get('focus') === s.employee.person)
  })
  await screenshots(s.hr.cookie, `/app/people?view=organization&focus=${employee.person}&asOf=${day(30)}`, 'PEOPLE-002-future')
  await screenshots(s.hr.cookie, `/app/people?view=organization&focus=${report.person}&asOf=${day(1)}`, 'PEOPLE-002-vacant')
  console.log('PEOPLE-002: PASS')
} finally { await browser?.close(); await h.close() }
