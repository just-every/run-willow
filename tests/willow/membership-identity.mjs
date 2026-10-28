import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { publishTemplate } from './publish-template.mjs'

const h = await harness()
let browser
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Willow Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  assert.equal((await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
  const ownerApi = (path, body, status) => h.api(path, owner, body, status)
  await ownerApi('employer.configure', { name: 'Membership identity example', timezone: 'UTC', country: 'AU', currency: 'AUD' })
  const schedule = (await ownerApi('schedule.create', { name: 'Weekdays', mon: '8', tue: '8', wed: '8', thu: '8', fri: '8' })).id
  const template = await publishTemplate(h, owner, { name: 'Employee', kind: 'joiner', taskTitle: ['Welcome'], taskAssignee: ['hr'], taskDueDays: ['0'] })

  const join = async (name, email, phone) => {
    const started = await ownerApi('joiner.start', { template: template.id, legalName: name, workEmail: email, startDate: '2026-01-05', employmentType: 'full_time', jobTitle: 'Team member', scheduleId: schedule, phone })
    const member = await ownerApi('access.give', { person: started.person })
    return { ...started, member: member.id, cookie: await h.signIn(email, { requested: true }) }
  }

  const hrEmail = 'harper.hr@example.com'
  const hr = await join('Harper HR', hrEmail, 'PRIVATE-HR-PHONE')
  const member = await join('Morgan Member', 'morgan.member@example.com', 'PRIVATE-MEMBER-PHONE')
  const subject = await join('Taylor Subject', 'taylor.subject@example.com', 'PRIVATE-SUBJECT-PHONE')

  const levelReview = await ownerApi('level.preview', { kind: 'level', name: 'HR access', permissions: ['people.manage', 'people.private'] })
  const level = await ownerApi('level.apply', { review: levelReview.id })
  const assignment = await ownerApi('level.preview', { kind: 'assignment', member: hr.member, levels: [level.id] })
  await ownerApi('level.apply', { review: assignment.id })
  hr.cookie = await h.signIn(hrEmail)

  assert.equal((await h.api(`people/${subject.person}`, hr.cookie)).private.phone, 'PRIVATE-SUBJECT-PHONE')
  assert.equal((await h.api(`people/${subject.person}`, member.cookie)).private?.phone, undefined)
  const originalMember = await h.api('me', member.cookie)
  assert.equal(originalMember.id, member.member)

  assert.equal((await h.raw('/auth/email', { cookie: hr.cookie, body: { email: 'harper.new@example.com' } })).status, 200)
  assert.equal((await h.api('me', hr.cookie)).id, hr.member)
  assert.equal((await h.api(`people/${subject.person}`, hr.cookie)).private.phone, 'PRIVATE-SUBJECT-PHONE')
  assert.equal((await h.raw('/auth/email', { cookie: member.cookie, body: { email: hrEmail } })).status, 200)

  const afterChange = await h.api('me', member.cookie)
  assert.equal(afterChange.id, originalMember.id, 'changing sign-in email must not select another Willow membership')
  assert.equal((await h.api(`people/${subject.person}`, member.cookie)).private?.phone, undefined, 'changing sign-in email must not grant the former holder\'s private-field access')
  if (process.env.WILLOW_MEMBERSHIP_BROWSER === '1') {
    const { evidenceDirectory } = await import('./evidence.mjs')
    browser = await (await import(process.env.WILLOW_PLAYWRIGHT_PATH || '@playwright/test')).chromium.launch({ headless: true, executablePath: process.env.WILLOW_BROWSER_EXECUTABLE, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
    for (const [name, cookie, path] of [['access', owner, '/app/access'], ['member', member.cookie, `/app/people/${subject.person}`]]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true })
      await context.addCookies(cookie.split('; ').map(value => ({ name: value.slice(0, value.indexOf('=')), value: value.slice(value.indexOf('=') + 1), url: h.origin })))
      const page = await context.newPage()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto(h.origin + path)
        await page.evaluate(() => document.fonts.ready)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        if (name === 'access') assert.equal(await page.getByRole('heading', { name: 'Members' }).isVisible(), true)
        else assert.equal((await page.locator('body').innerText()).includes('PRIVATE-SUBJECT-PHONE'), false)
        await page.screenshot({ path: `${evidenceDirectory}/membership-${name}-${width}.png`, fullPage: true })
      }
      await context.close()
    }
  }
  console.log('Willow membership remains bound to the operator after sign-in email changes: PASS')
} finally {
  if (browser) await browser.close()
  await h.close()
}
