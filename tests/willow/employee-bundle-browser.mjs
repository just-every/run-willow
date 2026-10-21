// DATA-001: operate the real export form and inspect the downloaded records.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { readFile, mkdir } from 'node:fs/promises'
import { readZip } from './export-reader.mjs'

export async function bundleBrowser(h, owner, staff, expected) {
 const destination = process.env.WILLOW_EVIDENCE_DIR
 assert.ok(destination)
 await mkdir(destination, { recursive: true })
 for (const [who, name] of Object.entries({ employee: 'Samira Patel-Singh', managera: 'Mia Chen', managerb: 'Noah Ortiz', hr: 'Hana Reid', payroll: 'Pat Okoro' })) {
  const person = await h.api(`people/${staff[who].person}`, owner)
  await h.api('person.update', owner, { person: person.id, revision: person.revision, legalName: name, workEmail: `${who}@example.com` })
 }
 const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 try {
  for (const who of ['employee', 'managerb']) {
   const context = await browser.newContext({ ignoreHTTPSErrors: true })
   try {
    await context.addCookies(staff[who].cookie.split('; ').map(value => ({ name: value.slice(0, value.indexOf('=')), value: value.slice(value.indexOf('=') + 1), url: h.origin })))
    const page = await context.newPage()
    for (const width of [1440, 390]) {
     await page.setViewportSize({ width, height: 1000 })
     await page.goto(h.origin + '/app/people')
     await page.locator('#employee-export > summary').click()
     await page.getByLabel('Export scope', { exact: true }).selectOption(who === 'employee' ? 'self' : 'team')
     for (const input of await page.locator('input[name=history]').all()) await input.uncheck()
     await page.getByLabel('Profile requests, HR decisions and handoffs', { exact: true }).check()
     await page.getByLabel('Goals, check-ins and development completion', { exact: true }).check()
     await page.getByLabel('Performance reviews and released feedback', { exact: true }).check()
     await page.evaluate(() => document.fonts.ready)
     assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `DATA-001 form fits ${width}`)
     await page.screenshot({ path: `${destination}/DATA-001-history-${who}-${width}.png`, fullPage: true })
     const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download records and files ZIP', exact: true }).click()])
     assert.equal(await download.failure(), null)
     const files = readZip(await readFile(await download.path()))
     const records = JSON.parse(files.get('records.json')).records
     assert.equal(records.length, 1)
     assert.equal(records[0].goals[0].id, expected.goal)
     assert.equal(records[0].goals[0].completion.evidence, 'Supervisor signoff SAF-204')
     const review = records[0].reviews.find(row => row.cycle.id === expected.review)
     assert.ok(review.summaries.some(row => row.id === expected.release))
     assert.ok(!JSON.stringify(records[0].reviews).includes('HR-CONFIDENTIAL'))
     if (who === 'managerb') assert.ok(!JSON.stringify(records[0].reviews).includes('WITHHELD-SUCCESSION'))
     if (who === 'employee') assert.ok(records[0].profileChanges.some(row => row.id === expected.proposal))
     else assert.deepEqual(records[0].withheldSections, ['profileChanges'])
    }
   } finally { await context.close() }
  }
 } finally { await browser.close() }
}
