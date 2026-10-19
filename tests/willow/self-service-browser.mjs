// Optional SELF-001 browser proof against the real signed-in Worker.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// changes holds pending, approved and rejected proposal ids for this person.
export async function browserEvidence(h, owner, staff, person, changes) {
  if (process.env.WILLOW_SELF_SERVICE_BROWSER !== '1') return
  const destination = process.env.WILLOW_EVIDENCE_DIR
  assert.ok(destination, 'WILLOW_EVIDENCE_DIR is required for browser evidence')
  await mkdir(destination, { recursive: true })
  const original = await h.api(`people/${person}`, owner)
  const proposedName = `${original.legalName} Browser request`
  assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Mac evidence requires an explicitly selected current Playwright')
  const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  let submitted
  try {
    for (const who of ['employee', 'hr', 'payroll', 'managera', 'owner']) {
      const cookie = who==='owner'?owner:staff[who].cookie
      const context = await browser.newContext({ ignoreHTTPSErrors: true })
      try {
        await context.addCookies(cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
        const page = await context.newPage()
        const capture = async (path, name, width, openForms = false) => {
          await page.setViewportSize({ width, height: 1000 })
          assert.equal((await page.goto(h.origin + path)).status(), 200)
          if (openForms) for (const summary of await page.locator('details > summary').all()) await summary.click()
          await page.evaluate(() => document.fonts.ready)
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${who} ${name} fits ${width}`)
          await page.screenshot({ path: `${destination}/SELF-001-${who}-${name}-${width}.png`, fullPage: true })
        }
        for (const width of [1440, 390]) {
          if(who==='owner') { await capture('/app/custom-fields','definitions',width); await capture('/app/reports','reports',width); continue }
          if(who==='payroll') { await capture('/app/payroll','payroll',width); await capture('/app/self-changes','reconciliation',width); continue }
          if(who==='managera') { await capture('/app','home',width); await capture(`/app/people/${person}`,'employee-record',width); continue }
          await capture('/app/self-changes', 'list-and-forms', width, true)
          for (const status of ['pending', 'approved', 'rejected']) await capture(`/app/self-changes/${changes[status]}`, status, width)
          await capture('/app', 'home', width)
          await capture(`/app/people/${person}`, 'profile', width)
        }
        await page.setViewportSize({ width: 1440, height: 1000 })
        if (who === 'employee') {
          await page.goto(h.origin + '/app/self-changes')
          const form = page.locator('form[action="/app/do/self.request"]').filter({ has: page.locator('input[name="kind"][value="legalName"]') })
          await form.getByLabel('New legal name', { exact: true }).fill(proposedName)
          await form.getByRole('button', { name: 'Request legal name change', exact: true }).click()
          await page.waitForURL(/\/app\/self-changes\/[\w-]+/)
          submitted = new URL(page.url()).pathname.split('/').pop()
          const proposal = await h.api(`self-changes/${submitted}`, cookie)
          assert.equal(proposal.status, 'pending')
          assert.equal(proposal.personId, person)
          assert.equal(proposal.after.legalName, proposedName)
          assert.equal((await h.api(`people/${person}`, owner)).legalName, original.legalName, 'requesting a legal name change does not apply it')
          await page.screenshot({ path: `${destination}/SELF-001-employee-submitted-1440.png`, fullPage: true })
        } else if (who==='hr') {
          assert.ok(submitted, 'employee submitted the proposal before HR reviews it')
          await page.goto(h.origin + `/app/self-changes/${submitted}`)
          const form = page.locator('form[action="/app/do/self.decide"]')
          await form.getByLabel('Decision', { exact: true }).selectOption('reject')
          await form.getByLabel('Comment', { exact: true }).fill('Please provide the corrected legal name.')
          await form.getByRole('button', { name: 'Record decision', exact: true }).click()
          await page.waitForURL(url => url.pathname === `/app/self-changes/${submitted}` && url.searchParams.has('notice'))
          const proposal = await h.api(`self-changes/${submitted}`, staff.employee.cookie)
          assert.equal(proposal.status, 'rejected')
          assert.equal(proposal.decision.comment, 'Please provide the corrected legal name.')
          assert.equal((await h.api(`people/${person}`, owner)).legalName, original.legalName, 'rejecting the proposal preserves the legal name')
          await page.screenshot({ path: `${destination}/SELF-001-hr-rejected-1440.png`, fullPage: true })
        }
      } finally { await context.close() }
    }
  } finally { await browser.close() }
}
