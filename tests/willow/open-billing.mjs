// OPEN-001: the owner sees who bills before enabling optional services.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { harness } from './harness.mjs'
import { oidcProviders } from './phase2-fixtures.mjs'
const h = await harness({ bindings: { MODELS_ENDPOINT: 'https://models.example.test/private-path?key=PRIVATE-URL-KEY', MODELS_KEY: 'PRIVATE-MODEL-KEY', OIDC_PROVIDERS: JSON.stringify(oidcProviders), OIDC_TRANSACTION_SECRET: 'independent-test-transaction-secret-123456' } })
let browser
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  await h.api('employer.configure', owner, { name: 'Juniper Field Services', timezone: 'America/Chicago', country: 'US', currency: 'USD' })
  let state = await h.api('connections', owner)
  assert.equal(state.notices, false)
  assert.equal(state.model.selected, null)
  const page = await h.raw('/app/connections', { cookie: owner }), html = await page.text()
  assert.equal(page.status, 200)
  for (const provider of ['SendGrid', 'models.example.test', ...state.identity.providers.map(provider => provider.label)]) assert.ok(html.includes(provider), 'Billing disclosure identifies the configured provider')
  for (const secret of ['PRIVATE-URL-KEY', 'PRIVATE-MODEL-KEY', '/private-path']) assert.ok(!html.includes(secret) && !JSON.stringify(state).includes(secret), 'Billing never exposes credential URL paths, queries or keys')
  // Activation still uses the ordinary owner actions; disclosure adds no paid gate.
  await h.api('connections.notices', owner, { enabled: true })
  await h.api('connections.model', owner, { model: 'owner-chosen-model' })
  state = await h.api('connections', owner)
  assert.equal(state.notices, true)
  assert.equal(state.model.selected, 'owner-chosen-model')
  await h.api('connections.notices', owner, { enabled: false })
  await h.api('connections.model', owner, { model: '' })
  if (process.env.WILLOW_PEOPLE_BROWSER === '1') {
    const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(owner.split('; ').map(c => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: h.origin })))
    const page = await context.newPage(), directory = process.env.WILLOW_EVIDENCE_DIR
    assert.ok(directory); await mkdir(directory, { recursive: true })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${h.origin}/app/connections`)
      await page.getByText('Configure email notices', { exact: true }).click()
      await page.getByText('Configure model drafts', { exact: true }).click()
      assert.ok(await page.locator('[data-billing="mail"]').isVisible())
      assert.ok(await page.locator('[data-billing="model"]').isVisible())
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: `${directory}/OPEN-001-billing-${width}.png`, fullPage: true })
    }
    await context.close()
  }
  console.log('OPEN-001 provider billing before activation: PASS')
} finally { await browser?.close(); await h.close() }
