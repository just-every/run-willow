// ROLE-011: selected decisions, reviewed pending impact and live native routing.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { evidenceDirectory } from './evidence.mjs'
import { day } from './regression-fixture.mjs'
import { publishTemplate } from './publish-template.mjs'

export async function approvalBrowserProof(h, owner, fx) {
 if (process.env.WILLOW_LEVELS_BROWSER !== '1') return
 assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Use current Playwright on macOS')
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
  const admin = await open(owner), first = await open(fx.staff.managerb.cookie), second = await open(fx.staff.employee.cookie)
  const api = (path, body, status) => h.api(path, owner, body, status)
  const as = (who, path, body, status) => h.api(path, who.cookie, body, status)
  const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
  const assign = (who, levels) => apply({ kind: 'assignment', member: who.member, levels })
  const template = await publishTemplate(h, owner, { name: 'synthetic-willow-9470', kind: 'mover', taskTitle: ['synthetic-willow-9471'], taskAssignee: ['hr'], taskDueDays: ['0'] })
  // The HR subject and submitting owner cannot decide this request. Its work
  // therefore demonstrates selected routing without relying on a native HR fallback.
  const subject = fx.staff.hr, account = await fx.account(subject.period)
  for (const [index, width] of [1440, 390].entries()) {
   for (const page of [admin, first, second]) await page.setViewportSize({ width, height: 1000 })
   const capture = async (page, state) => {
    await page.evaluate(() => document.fonts.ready)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state} fits ${width}`)
    await page.screenshot({ path: `${evidenceDirectory}/ROLE-011-${state}-${width}.png`, fullPage: true })
   }
   const visit = async (page, path) => assert.equal((await page.goto(h.origin + path)).status(), 200, path)
   const submit = async (page, within, button) => {
    await within.getByRole('button', { name: button, exact: true }).click()
    await page.waitForURL(url => url.searchParams.has('notice') || url.searchParams.has('error'))
    assert.ok(!new URL(page.url()).searchParams.has('error'), page.url())
   }
   const n = 9500 + index * 20
   await assign(fx.staff.managerb, [])
   await assign(fx.staff.employee, [])
   const location = await api('location.create', { name: `synthetic-willow-${n}`, timezone: 'UTC' })
   await api('mover.schedule', { period: subject.period, effectiveFrom: day(-5 + index), locationId: location.id, reason: `synthetic-willow-${n + 1}` })
   const levelName = `synthetic-willow-${n + 2}`
   const level = await apply({ kind: 'level', name: levelName, permissions: [], approvals: [], scope: { kind: 'group', dimensions: { location: [location.id] } } })
   await assign(fx.staff.managerb, [level.id])
   const confidential = `synthetic-willow-${n + 3}`
   const leave = await api('leave.request', { account, startDate: day(40 + index), endDate: day(40 + index), reason: confidential })
   const source = `leave:${leave.id}`
   const work = async () => (await api('work')).items.find(item => item.source === source)
   assert.equal((await work()).owner, null)

   const editSelection = async (selected, state, expectedOwner) => {
    await visit(admin, '/app/access')
    const editor = admin.locator('details').filter({ has: admin.locator('summary').filter({ hasText: new RegExp(`^${levelName} ·`) }) }).first()
    await editor.locator('summary').first().click()
    await editor.getByLabel('Leave requests', { exact: true }).setChecked(selected)
    await editor.getByLabel('Compensation changes: Payroll step', { exact: true }).check()
    if (state === 'grant') await capture(admin, 'selected-approval-editor')
    await editor.getByRole('button', { name: 'Review level', exact: true }).click()
    await admin.waitForURL(url => url.searchParams.has('levelReview') || url.searchParams.has('error'))
    assert.ok(!new URL(admin.url()).searchParams.has('error'), admin.url())
    const pending = (await api(`level-reviews/${new URL(admin.url()).searchParams.get('levelReview')}`)).approvalImpact.find(row => row.source === source)
    assert.ok(pending, 'The review names the affected pending request')
    assert.equal(pending.afterOwner, expectedOwner)
    assert.equal(pending.orphaned, expectedOwner === null)
    await admin.getByRole('heading', { name: 'Pending approvals affected', exact: true }).waitFor()
    assert.equal(await admin.locator(`a[href="/app/leave/${leave.id}"]`).count(), 1)
    await capture(admin, `${state}-pending-routing-review`)
    await submit(admin, admin.locator('form[action="/app/do/level.apply"]'), 'Apply reviewed change')
   }
   await editSelection(true, 'grant', fx.staff.managerb.member)
   await visit(first, '/app/tasks')
   assert.equal((await work()).owner, fx.staff.managerb.member)
   await capture(first, 'selected-leave-work')
   await visit(first, `/app/leave/${leave.id}`)
   const admitted = await as(fx.staff.managerb, `leave/${leave.id}`)
   assert.equal(admitted.canDecide, true)
   assert.equal(admitted.balanceMinutes, undefined)
   assert.ok(!('reason' in admitted))
   assert.ok(!(await first.locator('body').innerText()).includes(confidential))
   await capture(first, 'leave-proposal-withheld-fields')

   await assign(fx.staff.employee, [level.id])
   assert.equal((await work()).owner, fx.staff.managerb.member, 'An eligible owner stays assigned')
   await visit(admin, '/app/access')
   const assignment = admin.locator('form[action="/app/do/level.preview"]').filter({ has: admin.locator('input[name="kind"][value="assignment"]') })
   await assignment.getByLabel('Assign levels to', { exact: true }).selectOption(fx.staff.managerb.member)
   // The replacement form starts with no levels selected: this removes this source.
   assert.deepEqual(await assignment.locator('input[name="levels"]:checked').evaluateAll(inputs => inputs.map(input => input.value)), [])
   await assignment.getByRole('button', { name: 'Review assignment', exact: true }).click()
   await admin.waitForURL(url => url.searchParams.has('levelReview'))
   const reassignment = (await api(`level-reviews/${new URL(admin.url()).searchParams.get('levelReview')}`)).approvalImpact.find(row => row.source === source)
   assert.equal(reassignment.afterOwner, fx.staff.employee.member)
   await capture(admin, 'revocation-reassignment-review')
   await submit(admin, admin.locator('form[action="/app/do/level.apply"]'), 'Apply reviewed change')
   await visit(second, '/app/tasks')
   const rerouted = await work()
   assert.equal(rerouted.owner, fx.staff.employee.member)
   assert.ok(rerouted.history.some(event => event.kind === 'approval.routed'))
   await capture(second, 'reassigned-approval-work')
   await as(fx.staff.managerb, `leave/${leave.id}`, undefined, 404)

   await editSelection(false, 'orphan', null)
   await visit(admin, '/app/tasks')
   const orphan = await work()
   assert.equal(orphan.owner, null)
   assert.equal(orphan.orphaned, true)
   assert.deepEqual(orphan.candidates, [])
   await capture(admin, 'orphaned-pending-work')
   await editSelection(true, 'restore', fx.staff.employee.member)
   await visit(second, `/app/leave/${leave.id}`)
   const decision = second.locator('form[action="/app/do/leave.decide"]').filter({ has: second.locator('input[name="decision"][value="approve"]') })
   await submit(second, decision, 'Approve')
   assert.equal((await api(`leave/${leave.id}`)).status, 'approved')
   assert.equal((await as(fx.staff.employee, `leave/${leave.id}`)).canCancel, false)
   await capture(second, 'selected-leave-approved')

   await visit(admin, '/app/changes')
   const chain = admin.locator('details').filter({ has: admin.locator('summary').filter({ hasText: /^Pay changes/ }) }).first()
   await chain.locator('summary').first().click()
   await chain.getByLabel('Mover workflow started on approval', { exact: true }).selectOption(template.id)
   const step = chain.locator('fieldset').first()
   await step.getByLabel('Approver', { exact: true }).selectOption('payroll')
   await step.getByLabel('Selected access level (optional)', { exact: true }).selectOption(level.id)
   await capture(admin, 'bound-compensation-chain-selection')
   await submit(admin, chain, 'Save approval chain')
   const proposed = await api('compensation.record.propose', { person: subject.person, kind: 'bonus', effectiveDate: day(7 + index), amount: '385.25', currency: 'AUD', note: `synthetic-willow-${n + 4}`, reason: `synthetic-willow-${n + 5}` })
   await visit(second, `/app/changes/${proposed.id}`)
   const typed = await as(fx.staff.employee, `change-requests/${proposed.id}`)
   assert.equal(typed.steps[0].level, level.id)
   assert.ok(typed.steps[0].label.includes(levelName))
   assert.equal(typed.mayDecide, true)
   assert.ok(!(await second.locator('body').innerText()).includes('385.25'))
   await capture(second, 'bound-award-proposal-withheld')
   await visit(admin, `/app/changes/${proposed.id}`)
   assert.equal(await admin.locator('form[action="/app/do/change.decide"]').count(), 0)
   await capture(admin, 'requester-has-no-decision')
   const approve = second.locator('form[action="/app/do/change.decide"]')
   await approve.getByLabel('Decision', { exact: true }).selectOption('approve')
   await submit(second, approve, 'Record decision')
   const executed = await api(`change-requests/${proposed.id}`)
   assert.equal(executed.status, 'approved')
   assert.ok((await api(`people/${subject.person}`)).compensationRecords.bonus.some(record => record.id === executed.result.id && record.amountCents === 38525))
   assert.deepEqual((await as(fx.staff.employee, 'me')).permissions, [])
   await capture(second, 'bound-award-approved')

   const personalLevel = await apply({ kind: 'level', name: `synthetic-willow-${n + 6}`, permissions: [], selfFields: { phone: 'approval' }, approvals: ['self:personal'] })
   await assign(fx.staff.employee, [level.id, personalLevel.id])
   const originalPhone = (await as(fx.staff.employee, `people/${fx.staff.employee.person}`)).private.phone
   await visit(second, '/app/self-changes')
   const personal = second.locator('form[action="/app/do/self.request"]').filter({ has: second.locator('input[name="field"][value="phone"]') })
   await personal.locator('..').locator('summary').click()
   await personal.getByLabel('Phone', { exact: true }).fill(`synthetic-willow-${n + 7}`)
   await submit(second, personal, 'Request phone change')
   const personalId = new URL(second.url()).pathname.split('/').pop()
   assert.equal((await as(fx.staff.employee, `self-changes/${personalId}`)).mayDecide, false)
   assert.equal(await second.locator('form[action="/app/do/self.decide"]').count(), 0)
   // A crafted native form cannot bypass the absence of a self-decision control.
   const refused = await h.submit('self.decide', fx.staff.employee.cookie, { change: personalId, decision: 'approve', comment: `synthetic-willow-${n + 8}` }, `/app/self-changes/${personalId}`)
   assert.ok(refused.searchParams.has('error'))
   assert.equal((await as(fx.staff.employee, `self-changes/${personalId}`)).status, 'pending')
   assert.equal((await as(fx.staff.employee, `people/${fx.staff.employee.person}`)).private.phone, originalPhone)
   await second.goto(refused.href)
   assert.equal(await second.locator('form[action="/app/do/self.decide"]').count(), 0)
   await capture(second, 'personal-self-decision-refused')
  }
  console.log('ROLE-011 native browser: PASS — selected editor and pending routing reviews, reassignment/orphans, native leave and bound compensation approval, personal self-decision refusal at 1440/390')
 } finally {
  for (const context of contexts) await context.close()
  await browser.close()
 }
}
