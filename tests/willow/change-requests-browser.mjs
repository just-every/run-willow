// Optional FLOW-004 form and viewport evidence on the real signed-in Worker.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function browserEvidence(h, staff, approved, declined) {
  if (process.env.WILLOW_CHANGE_REQUESTS_BROWSER !== '1') return
  const destination = process.env.WILLOW_EVIDENCE_DIR
  assert.ok(destination, 'WILLOW_EVIDENCE_DIR is required for browser evidence')
  await mkdir(destination, { recursive: true })
  assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Mac evidence requires an explicitly selected current Playwright')
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  try {
    for (const who of ['managera', 'managerb', 'hr']) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true })
      await context.addCookies(staff[who].cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
      const page = await context.newPage()
      const capture = async (path, name, width) => {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal((await page.goto(h.origin + path)).status(), 200)
        for (const summary of await page.locator('details > summary').all()) await summary.click()
        await page.evaluate(() => document.fonts.ready)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits ${width}`)
        await page.screenshot({ path: `${destination}/FLOW-004-${who}-${name}-${width}.png`, fullPage: true })
      }
      for (const width of [1440, 390]) {
        await capture('/app/changes', 'list', width)
        await capture(`/app/changes/${approved}`, 'approved', width)
        // The job chain names only HR, so the skip-level manager cannot open the declined request.
        if (who !== 'managerb') await capture(`/app/changes/${declined}`, 'declined', width)
      }
      if (who === 'managera') {
        // Submit a request through the real form and land on its page, waiting on the skip-level manager.
        await page.goto(h.origin + '/app/changes')
        const form = page.locator('form[action="/app/do/change.request"]')
        await form.locator('input[name="effectiveFrom"]').fill(new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))
        await form.locator('textarea[name="reason"]').fill('Location move')
        await form.locator('input[name="payIncreasePercent"]').fill('6')
        await form.getByRole('button', { name: 'Submit for approval' }).click()
        await page.waitForURL(/\/app\/changes\/[\w-]+/)
        assert.ok((await page.textContent('body')).includes('Manager’s manager'))
        await page.screenshot({ path: `${destination}/FLOW-004-managera-submitted-1440.png`, fullPage: true })
      }
      await context.close()
    }
  } finally { await browser.close() }
}
