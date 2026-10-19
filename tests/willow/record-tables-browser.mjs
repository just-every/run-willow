// Optional PEOPLE-003 form and viewport evidence; uses the real signed-in Worker.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const table = (person, key) => person.recordTables.tables.find(item => item.key === key)

export async function browserEvidence(h, owner, staff, person, leaverCase) {
  if (process.env.WILLOW_RECORD_TABLES_BROWSER !== '1') return
  const destination = process.env.WILLOW_EVIDENCE_DIR
  assert.ok(destination, 'WILLOW_EVIDENCE_DIR is required for browser evidence')
  await mkdir(destination, { recursive: true })
  assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Mac evidence requires an explicitly selected current Playwright')
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  const today = new Date().toISOString().slice(0, 10)
  try {
    for (const [who, cookie] of [['owner', owner], ['manager', staff.managera.cookie], ['employee', staff.employee.cookie]]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true })
      await context.addCookies(cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
      const page = await context.newPage()
      const capture = async (path, name, width, open) => {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal((await page.goto(h.origin + path)).status(), 200)
        if (open) await open(page)
        await page.evaluate(() => document.fonts.ready)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits ${width}`)
        await page.screenshot({ path: `${destination}/PEOPLE-003-${who}-${name}-${width}.png`, fullPage: true })
      }
      for (const width of [1440, 390]) {
        await capture(`/app/people/${person}`, 'records', width, async page => { for (const summary of await page.locator('.facet-records details > summary').all()) await summary.click() })
        if (who !== 'owner') continue
        await capture('/app/custom-fields', 'definitions', width, async page => { await page.getByText('Create a table', { exact: true }).click() })
        await capture(`/app/cases/${leaverCase}`, 'leaver-case', width)
        await capture('/app/reports', 'reports', width)
        await capture('/app/import', 'import', width)
      }
      if (who === 'employee') {
        await page.goto(h.origin + `/app/people/${person}`)
        await page.getByText('Add to emergency contacts', { exact: true }).click()
        const form = page.locator('form[action="/app/do/recordRow.write"]').filter({ has: page.locator('input[name="table"][value="table-emergency-contacts"]') }).last()
        await form.getByLabel('Name', { exact: true }).fill('Browser contact')
        await form.getByLabel('Phone', { exact: true }).fill('BROWSER-PHONE')
        await form.getByLabel('Primary contact', { exact: true }).selectOption('false')
        await form.getByRole('button', { name: 'Add row', exact: true }).click()
        assert.ok(table(await h.api(`people/${person}`, owner), 'emergency_contacts').rows.some(row => row.values.phone === 'BROWSER-PHONE'))
      }
      if (who === 'owner') {
        // Assign a monitor through the person page, then return it through the leaver case form.
        const target = staff.managerb.person
        await page.goto(h.origin + `/app/people/${target}`)
        await page.getByText('Add to company assets', { exact: true }).click()
        const form = page.locator('form[action="/app/do/recordRow.write"]').filter({ has: page.locator('input[name="table"][value="table-assets"]') }).last()
        await form.getByLabel('Asset type', { exact: true }).fill('Monitor')
        await form.getByLabel('Serial number', { exact: true }).fill('SN-MONITOR-7')
        await form.getByLabel('Assigned on', { exact: true }).fill(today)
        await form.getByLabel('Condition', { exact: true }).selectOption('new')
        await form.getByRole('button', { name: 'Add row', exact: true }).click()
        const ended = await h.api('leaver.start', owner, { period: staff.managerb.period, endDate: today, reason: 'Browser leaver', template: (await h.api('templates', owner)).find(t => t.kind === 'leaver').id })
        for (const width of [1440, 390]) await capture(`/app/cases/${ended.case}`, 'asset-return', width)
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.goto(h.origin + `/app/cases/${ended.case}`)
        const done = page.locator('form[action="/app/do/task.complete"]').filter({ has: page.getByLabel('Condition on return', { exact: true }) })
        await done.getByLabel('Condition on return', { exact: true }).selectOption('good')
        await done.getByLabel('Evidence (required)', { exact: true }).fill('Monitor received by IT')
        await done.getByRole('button', { name: 'Record return and mark done', exact: true }).click()
        assert.equal(table(await h.api(`people/${target}`, owner), 'assets').rows[0].values.returned_on, today)
      }
      await context.close()
    }
  } finally { await browser.close() }
}
