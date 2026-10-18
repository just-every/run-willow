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
} finally { await browser?.close(); await h.close() }
