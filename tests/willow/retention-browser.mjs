// DATA-002 page and viewport evidence on the real signed-in Worker.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function browserEvidence(h, cookie, pages) {
  if (process.env.WILLOW_RETENTION_BROWSER !== '1') return
  const destination = process.env.WILLOW_EVIDENCE_DIR
  assert.ok(destination, 'WILLOW_EVIDENCE_DIR is required for browser evidence')
  await mkdir(destination, { recursive: true })
  assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Mac evidence requires an explicitly selected current Playwright')
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
    const page = await context.newPage()
    for (const [name, path] of pages) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal((await page.goto(h.origin + path)).status(), 200)
        if (name === 'retained' && width === 1440) await page.getByText('Read retained values', { exact: true }).first().click()
        const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth ? [] : [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${el.className}: ${el.textContent.slice(0, 40)}`))
        assert.deepEqual(wide, [], `${name} fits ${width}`)
        const screenshot = await page.screenshot({ path: `${destination}/DATA-002-${name}-${width}.png`, fullPage: true })
        assert.equal(screenshot.readUInt32BE(16), width, 'the actual screenshot fits the viewport')
      }
    }
    await context.close()
  } finally { await browser.close() }
}

/** Use the owner's actual preview/confirmation and receipt navigation. */
export async function confirmThroughBrowser(h, cookie, person) {
  if (process.env.WILLOW_RETENTION_BROWSER !== '1') return null
  const destination = process.env.WILLOW_EVIDENCE_DIR
  assert.ok(destination)
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
    const page = await context.newPage()
    await page.goto(`${h.origin}/app/retention/erasure?person=${person}`)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      const screenshot = await page.screenshot({ path: `${destination}/DATA-002-confirm-preview-${width}.png`, fullPage: true })
      assert.equal(screenshot.readUInt32BE(16), width, 'the actual screenshot fits the viewport')
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: 'Confirm this preview and erase', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/app/retention')
    assert.equal(await page.locator('.error').count(), 0)
    const link = page.locator('a[href^="/app/retention/receipts/"]').first()
    await link.click()
    await page.waitForURL('**/app/retention/receipts/*')
    const receipt = new URL(page.url()).pathname.split('/').at(-1)
    const data = await h.api(`erasure/receipts/${receipt}`, cookie)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      const screenshot = await page.screenshot({ path: `${destination}/DATA-002-confirm-receipt-${width}.png`, fullPage: true })
      assert.equal(screenshot.readUInt32BE(16), width, 'the actual screenshot fits the viewport')
    }
    await context.close()
    return { status: 'confirmed', receipt, label: data.label }
  } finally { await browser.close() }
}
