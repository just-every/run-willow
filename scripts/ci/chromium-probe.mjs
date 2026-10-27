import { pathToFileURL } from 'node:url'

// Signing and section journeys install their pinned browser outside the checkout.
const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href
  : '@playwright/test')
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === 'darwin' ? { args: ['--use-mock-keychain', '--password-store=basic'] } : {}),
})
await browser.close()
