// Optional PEOPLE-001 form and viewport evidence; uses the real signed-in Worker.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const custom = (person, key) => person.customFields.fields.find(field => field.key === key)

export async function browserEvidence(h, owner, staff, person, payrollBatch) {
  if (process.env.WILLOW_CUSTOM_FIELDS_BROWSER !== '1') return
  const destination = process.env.WILLOW_EVIDENCE_DIR
  assert.ok(destination, 'WILLOW_EVIDENCE_DIR is required for browser evidence')
  await mkdir(destination, { recursive: true })
  assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH,'Mac evidence requires an explicitly selected current Playwright')
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
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
        await page.screenshot({ path: `${destination}/PEOPLE-001-${who}-${name}-${width}.png`, fullPage: true })
      }
      for (const width of [1440, 390]) {
        await capture(`/app/people/${person}`, 'profile', width, async page => {
          if (who === 'owner') {
            for (const summary of ['Office code history', 'Update custom fields', 'Edit directory details']) await page.getByText(summary, { exact: true }).click()
          } else await page.getByText(who === 'manager' ? 'Delivery model history' : 'remote history', { exact: true }).click()
        })
        if (who !== 'owner') continue
        const screens = [
          [`/app/people/${staff.ended.person}`,'rehire',async page=> { await page.getByText('Rehire',{exact:true}).click(); const form=page.locator('form[action="/app/do/joiner.start"]'); await form.getByLabel('Start date',{exact:true}).fill(new Date().toISOString().slice(0,10)); await form.getByLabel('Job title',{exact:true}).fill('Operations Specialist'); await form.locator('[name="custom.office_code"]').fill('HQ-RETURN') }],
          ['/app/settings','settings'],
          [`/app/access?member=${staff.employee.member}&person=${person}`,'visibility-preview'],
          ['/app/custom-fields', 'definitions', async page => {
            await page.getByText('Create a field', { exact: true }).click()
            await page.getByText('Change or retire field', { exact: true }).first().click()
            await page.getByText('Definition history', { exact: true }).first().click()
          }],
          ['/app/people', 'joiner', async page => {
            const form = page.locator('form[action="/app/do/joiner.start"]')
            await form.locator('[name="custom.office_code"]').fill('HQ')
            await form.locator('[name="custom.remote"]').selectOption('false')
          }],
          ['/app/people', 'exports', async page => {
            await page.locator('#employee-export > summary').click()
            for (const key of ['office_code', 'allocation', 'hr_note']) await page.locator(`input[name="fields"][value="custom.${key}"]`).check()
          }],
          ['/app/reports?fields=custom.office_code,custom.hr_note', 'reports'],
          ['/app/import', 'imports', async page => {
            await page.getByText('Custom field columns', { exact: true }).click()
            await page.locator('[name="customColumn_office_code"]').fill('Site reference')
          }],
          ['/app/payroll', 'payroll', async page => {
            await page.getByText('Owner layout mapping', { exact: true }).click()
            await page.locator('input[name="customColumn"][value="custom.office_code"]').check()
          }],
          [`/app/payroll/${payrollBatch}`, 'payroll-preview'],
        ]
        for (const [path, name, open] of screens) await capture(path, name, width, open)
      }
      if (who === 'owner') {
        await page.goto(h.origin + '/app/custom-fields')
        await page.getByText('Create a field', { exact: true }).click()
        const form = page.locator('form[action="/app/do/customField.define"]').last()
        await form.getByLabel('Field key', { exact: true }).fill('review_note')
        await form.getByLabel('Label', { exact: true }).fill('Review note')
        await form.getByText('Text limits', { exact: true }).click()
        await form.getByLabel('Maximum characters', { exact: true }).fill('80')
        await form.getByRole('button', { name: 'Create field', exact: true }).click()
        assert.ok((await h.api('custom-fields', owner)).some(field => field.key === 'review_note'))
        await page.goto(h.origin + `/app/people/${person}`)
        await page.getByText('Update custom fields', { exact: true }).click()
        const values = page.locator('form[action="/app/do/customField.write"]')
        await values.locator('[name="custom.office_code"]').fill('OPS-BROWSER')
        await values.getByRole('button', { name: 'Save custom fields', exact: true }).click()
        assert.equal(custom(await h.api(`people/${person}`, owner), 'office_code').value, 'OPS-BROWSER')
        await page.goto(h.origin+`/app/people/${staff.ended.person}`)
        await page.getByText('Rehire',{exact:true}).click()
        const rehire=page.locator('form[action="/app/do/joiner.start"]')
        await rehire.getByLabel('Start date',{exact:true}).fill(new Date().toISOString().slice(0,10))
        await rehire.getByLabel('Job title',{exact:true}).fill('Operations Specialist')
        await rehire.locator('[name="custom.office_code"]').fill('HQ-RETURN')
        await rehire.getByRole('button',{name:'Start rehire',exact:true}).click()
        assert.equal(custom(await h.api(`people/${staff.ended.person}`,owner),'office_code').value,'HQ-RETURN')
      }
      await context.close()
    }
  } finally { await browser.close() }
}
