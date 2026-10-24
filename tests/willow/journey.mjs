// The first-release journey in a real browser at 1440 and 390 pixels, run from
// a disposable fresh clone through `rer`: setup, dev with dev
// identity and personas, employer and settings, a joiner with its case, leave
// requested by the employee and approved, a payroll handoff, summaries, the
// visibility preview and a leaver; then build, preview, export and restore
// into a second fresh clone. Every person is invented.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { command, serving } from './cli.mjs'
import { pdf } from './fixtures.mjs'
import { restoreJourney } from './restore.mjs'
import { evidenceDirectory } from './evidence.mjs'

assert.equal(process.env.WILLOW_TEST_CHECKOUT, '1', 'Set WILLOW_TEST_CHECKOUT=1 only in a disposable fresh git clone')
const root = process.cwd()
const deploymentFile = join(root, 'deploy.json')
const deploymentSource = await readFile(deploymentFile, 'utf8')
await access(join(root, '.dev.vars')).then(() => { throw new Error('The journey needs an unconfigured fresh clone') }, error => { if (error.code !== 'ENOENT') throw error })
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const origin = `http://127.0.0.1:${port}`
const scratch = await mkdtemp(join(tmpdir(), 'willow-journey-'))
const zone = 'Australia/Sydney'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now())
const addDays = (date, days) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) }
const monday = (() => { let day = addDays(today, 8); while (new Date(`${day}T00:00:00Z`).getUTCDay() !== 1) day = addDays(day, 1); return day })()
let server, browser

async function shot(page, name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(overflow <= 0, `${name} scrolls sideways by ${overflow}px at ${page.viewportSize().width}`)
  await page.screenshot({ path: join(evidenceDirectory, `${page.viewportSize().width}-${name}.png`), fullPage: true })
}

async function enter(width, url) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForURL(url => /^\/(app|setup)/.test(url.pathname))
  return page
}

const saved = page => page.waitForURL(/notice=Saved/)
const inForm = (page, action) => page.locator(`form[action="/app/do/${action}"]`)

async function journey(width, ownerOpen, employeeOpen, persona) {
  const suffix = ` ${width}`
  const owner = await enter(width, ownerOpen)
  await owner.goto(`${origin}/app`)
  if (new URL(owner.url()).pathname === '/setup') {
    await owner.getByRole('checkbox').check()
    await owner.getByRole('button', { name: 'Finish setup' }).click()
  }
  if (new URL(owner.url()).pathname === '/app/employer') {
    await shot(owner, 'employer')
    await owner.getByLabel('Employer name').fill('Harbour Freight Co')
    await owner.getByLabel('Time zone').selectOption(zone)
    // The BambooHR fixtures this journey imports are an Australian employer's.
    await owner.getByLabel('Country (two-letter code)').fill('AU')
    await owner.getByLabel('Currency (three-letter code)').fill('AUD')
    await owner.getByRole('button', { name: 'Save' }).click()
    await saved(owner)
  }
  // The employee signs in once (dev persona) so HR can link their person record.
  const employee = await enter(width, employeeOpen)

  await owner.goto(`${origin}/app/settings`)
  await inForm(owner, 'location.create').getByLabel('Location name').fill(`Sydney${suffix}`)
  await inForm(owner, 'location.create').getByRole('button').click(); await saved(owner)
  await inForm(owner, 'department.create').getByLabel('Department name').fill(`Operations${suffix}`)
  await inForm(owner, 'department.create').getByRole('button').click(); await saved(owner)
  await inForm(owner, 'schedule.create').getByLabel('Schedule name').fill(`Standard week${suffix}`)
  await inForm(owner, 'schedule.create').getByRole('button').click(); await saved(owner)
  await inForm(owner, 'category.create').getByLabel('Category name').fill(`Contracts${suffix}`)
  await inForm(owner, 'category.create').getByLabel('The person it is about').check()
  await inForm(owner, 'category.create').getByRole('button').click(); await saved(owner)
  const policy = inForm(owner, 'policy.write').last()
  await policy.getByLabel('Policy name').fill(`Annual leave${suffix}`)
  await policy.getByLabel('Policy text').fill('Four weeks of scheduled hours per year of service.')
  await policy.getByRole('button').click(); await saved(owner)
  await owner.getByRole('button', { name: 'Approve version 1' }).first().click(); await saved(owner)
  const template = async (kind, name, task, assignee, system, action) => {
    const form = inForm(owner, 'template.create')
    await form.getByLabel('Kind').selectOption(kind)
    await form.getByLabel('Template name').fill(name)
    const first = form.locator('fieldset').filter({ hasText: 'Task 1' })
    await first.getByLabel('Task', { exact: true }).fill(task)
    await first.getByLabel('Who does it').selectOption(assignee)
    if (system) await first.getByLabel('External system or device (always needs evidence)').fill(system)
    if (action) await first.getByLabel('Willow action').selectOption(action)
    await form.getByRole('button', { name: 'Save template' }).click(); await saved(owner)
    await owner.getByRole('button', { name: 'Review publication', exact: true }).click()
    await owner.getByRole('button', { name: 'Publish reviewed workflow', exact: true }).click(); await saved(owner)
  }
  await template('joiner', `New starter${suffix}`, 'Create email account', 'it', 'Email')
  await template('leaver', `Departure${suffix}`, 'End Willow access', 'hr', '', 'end_access')
  await shot(owner, 'settings')

  // Joiner: person, employment period, first terms and the joiner case.
  await owner.goto(`${origin}/app/people`)
  const joiner = inForm(owner, 'joiner.start')
  await joiner.getByLabel('Joiner template').selectOption({ label: `New starter${suffix} (v1)` })
  await joiner.getByLabel('Legal name').fill(`${persona.name}${suffix}`)
  await joiner.getByLabel('Work email').fill(`${persona.as}@dev.localhost`)
  await joiner.getByLabel('Start date').fill(addDays(today, -100))
  await joiner.getByLabel('Payroll identifier').fill(`PAY-${width}`)
  await joiner.getByLabel('Job title').fill('Coordinator')
  await joiner.getByLabel('Department').selectOption({ label: `Operations${suffix}` })
  await joiner.getByLabel('Location').selectOption({ label: `Sydney${suffix}` })
  await joiner.getByLabel('Working schedule').selectOption({ label: `Standard week${suffix} (40.00 h/week)` })
  await joiner.getByLabel('Pay basis').selectOption('salary')
  await joiner.getByLabel('Pay amount').fill('78000')
  await joiner.getByRole('button', { name: 'Start joiner' }).click()
  await owner.getByRole('heading', { name: new RegExp(`Joiner: ${persona.name}`) }).waitFor()
  await owner.getByLabel('Evidence (required)').fill('Mailbox created in the email admin console')
  await owner.getByRole('button', { name: 'Mark done' }).click(); await saved(owner)
  await owner.getByRole('button', { name: 'Complete case' }).click(); await saved(owner)
  await shot(owner, 'case')
  await owner.getByRole('link', { name: new RegExp(persona.name) }).first().click()
  const personUrl = owner.url().split('?')[0]
  await owner.getByRole('button', { name: 'Give access' }).click(); await saved(owner)
  await owner.getByText('Open a leave account').click()
  await inForm(owner, 'account.open').getByLabel('Opening balance (hours)').fill('38')
  await inForm(owner, 'account.open').getByLabel('Where the opening balance comes from').fill('Balance in the old spreadsheet at cutover')
  await inForm(owner, 'account.open').getByRole('button').click(); await saved(owner)
  await owner.getByRole('button', { name: 'Sign off opening balance' }).click(); await saved(owner)
  await owner.getByText('Add a document').click()
  const documentFile = join(scratch, `contract-${width}.pdf`)
  await writeFile(documentFile, pdf(`contract ${width}`))
  await inForm(owner, 'document.add').last().getByLabel('Title').fill('Employment contract')
  await inForm(owner, 'document.add').last().locator('input[type=file]').setInputFiles(documentFile)
  await inForm(owner, 'document.add').last().getByRole('button', { name: 'Add document' }).click(); await saved(owner)
  await shot(owner, 'person')

  // The employee requests leave from their schedule; the reason stays confidential.
  await employee.goto(`${origin}/app/leave`)
  await employee.getByLabel('First day').fill(monday)
  await employee.getByLabel('Last day').fill(addDays(monday, 1))
  await employee.getByRole('button', { name: 'Calculate' }).click()
  await employee.getByRole('heading', { name: '16.00 hours from your working schedule' }).waitFor()
  await shot(employee, 'leave-quote')
  await employee.getByLabel(/Reason/).fill('Family matter')
  await employee.getByRole('button', { name: 'Submit request' }).click(); await saved(employee)
  await shot(employee, 'leave-request')

  await owner.goto(`${origin}/app`)
  await shot(owner, 'home')
  await owner.getByRole('link', { name: new RegExp(`${persona.name}${suffix}:`) }).first().click()
  await owner.getByRole('button', { name: 'Approve' }).click(); await saved(owner)
  await owner.getByText('approved').first().waitFor()

  // Payroll handoff: a draft, its export and the provider's acknowledgement.
  await owner.goto(`${origin}/app/payroll`)
  await owner.getByText('Owner layout mapping', {exact:true}).click()
  await owner.getByRole('button', {name:'Select generic change CSV',exact:true}).click(); await saved(owner)
  await owner.getByLabel('Pay period start').fill(addDays(today, -13))
  await owner.getByLabel('Pay period end').fill(addDays(monday, 6))
  await owner.getByRole('button', { name: 'Prepare draft' }).click(); await saved(owner)
  await owner.getByText(`PAY-${width}`).first().waitFor()
  await owner.getByRole('button', { name: 'Preview export file' }).click(); await saved(owner)
  await owner.getByRole('button', { name: 'Export this batch' }).click(); await saved(owner)
  await owner.getByRole('link', { name: 'Download CSV' }).waitFor()
  await owner.getByLabel('Provider reference').fill(`PROVIDER-${width}`)
  await owner.getByRole('button', { name: 'Record provider acknowledgement' }).click(); await saved(owner)
  await shot(owner, 'payroll')

  await owner.goto(`${origin}/app/reports`)
  await owner.getByRole('heading', { name: /Headcount/ }).waitFor()
  await shot(owner, 'reports')

  await owner.goto(`${origin}/app/access`)
  await owner.getByLabel('Member').selectOption({ label: persona.member })
  await owner.getByLabel('About this person').selectOption({ label: `${persona.name}${suffix}` })
  await owner.getByRole('button', { name: 'Preview' }).click()
  await owner.getByRole('cell', { name: 'Compensation' }).waitFor()
  await shot(owner, 'access-preview')

  // Leaver: end date and the leaver case; ending access is a recorded task.
  await owner.goto(personUrl)
  await owner.getByText('Record a leaver').click()
  await inForm(owner, 'leaver.start').getByLabel('Last day of employment').fill(addDays(monday, 30))
  await inForm(owner, 'leaver.start').getByLabel('Reason (private)').fill('Moving interstate')
  await inForm(owner, 'leaver.start').getByRole('button').click(); await saved(owner)
  await owner.getByRole('link', { name: /Leaver from/ }).click()
  await owner.getByRole('button', { name: 'End access and mark done' }).click(); await saved(owner)
  await owner.getByRole('button', { name: 'Complete case' }).click(); await saved(owner)
  await shot(owner, 'leaver')
  await employee.goto(`${origin}/app`)
  assert.notEqual(new URL(employee.url()).pathname, '/app', 'ended access no longer opens Willow')
  await owner.context().close()
  await employee.context().close()
}

try {
  await command(root, ['describe'])
  await command(root, ['check', '--profile', 'first-party'])
  await command(root, ['install'])
  // Setup reads answers only from inside the checkout; exports/ is ignored by Git and never served.
  await mkdir(join(root, 'exports'), { recursive: true })
  const answers = join(root, 'exports/answers.json')
  await writeFile(answers, JSON.stringify({ OWNER_EMAIL: 'owner@example.com' }), { mode: 0o600 })
  await chmod(answers, 0o600)
  await command(root, ['setup', '--answers', 'exports/answers.json', '--non-interactive', '--port', String(port)])
  server = await serving(root, 'dev', port)
  const ownerOpen = server.open()
  assert.ok(ownerOpen && server.output().includes('RER_SIGNED_IN owner@example.com'))
  const personaOpen = async as => (await command(root, ['dev', '--port', String(port), '--as', as])).match(/RER_OPEN (\S+)/)[1]
  browser = await chromium.launch({ headless: true })
  for (const [width, persona] of [[1440, { as: 'employee', name: 'Sam Patel', member: 'Sam Patel (employee)' }], [390, { as: 'manager', name: 'Jordan Lee', member: 'Jordan Lee (manager)' }]]) {
    try { await journey(width, ownerOpen, await personaOpen(persona.as), persona) } catch (error) {
      for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) await page.screenshot({ path: join(evidenceDirectory, `${width}-failure-${index}.png`), fullPage: true }).catch(() => {})
      throw error
    }
  }
  await browser.close(); browser = null
  await server.stop(); server = null
  console.log('Journey passed at 1440 and 390: setup, employer, settings, joiner case, access, leave balance sign-off, document, leave request and approval, payroll handoff, summaries, visibility preview, leaver')

  await command(root, ['build'])
  server = await serving(root, 'preview', port)
  assert.equal((await fetch(`${origin}/health`)).status, 200)
  assert.equal((await fetch(`${origin}/signin`)).status, 200)
  await server.stop(); server = null
  // A valid test sender lets dry runs reach the missing-credential boundary.
  const deployment = JSON.parse(deploymentSource)
  const { domain } = JSON.parse(await readFile(join(root, 'deploy-site.json'), 'utf8'))
  deployment.vars.MAIL_FROM = `Willow <synthetic-willow-1@${domain}>`
  await writeFile(deploymentFile, JSON.stringify(deployment, null, 2) + '\n')
  // Dry runs build the artifact, then refuse when target secret bindings cannot be checked.
  const dryRun = await command(root, ['deploy', '--dry-run'], { expectedExit: 3 })
  assert.match(dryRun, /CLOUDFLARE_ACCOUNT_ID/)
  assert.match(dryRun, /CLOUDFLARE_API_TOKEN/)
  assert.match(dryRun, /MAIL_API_KEY/)
  await mkdir(join(root,'exports'), {recursive:true})
  await writeFile(join(root,'exports/production-test.env'), 'MAIL_API_KEY=test-no-network-mail-key\n', {mode:0o600})
  const suppliedMail = await command(root, ['deploy', '--dry-run', '--env-file', 'exports/production-test.env'], { expectedExit: 3 })
  assert.match(suppliedMail, /CLOUDFLARE_ACCOUNT_ID/)
  assert.match(suppliedMail, /CLOUDFLARE_API_TOKEN/)
  await writeFile(deploymentFile, deploymentSource)
  await restoreJourney({ root, target: join(scratch, 'target'), port })
} finally {
  await browser?.close()
  await server?.stop().catch(() => {})
  await writeFile(deploymentFile, deploymentSource)
  await rm(scratch, { recursive: true, force: true })
}
