// DATA-001's standard-field export slice, through signed-in download and form doors.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { harness } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'

// Independent CSV consumer handles quoting, embedded newlines and empty cells.
function csv(text) {
  const rows = [], expression = /(?:^|,|\r\n)(?:"((?:[^"]|"")*)"|([^,\r\n]*))/g
  let row = []
  for (const match of text.matchAll(expression)) {
    if (match[0].startsWith('\r\n')) { rows.push(row); row = [] }
    row.push(match[1] === undefined ? match[2] : match[1].replaceAll('""', '"'))
  }
  if (row.some(Boolean)) rows.push(row)
  return rows
}
const objects = rows => rows.slice(1).map(row => Object.fromEntries(rows[0].map((key, index) => [key, row[index]])))
const query = (scope, fields, extra = {}) => new URLSearchParams({ scope, fields: fields.join(','), asOf: today, ...extra })
const h = await harness()
let browser
try {
  await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const { api, join, staff: s } = await fixture(h, owner)
  const fields = ['name', 'jobTitle', 'phone', 'payAmount', 'payrollId', 'startDate']
  const download = async (cookie, scope, format = 'csv', selectedFields = fields, extra = {}, status = 200) => {
    const response = await h.raw(`/app/exports/employees.${format}?${query(scope, selectedFields, extra)}`, { cookie })
    assert.equal(response.status, status)
    if (status === 200) {
      assert.match(response.headers.get('cache-control'), /no-store/)
      assert.match(response.headers.get('content-disposition'), /attachment/)
      assert.match(response.headers.get('content-type'), format === 'csv' ? /text\/csv/ : /spreadsheetml.sheet/)
    }
    return response
  }
  const hr = objects(csv(await (await download(s.hr.cookie, 'organization')).text()))
  const hrEmployee = hr.find(row => row.person_id === s.employee.person)
  assert.equal(hrEmployee.phone, 'PRIVATE-employee')
  assert.equal(hrEmployee.payAmount, '')
  assert.equal(hrEmployee.withheld_fields, 'payAmount')
  const manager = objects(csv(await (await download(s.managera.cookie, 'team')).text()))
  assert.deepEqual(manager.map(row => row.person_id), [s.employee.person])
  assert.equal(manager[0].jobTitle, (await h.api(`people/${s.employee.person}`, s.managera.cookie)).current.jobTitle)
  assert.equal(manager[0].phone, '')
  assert.equal(manager[0].payrollId, '')
  assert.equal(manager[0].startDate, day(-100))
  assert.equal(manager[0].withheld_fields, 'phone;payAmount;payrollId')
  const self = objects(csv(await (await download(s.employee.cookie, 'self')).text()))
  assert.equal(self.length, 1)
  assert.equal(self[0].payAmount, '81234.56')
  assert.equal(self[0].phone, 'PRIVATE-employee')
  await download(s.managera.cookie, 'organization', 'csv', fields, {}, 403)
  await download(s.employee.cookie, 'team', 'csv', fields, {}, 403)
  await download(s.managera.cookie, 'team', 'csv', fields, { person: s.payroll.person }, 403)
  await download(owner, 'organization', 'csv', ['__proto__'], {}, 400)
  await download(owner, 'organization', 'csv', ['name', 'name'], {}, 400)
  await download(owner, 'organization', 'csv', [], {}, 400)
  await download(owner, 'organization', 'csv', fields, { asOf: 'not-a-date' }, 400)
  assert.equal((await h.raw('/app/exports/employees.csv?fields=name', { cookie: owner })).status, 400)
  assert.equal((await h.raw('/app/exports/employees.xlsx?scope=organization&fields=name')).status, 303)

  // Effective dates, current authority, filters and selected rows survive both formats.
  await api('mover.schedule', { period: s.employee.period, effectiveFrom: day(20), jobTitle: 'Future supervisor', payBasis: 'salary', payAmount: '95000', reason: 'Reviewed promotion' })
  assert.equal(objects(csv(await (await download(owner, 'organization', 'csv', fields, { asOf: day(20), person: s.employee.person })).text()))[0].jobTitle, 'Future supervisor')
  assert.equal(objects(csv(await (await download(owner, 'organization', 'csv', fields, { q: 'No matching person' })).text())).length, 0)
  const ownProjection = await h.api(`people/${s.employee.person}?asOf=${day(-30)}`, owner)
  const past = objects(csv(await (await download(owner, 'organization', 'csv', fields, { asOf: day(-30), person: s.employee.person })).text()))[0]
  assert.equal(past.jobTitle, ownProjection.current.jobTitle)
  assert.equal(past.scope, 'organization')
  assert.equal(past.as_of, day(-30))
  await api('member.permissions', { member: s.hr.member, permissions: ['people.manage'] })
  const revoked = objects(csv(await (await download(s.hr.cookie, 'organization', 'csv', fields, { asOf: day(-30) })).text()))
  assert.ok(revoked.filter(row => row.person_id !== s.hr.person).every(row => row.phone === '' && row.payAmount === ''))
  assert.equal(revoked.find(row => row.person_id === s.hr.person).phone, 'PRIVATE-hr', 'self authority remains')

  // Literal text, never an executable spreadsheet formula; Unicode and CSV quoting survive.
  const unusual = await join(' =1+1, "Álvaro"\nBrooks', { workEmail: 'alvaro@example.com', managerPersonId: s.managera.person })
  const unusualCsv = objects(csv(await (await download(owner, 'organization', 'csv', ['name'], { person: unusual.person })).text()))
  assert.equal(unusualCsv[0].name, "'" + (await api(`people/${unusual.person}`)).name)
  const xlsx = Buffer.from(await (await download(s.managera.cookie, 'team', 'xlsx')).arrayBuffer())
  assert.equal(xlsx.readUInt32LE(0), 0x04034b50)
  const xml = xlsx.toString('utf8')
  assert.ok(xml.includes('inlineStr') && !xml.includes('<f>'))
  assert.ok(xml.includes('Álvaro') && xml.includes('phone;payAmount;payrollId'))
  assert.ok(!xml.includes('PRIVATE-employee') && !xml.includes('81234.56'))
  assert.ok((await api('audit')).some(event => event.action === 'employee.export' && event.actor === s.managera.member))
  if (process.env.WILLOW_EVIDENCE_DIR) await mkdir(process.env.WILLOW_EVIDENCE_DIR, { recursive: true })
  if (process.env.WILLOW_EVIDENCE_DIR) await writeFile(`${process.env.WILLOW_EVIDENCE_DIR}/DATA-001-employees.xlsx`, xlsx)

  if (process.env.WILLOW_EXPORT_BROWSER === '1') {
    for (const [key, name] of Object.entries({ managera: 'Mia Chen', managerb: 'Noah Ortiz', employee: 'Samira Patel', payroll: 'Pat Okoro', hr: 'Hana Reid', ended: 'Lee Park', invited: 'Jordan Bell' })) {
      const person = await api(`people/${s[key].person}`)
      await api('person.update', { person: person.id, revision: person.revision, legalName: name, workEmail: `${key}@example.com` })
    }
    const unusualPerson = await api(`people/${unusual.person}`)
    await api('person.update', { person: unusual.person, revision: unusualPerson.revision, legalName: 'Álvaro Brooks', workEmail: 'alvaro@example.com' })
    const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
    const destination = process.env.WILLOW_EVIDENCE_DIR
    assert.ok(destination)
    await mkdir(destination, { recursive: true })
    for (const [who, cookie] of [['HR', s.hr.cookie], ['manager', s.managera.cookie]]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true })
      await context.addCookies(cookie.split('; ').map(value => ({ name: value.slice(0, value.indexOf('=')), value: value.slice(value.indexOf('=') + 1), url: h.origin })))
      const page = await context.newPage()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto(h.origin + '/app/people')
        await page.locator('#employee-export > summary').click()
        await page.getByLabel('Phone', { exact: true }).check()
        await page.getByLabel('Pay amount', { exact: true }).check()
        await page.evaluate(() => document.fonts.ready)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `DATA-001 fits ${width}`)
        await page.screenshot({ path: `${destination}/DATA-001-${who}-${width}.png`, fullPage: true })
        for (const [label, format] of [['Download employee CSV', 'csv'], ['Download employee XLSX', 'xlsx']]) {
          const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label, exact: true }).click()])
          assert.equal(await download.failure(), null)
          assert.match(download.suggestedFilename(), new RegExp(`\\.${format}$`))
        }
      }
      await context.close()
    }
  }
  console.log('DATA-001 selected standard-field CSV/XLSX, dated scopes, current permissions and download forms passed (portability clause remains partial)')
} finally { if (browser) await browser.close(); await h.close() }
