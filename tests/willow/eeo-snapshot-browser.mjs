// EEO-002 page and viewport evidence on the real signed-in Worker.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function browserEvidence(h, cookies, run) {
  if (process.env.WILLOW_EEO_SNAPSHOT_BROWSER !== '1') return
  const destination = process.env.WILLOW_EVIDENCE_DIR
  assert.ok(destination, 'WILLOW_EVIDENCE_DIR is required for browser evidence')
  await mkdir(destination, { recursive: true })
  assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Mac evidence requires an explicitly selected current Playwright')
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  try {
    for (const [name, who, path] of [['mappings', 'hr', '/app/eeo/mappings'], ['runs', 'hr', '/app/eeo/runs'], ['run', 'hr', `/app/eeo/runs/${run}`], ['drill', 'hr', `/app/eeo/runs/${run}/people?flag=declined_race`], ['aggregate', 'aggregate', `/app/eeo/runs/${run}/aggregate`]]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true })
      await context.addCookies(cookies[who].split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
      const page = await context.newPage()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal((await page.goto(h.origin + path)).status(), 200)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits ${width}`)
        await page.screenshot({ path: `${destination}/EEO-002-${name}-${width}.png`, fullPage: true })
      }
      await context.close()
    }
  } finally { await browser.close() }
}
