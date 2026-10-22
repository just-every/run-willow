// ROLE-012: native configuration, reviewed reach and read-only report end states.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { evidenceDirectory } from './evidence.mjs'
import { builtinSelectionFixture, selectedBuiltinIds } from './levels-builtins.mjs'

export async function builtinBrowserProof(h, owner, fx) {
 if (process.env.WILLOW_LEVELS_BROWSER !== '1') return
 assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Use current Playwright on macOS')
 const ctx = await builtinSelectionFixture(h, owner, fx, 12100)
 const { api, read, assign, reader: member, location, near, catalog, hidden, scope } = ctx
 const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const contexts = []
 const open = async cookie => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  contexts.push(context)
  await context.addCookies(cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
  return context.newPage()
 }
 try {
  const admin = await open(owner), reader = await open(member.cookie)
  const submit = async (page, form, button) => {
   await form.getByRole('button', { name: button, exact: true }).click()
   await page.waitForURL(url => url.searchParams.has('notice') || url.searchParams.has('error'))
   assert.ok(!new URL(page.url()).searchParams.has('error'), page.url())
  }
  const visit = async (page, path, status = 200) => assert.equal((await page.goto(h.origin + path)).status(), status, path)
  const applyReview = () => submit(admin, admin.locator('form[action="/app/do/level.apply"]'), 'Apply reviewed change')
  for (const [index, width] of [1440, 390].entries()) {
   for (const page of [admin, reader]) await page.setViewportSize({ width, height: 1000 })
   const capture = async (page, state) => {
    await page.evaluate(() => document.fonts.ready)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state} fits ${width}`)
    await page.screenshot({ path: `${evidenceDirectory}/ROLE-012-${state}-${width}.png`, fullPage: true })
   }
   await assign([])
   await visit(admin, '/app/access')
   const name = `synthetic-willow-${12106 + index}`
   const create = admin.locator('details').filter({ has: admin.locator('summary').filter({ hasText: /^Create a level$/ }) }).first()
   await create.locator('summary').click()
   await create.getByLabel('Level name', { exact: true }).fill(name)
   await create.getByLabel('Scope', { exact: true }).selectOption('group')
   await create.locator(`input[name="scopeLocation"][value="${location.id}"]`).check()
   for (const id of selectedBuiltinIds) await create.locator(`input[name="reports"][value="${id}"]`).check()
   assert.deepEqual(await create.locator('input[name="reports"]:checked').evaluateAll(inputs => inputs.map(input => input.value).sort()), [...selectedBuiltinIds].sort())
   await capture(admin, 'selected-library-editor')
   await submit(admin, create, 'Review level')
   const review = await api(`level-reviews/${new URL(admin.url()).searchParams.get('levelReview')}`)
   assert.deepEqual([...review.plan.reports].sort(), [...selectedBuiltinIds].sort())
   assert.deepEqual(review.plan.scope, scope)
   await capture(admin, 'definition-review')
   await applyReview()
   const level = (await api('levels')).levels.find(item => item.name === name)
   assert.ok(level)
   const assignment = admin.locator('form[action="/app/do/level.preview"]').filter({ has: admin.locator('input[name="kind"][value="assignment"]') })
   await assignment.getByLabel('Assign levels to', { exact: true }).selectOption(member.member)
   await assignment.getByLabel(name, { exact: true }).check()
   await submit(admin, assignment, 'Review assignment')
   await capture(admin, 'assignment-review')
   await applyReview()
   await admin.getByLabel('Member', { exact: true }).selectOption(member.member)
   await admin.getByLabel('About this person', { exact: true }).selectOption(near.person)
   await admin.getByRole('button', { name: 'Preview', exact: true }).click()
   const selections = (await api(`preview?member=${member.member}&person=${near.person}`)).reportSelections
   assert.deepEqual(selections.map(item => item.id).sort(), [...selectedBuiltinIds].sort())
   assert.ok(selections.every(item => item.reachesThisPerson))
   for (const id of selectedBuiltinIds) await admin.getByText(catalog.find(item => item.id === id).name, { exact: true }).first().waitFor()
   await capture(admin, 'combined-visibility-preview')

   await visit(reader, '/app')
   if (width === 390) await reader.locator('label[for="menu-toggle"]').click()
   await reader.locator('a[href="/app/reports/library"]').first().click()
   await reader.waitForURL(url => url.pathname === '/app/reports/library')
   assert.deepEqual((await read('builtin-reports')).map(item => item.id).sort(), [...selectedBuiltinIds].sort())
   assert.equal(await reader.locator(`a[href="/app/reports/library/${hidden.id}"]`).count(), 0)
   assert.equal(await reader.locator('form[action="/app/do/report.save"], form[action="/app/do/report.schedule"]').count(), 0)
   await capture(reader, 'selected-library')
   await reader.locator('a[href="/app/reports/library/builtin-headcount"]').click()
   assert.deepEqual((await read('builtin-reports/builtin-headcount')).rows.map(row => row.personId), [near.person])
   assert.ok(!(await reader.locator('body').innerText()).includes('synthetic-willow-12104'))
   await capture(reader, 'scoped-headcount')
   await visit(reader, '/app/reports/library/builtin-payroll')
   assert.equal((await read('builtin-reports/builtin-payroll')).rows[0].cells.payAmount, null)
   const withheldBody = await reader.locator('body').innerText()
   assert.ok(!withheldBody.includes('93456.78') && !withheldBody.includes('93,456.78') && !withheldBody.includes('synthetic-willow-12104'))
   assert.equal(await reader.locator('form[action="/app/do/report.save"], form[action="/app/do/report.schedule"]').count(), 0)
   await reader.getByText('Withheld', { exact: true }).first().waitFor()
   await capture(reader, 'payroll-values-withheld')
   const download = async payVisible => {
    const [file] = await Promise.all([reader.waitForEvent('download'), reader.locator('a[href^="/app/reports/library/builtin-payroll.csv"]').click()])
    assert.equal(await file.failure(), null)
    const csv = await readFile(await file.path(), 'utf8')
    assert.ok(csv.includes('synthetic-willow-12102'))
    assert.ok(!csv.includes('synthetic-willow-12104') && !csv.includes('76543.21'))
    assert.equal(csv.includes('93456.78'), payVisible)
    if (!payVisible) assert.ok(csv.includes('Withheld'))
   }
   await download(false)

   const editor = async () => {
    await visit(admin, '/app/access')
    const form = admin.locator('details').filter({ has: admin.locator('summary').filter({ hasText: new RegExp(`^${name} ·`) }) }).first()
    await form.locator('summary').click()
    return form
   }
   const pay = await editor()
   await pay.locator('select[name="compensationMode.others.pay"]').selectOption('view')
   await submit(admin, pay, 'Review level')
   await capture(admin, 'fine-pay-view-review')
   await applyReview()
   await visit(reader, '/app/reports/library/builtin-payroll')
   assert.equal((await read('builtin-reports/builtin-payroll')).rows[0].cells.payAmount, 'AUD 93456.78 salary')
   await capture(reader, 'payroll-fine-field-view')
   await download(true)

   const revoke = await editor()
   for (const id of selectedBuiltinIds) await revoke.locator(`input[name="reports"][value="${id}"]`).uncheck()
   await submit(admin, revoke, 'Review level')
   await capture(admin, 'selection-revocation-review')
   await applyReview()
   await read('builtin-reports', undefined, 403)
   for (const id of selectedBuiltinIds) {
    await read(`builtin-reports/${id}`, undefined, 403)
    for (const format of ['csv', 'xlsx']) assert.equal((await h.raw(`/app/reports/library/${id}.${format}`, { cookie: member.cookie })).status, 403)
    await visit(reader, `/app/reports/library/${id}`, 403)
   }
   await visit(reader, '/app/reports/library', 403)
   await capture(reader, 'revoked-library')
   await visit(reader, '/app')
   assert.equal(await reader.locator('a[href="/app/reports/library"]').count(), 0)
   await capture(reader, 'revoked-navigation')
  }
  console.log('ROLE-012 native browser: PASS — exact built-in level/review/assignment, combined reach, scoped library, withheld/fine pay CSV, same-session revoked doors and navigation at 1440/390')
 } finally {
  for (const context of contexts) await context.close()
  await browser.close()
 }
}
