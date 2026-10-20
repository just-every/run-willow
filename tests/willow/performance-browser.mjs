// Optional PERFORM-001 evidence against the same real Worker and native forms.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { day } from './regression-fixture.mjs'

const form = (page, action) => page.locator(`form[action="/app/do/${action}"]`)

async function openForms(page) {
 for (const summary of await page.locator('details > summary').all()) {
  if (await summary.locator('..').getAttribute('open') === null) await summary.click()
 }
}

async function submit(page, target, button) {
 const action = await target.getAttribute('action')
 const [response] = await Promise.all([
  page.waitForResponse(response => new URL(response.url()).pathname === action && response.request().method() === 'POST'),
  page.waitForNavigation({ waitUntil: 'load' }),
  target.getByRole('button', { name: button, exact: true }).click(),
 ])
 assert.equal(response.status(), 303, `${action} submits through the native form door`)
 const url = new URL(page.url())
 assert.equal(url.searchParams.has('error'), false, `${action} succeeds: ${url.searchParams.get('error') ?? ''}`)
 assert.ok(url.searchParams.has('notice'), `${action} confirms the saved action`)
}

// Invoke before the journey revokes the subject's access, after their transfer
// to staff.managerb. Each width creates independent records through the UI.
// ids: { cycle: retained closed cycle, person: employee person, subjectCookie }.
export async function browserEvidence(h, owner, staff, ids) {
 if (process.env.WILLOW_PERFORMANCE_BROWSER !== '1') return
 const destination = process.env.WILLOW_EVIDENCE_DIR
 assert.ok(destination, 'WILLOW_EVIDENCE_DIR is required for browser evidence')
 assert.ok(ids.cycle && ids.person && ids.subjectCookie, 'Retained cycle and active review subject are required')
 if (process.platform === 'darwin') {
  assert.ok(process.env.WILLOW_PLAYWRIGHT_PATH, 'Use a current Playwright browser build on this Mac')
  assert.equal(resolve(process.env.HOME ?? ''), resolve(userInfo().homedir), 'Browser driver must retain the real HOME')
 }
 await mkdir(destination, { recursive: true })
 const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const contexts = []
 try {
  const pages = {}
  for (const [role, cookie] of Object.entries({ owner, hr: staff.hr.cookie, subject: ids.subjectCookie, peer: staff.managera.cookie, manager: staff.managerb.cookie })) {
   const context = await browser.newContext({ ignoreHTTPSErrors: true })
   contexts.push(context)
   await context.addCookies(cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
   pages[role] = await context.newPage()
  }
  const visit = async (page, path) => assert.equal((await page.goto(h.origin + path)).status(), 200, 'Performance page is available to its current reader')
  for (const width of [1440, 390]) {
   for (const page of Object.values(pages)) await page.setViewportSize({ width, height: 1000 })
   const capture = async (page, name) => {
    await openForms(page)
    await page.evaluate(() => document.fonts.ready)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `PERFORM-001 ${name} fits ${width}`)
    await page.screenshot({ path: `${destination}/PERFORM-001-${name}-${width}.png`, fullPage: true })
   }
   const { owner: ownerPage, hr, subject, peer, manager } = pages
   for (const role of ['owner', 'hr', 'subject', 'manager']) {
    await visit(pages[role], `/app/performance/${ids.cycle}`)
    await capture(pages[role], `${role}-retained-cycle`)
   }

   await visit(ownerPage, '/app/performance')
   await openForms(ownerPage)
   const launch = form(ownerPage, 'performance.cycle')
   await launch.getByLabel('Cycle name', { exact: true }).fill(`Browser review ${width}`)
   await launch.getByLabel('Due date', { exact: true }).fill(day(40))
   await launch.getByLabel('Review subjects', { exact: true }).selectOption([ids.person])
   for (const [role, question] of [['Self', 'Which delivery did you complete?'], ['Peer', 'Which collaboration did you observe?'], ['Manager', 'Which agreed outcome improved?']]) {
    await launch.getByLabel(`${role} questions (one per line)`, { exact: true }).fill(question)
   }
   await capture(ownerPage, 'owner-launch-form')
   await submit(ownerPage, launch, 'Launch cycle')
   const cycle = new URL(ownerPage.url()).pathname.split('/').pop()
   const path = `/app/performance/${cycle}`
   assert.equal((await h.api(`performance/${cycle}`, owner)).cycle.status, 'open')
   await capture(ownerPage, 'owner-cycle-launched')

   await visit(hr, path)
   const assignments = []
   for (const [role, member, page] of [['self', staff.employee.member, subject], ['peer', staff.managera.member, peer], ['manager', staff.managerb.member, manager]]) {
    await openForms(hr)
    const request = form(hr, 'performance.assign')
    await request.getByLabel('Subject', { exact: true }).selectOption(ids.person)
    await request.getByLabel('Contributor', { exact: true }).selectOption(member)
    await request.getByLabel('Role', { exact: true }).selectOption(role)
    await request.getByLabel('Due date', { exact: true }).fill(day(30))
    await capture(hr, `hr-request-${role}-form`)
    await submit(hr, request, 'Request input')
    const assignment = (await h.api(`performance/${cycle}`, staff.hr.cookie)).assignments.find(a => a.role === role && a.member_id === member)
    assert.ok(assignment, 'Requested contributor is retained')
    assignments.push(assignment)
    await visit(page, path)
    const input = form(page, 'performance.respond')
    assert.equal(await input.count(), 1)
    const answer = `Browser ${width} ${role} evidence of the agreed delivery`
    await input.locator('textarea[name="answers"]').fill(answer)
    await capture(page, `${role}-input-form`)
    await submit(page, input, 'Submit input')
    const permitted = await h.api(`performance/${cycle}`, role === 'self' ? ids.subjectCookie : role === 'peer' ? staff.managera.cookie : staff.managerb.cookie)
    assert.ok(permitted.inputs.some(i => i.assignment_id === assignment.id && i.answers.includes(answer)))
    assert.ok(permitted.inputs.every(i => i.author === member), 'Contributor sees only their own named inputs')
    await capture(page, `${role}-input-saved`)
   }

   await visit(hr, path)
   await openForms(hr)
   const calibration = form(hr, 'performance.note')
   const privateNote = `Browser ${width} private HR calibration discussion`
   await calibration.getByLabel('Subject', { exact: true }).selectOption(ids.person)
   await calibration.getByLabel('Human rating', { exact: true }).fill('Calibrated outcome')
   await calibration.getByLabel('Private HR note', { exact: true }).fill(privateNote)
   await capture(hr, 'hr-calibration-form')
   await submit(hr, calibration, 'Record calibration')
   assert.ok((await h.api(`performance/${cycle}`, staff.hr.cookie)).notes.some(n => n.note === privateNote))
   await capture(hr, 'hr-calibration-saved')

   const release = form(hr, 'performance.release')
   const summary = `Browser ${width} released human summary of the agreed delivery`
   await release.getByLabel('Subject', { exact: true }).selectOption(ids.person)
   await release.getByLabel('Human rating', { exact: true }).fill('Meets agreed outcomes')
   await release.getByLabel('Released summary', { exact: true }).fill(summary)
   await capture(hr, 'hr-release-form')
   await submit(hr, release, 'Release summary')
   const released = (await h.api(`performance/${cycle}`, staff.hr.cookie)).summaries.find(s => s.summary === summary)
   assert.ok(released)
   await capture(hr, 'hr-summary-released')
   for (const [role, page] of [['subject', subject], ['manager', manager]]) {
    await visit(page, path)
    assert.ok((await page.locator('main').innerText()).includes(summary), 'Recipient can read the released summary')
    assert.ok(!(await page.locator('main').innerText()).includes(privateNote), 'Private HR calibration stays withheld')
    await capture(page, `${role}-released-summary`)
   }
   await submit(subject, form(subject, 'performance.ack'), 'Acknowledge result')
   await capture(subject, 'subject-acknowledged')
   const appeal = form(subject, 'performance.appeal')
   const reason = `Browser ${width} appeal requests recognition of the recovery exercise`
   await appeal.getByLabel('Appeal or correction request', { exact: true }).fill(reason)
   await capture(subject, 'subject-appeal-form')
   await submit(subject, appeal, 'Record appeal')
   const subjectView = await h.api(`performance/${cycle}`, ids.subjectCookie)
   assert.ok(subjectView.acknowledgments.some(a => a.summary_id === released.id && a.member_id === staff.employee.member))
   assert.ok(subjectView.appeals.some(a => a.summary_id === released.id && a.reason === reason))
   await capture(subject, 'subject-appeal-recorded')

   await visit(hr, path)
   const withhold = form(hr, 'performance.withhold')
   await withhold.getByLabel('Future manager', { exact: true }).selectOption(staff.managera.member)
   await withhold.getByLabel('Reason for withholding this named summary', { exact: true }).fill('Discuss the release before a future transfer')
   await capture(hr, 'hr-withhold-form')
   await submit(hr, withhold, 'Withhold future transfer')
   await capture(hr, 'hr-transfer-withheld')
   await submit(hr, form(hr, 'performance.close'), 'Lock completed cycle')
   const locked = await h.api(`performance/${cycle}`, staff.hr.cookie)
   assert.equal(locked.cycle.status, 'closed')
   assert.equal(locked.assignments.length, assignments.length)
   assert.equal(await form(hr, 'performance.respond').count(), 0)
   await capture(hr, 'hr-cycle-locked')
   await visit(subject, path)
   assert.equal(await form(subject, 'performance.respond').count(), 0, 'Locked cycle no longer offers input edits')
   await capture(subject, 'subject-locked-history')

   await visit(subject, '/app/goals')
   await openForms(subject)
   const create = form(subject, 'goal.create')
   const title = `Browser development ${width}`
   await create.getByLabel('Person', { exact: true }).selectOption(ids.person)
   await create.getByLabel('Goal title', { exact: true }).fill(title)
   await create.getByLabel('Milestone', { exact: true }).fill('Lead a recovery exercise')
   await create.getByLabel('Due date', { exact: true }).fill(day(60))
   await create.getByLabel('Owner', { exact: true }).selectOption(staff.employee.member)
   await create.getByLabel('Development action', { exact: true }).check()
   await capture(subject, 'subject-goal-create-form')
   await submit(subject, create, 'Create goal')
   const goalCard = subject.locator('section.card').filter({ has: subject.getByRole('heading', { name: title, exact: true }) })
   const checkin = form(goalCard, 'goal.checkin')
   const goal = await checkin.locator('input[name="goal"]').inputValue()
   await capture(subject, 'subject-goal-created')
   await checkin.getByLabel('Progress percent', { exact: true }).fill('100')
   await checkin.getByLabel('Check-in note', { exact: true }).fill(`Browser ${width} completed the recovery exercise`)
   await capture(subject, 'subject-goal-checkin-form')
   await submit(subject, checkin, 'Record check-in')
   await capture(subject, 'subject-goal-checkin-saved')
   const complete = form(goalCard, 'goal.complete')
   const evidence = `Browser ${width} recovery retrospective reviewed by the response owner`
   await complete.getByLabel('Completion evidence', { exact: true }).fill(evidence)
   await capture(subject, 'subject-goal-complete-form')
   await submit(subject, complete, 'Complete development action')
   const saved = (await h.api('goals', ids.subjectCookie)).goals.find(g => g.id === goal)
   assert.ok(saved.checkins.some(c => c.progress === 100))
   assert.equal(saved.completion.evidence, evidence)
   await capture(subject, 'subject-development-completed')
   for (const role of ['hr', 'manager']) {
    await visit(pages[role], '/app/goals')
    await capture(pages[role], `${role}-development-history`)
   }
  }
 } finally {
  try {
   for (const context of contexts) await context.close()
  } finally {
   await browser.close()
  }
 }
}
