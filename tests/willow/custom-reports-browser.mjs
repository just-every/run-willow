// Optional REPORT-001 evidence and real report-builder journey.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { readZip } from './export-reader.mjs'

function csvRows(text) {
  const rows = [], expression = /(?:^|,|\r\n)(?:"((?:[^"]|"")*)"|([^,\r\n]*))/g
  let row = []
  for (const match of text.matchAll(expression)) {
    if (match[0].startsWith('\r\n')) { rows.push(row); row = [] }
    row.push(match[1] === undefined ? match[2] : match[1].replaceAll('""', '"'))
  }
  if (row.some(Boolean)) rows.push(row)
  return rows
}
const xmlValue = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&#13;', '\r').replaceAll('&amp;', '&')

export async function browserEvidence(h, owner, staff, reportId) {
  if (process.env.WILLOW_CUSTOM_REPORTS_BROWSER !== '1') return
  const destination = process.env.WILLOW_EVIDENCE_DIR
  assert.ok(destination, 'WILLOW_EVIDENCE_DIR is required for browser evidence')
  await mkdir(destination, { recursive: true })
  assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Mac evidence requires an explicitly selected current Playwright')
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  try {
    for (const [who, cookie] of [['owner', owner], ['hr', staff.hr.cookie], ['manager', staff.managera.cookie], ['employee', staff.employee.cookie]]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true })
      try {
        await context.addCookies(cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
        const page = await context.newPage()
        const me = await h.api('me', cookie)
        const capture = async (path, name, width, open) => {
          await page.setViewportSize({ width, height: 1000 })
          assert.equal((await page.goto(h.origin + path)).status(), 200)
          if (open) await open(page)
          await page.evaluate(() => document.fonts.ready)
          await page.screenshot({ path: `${destination}/REPORT-001-${who}-${name}-${width}.png`, fullPage: true })
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${who} ${name} fits ${width}`)
        }
        let target = reportId
        if (who === 'manager') {
          await page.goto(h.origin + '/app/reports/custom')
          const form = page.locator('form[action="/app/do/report.save"]')
          await form.getByLabel('Report name', { exact: true }).fill('Direct team work and contact report')
          for (const key of ['name', 'jobTitle', 'phone', 'openExceptions', 'overdueWork']) await form.locator(`input[name="columns"][value="${key}"]`).check()
          await form.getByRole('button', { name: 'Save report', exact: true }).click()
          await page.waitForURL(/\/app\/reports\/custom\/[\w-]+/)
          target = new URL(page.url()).pathname.split('/').pop()
          const { report, result } = await h.api(`custom-reports/${target}`, cookie)
          assert.equal(report.definition.name, 'Direct team work and contact report')
          assert.equal(result.scope, 'current direct team')
          assert.ok(result.rows.length > 0)
          assert.ok(result.rows.every(row => me.manages.includes(row.personId)))
          assert.ok(result.rows.some(row => row.personId === staff.employee.person))
          assert.ok(result.rows.every(row => row.withheld.includes('phone') && row.cells.phone === null))
          const source = page.locator('a[data-report-source]').first()
          const sourceUrl = new URL(await source.getAttribute('href'), h.origin)
          const sourcePerson = result.rows.find(row => row.source === sourceUrl.pathname + sourceUrl.search)
          assert.ok(sourcePerson, 'drill-down comes from an authorized result row')
          await source.click()
          await page.waitForURL(url => url.pathname === sourceUrl.pathname && url.search === sourceUrl.search)
          assert.equal((await h.api(`people/${sourcePerson.personId}${sourceUrl.search}`, cookie)).name, sourcePerson.name)
          assert.ok((await page.getByRole('heading', { level: 1 }).textContent()).includes(sourcePerson.name))
        }
        for (const width of [1440, 390]) {
          if(who==='owner'){await capture('/app/reports','summary',width);await capture('/app/access','access-grant',width)}
          if (who !== 'employee') {
            await capture('/app/reports/custom', 'builder', width)
            await capture(`/app/reports/custom/${target}`, 'detail', width, async page => {
              for (const summary of await page.locator('details > summary').all()) await summary.click()
            })
            // Follow the actual download links at both viewports and validate the returned files.
            for (const format of ['csv', 'xlsx']) {
              const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: `Download ${format.toUpperCase()}`, exact: true }).click()])
              assert.equal(await download.failure(), null)
              const bytes = await readFile(await download.path())
              assert.ok(download.suggestedFilename().endsWith(`.${format}`))
              const { result } = await h.api(`custom-reports/${target}`, cookie)
              let rows
              if (format === 'csv') {
                rows = csvRows(bytes.toString('utf8'))
              } else {
                const files = readZip(bytes)
                assert.ok(files.has('[Content_Types].xml') && files.has('xl/workbook.xml') && files.has('xl/worksheets/sheet1.xml'))
                const sheet = files.get('xl/worksheets/sheet1.xml').toString('utf8')
                rows = [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(match => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(cell => xmlValue(cell[1])))
              }
              assert.deepEqual(rows[3], result.columns.map(column => column.label))
              assert.deepEqual(rows.slice(4, 4 + result.rows.length), result.rows.map(row => result.columns.map(column => row.withheld.includes(column.key) ? 'Withheld' : row.cells[column.key] ?? 'Unknown / not recorded')), `${format} preserves the authorized report rows`)
            }
          }
          if (who === 'hr' || who === 'employee') await capture('/app/eeo/self', 'voluntary-self-id', width)
          if (who === 'hr' && me.permissions.includes('eeo.read') && me.permissions.includes('reports.read')) await capture('/app/eeo/report', 'diversity-report', width)
        }
        if(who==='hr'&&me.permissions.includes('eeo.read')) {
          const original=(await h.api('eeo/self',staff.employee.cookie)).current
          await h.api('eeo.self.write',staff.employee.cookie,{raceEthnicity:'asian',sex:'female'})
          try {
            const protectedReport=await h.api('eeo/report',cookie)
            assert.equal(protectedReport.suppressed,true)
            for(const width of [1440,390])await capture('/app/eeo/report','diversity-suppressed',width)
          } finally {await h.api('eeo.self.write',staff.employee.cookie,{raceEthnicity:original.raceEthnicity??'',sex:original.sex??''})}
        }
      } finally { await context.close() }
    }
  } finally { await browser.close() }
}
