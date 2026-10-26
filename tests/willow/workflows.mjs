// FLOW-001: production Worker/storage, public forms and JSON, real scoped members.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { harness } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'
import { publishTemplate } from './publish-template.mjs'
import { workflowSigningProof } from './workflow-signing.mjs'

const h = await harness()
let browser
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const f = await fixture(h, owner,{names:{employee:'Maya Chen',hr:'Riley Morgan',managera:'Jordan Lee',managerb:'Taylor Reed',payroll:'Alex Patel'}}), s = f.staff
  const api = (path, body, status) => h.api(path, owner, body, status)
  await api('employer.configure', { name: 'Juniper Field Services', timezone: 'America/New_York', country: 'US', currency: 'USD' })
  const ny = (await api('location.create', { name: 'New York office', timezone: 'America/New_York', workState: 'NY' })).id
  const ca = (await api('location.create', { name: 'California workshop', timezone: 'America/Los_Angeles', workState: 'CA' })).id
  const it = await f.join('Sam Rivera', { workEmail: 'sam@example.com', locationId: ny })
  const itMember = await api('access.give', { person: it.person })
  await api('member.permissions', { member: itMember.id, permissions: ['it.tasks'] })
  const itCookie = await h.signIn('sam@example.com', { requested: true })
  const originalNY = await f.join('Priya Shah', { workEmail: 'priya@example.com', locationId: ny, jobTitle: 'Field specialist' })
  const originalCA = await f.join('Ana Martinez', { workEmail: 'ana@example.com', locationId: ca, jobTitle: 'Field specialist' })
  const otherNY = (await api('location.create', { name: 'Albany branch', timezone: 'America/New_York', workState: 'NY' })).id
  const wrongTitle = await f.join('Ava Johnson', { workEmail: 'ava@example.com', locationId: ny, jobTitle: 'Designer' })
  const wrongType = await f.join('Ethan Davis', { workEmail: 'ethan@example.com', locationId: ny, jobTitle: 'Field specialist', employmentType: 'part_time' })
  const wrongLocation = await f.join('Sofia Patel', { workEmail: 'sofia@example.com', locationId: otherNY, jobTitle: 'Field specialist' })
  const recipe = {
    kind: 'joiner', name: 'State-specific first week', requiredFields: [],
    taskTitle: ['Review employment record', 'Approve payroll setup', 'Prepare NY account', 'Confirm first day', 'California orientation'],
    taskAssignee: ['hr', 'payroll', 'it', 'manager', 'hr'], taskDueDays: ['-2', '-1', '0', '1', '0'],
    taskSystem: ['', '', 'Identity provider', '', ''], taskEvidence: ['yes', 'yes', 'yes', 'no', 'no'],
    taskRules: [
      {},
      { conditions: { jobTitle: 'field SPECIALIST', workState: 'NY', employmentType: 'full_time', location: ny }, dependencies: [1] },
      { conditions: { workState: 'NY' }, dependencies: [2] },
      { dependencies: [3] },
      { conditions: { workState: 'CA' } },
    ],
  }
  await api('template.create', { ...recipe, taskRules: [{ dependencies: [2] }, {}, {}, {}, {}] }, 400)
  await h.api('template.create', s.employee.cookie, recipe, 403)
  const formDraft = await h.submit('template.create', owner, { kind: 'joiner', name: 'Sparse numbered editor', taskTitle: ['First', '', 'Third', '', 'Fifth'], taskAssignee: ['hr', 'hr', 'hr', 'hr', 'hr'], taskDueDays: ['0', '0', '0', '0', '0'], taskDependencies: ['', '', '1', '', '3'] }, '/app/settings')
  assert.ok(!formDraft.searchParams.has('error'))
  const sparse = (await api('templates')).find(t => t.name === 'Sparse numbered editor')
  assert.deepEqual(sparse.tasks.map(t => t.rule.dependencies), [[], [1], [2]], 'Visible editor numbers survive blank rows')
  const sparseReview = await api('template.preview', { template: sparse.id }); await api('template.publish', { review: sparseReview.id })
  const draft = await api('template.create', recipe)
  assert.equal((await api('templates')).find(t => t.id === draft.id).status, 'draft')
  await f.join('Unpublished workflow', { template: draft.id, workEmail: 'unpublished@example.com' }).then(() => assert.fail('draft must not start work'), e => assert.match(e.message, /404/))
  const preview = await api('template.preview', { template: draft.id, asOf: today })
  const previewNY = preview.detail.affected.find(p => p.person === originalNY.person)
  const previewCA = preview.detail.affected.find(p => p.person === originalCA.person)
  assert.equal(previewNY.name, 'Priya Shah')
  for (const person of [wrongTitle, wrongType, wrongLocation]) assert.ok(!preview.detail.affected.find(p => p.person === person.person).tasks.some(t => t.title === recipe.taskTitle[1]), 'Every configured condition must match')
  assert.ok(previewNY.tasks.find(t => t.position === 2).recipients.some(m => m.id === s.payroll.member), 'Preview names the payroll assignment')
  assert.ok(previewNY.tasks.find(t => t.position === 3).recipients.some(m => m.id === itMember.id), 'Preview names the IT assignment')
  assert.deepEqual(previewNY.tasks.map(t => t.title), recipe.taskTitle.slice(0, 4))
  assert.deepEqual(previewCA.tasks.map(t => t.title), [recipe.taskTitle[0], recipe.taskTitle[3], recipe.taskTitle[4]])
  assert.deepEqual(previewCA.tasks.find(t => t.position === 4).dependencies, [], 'A condition-skipped prerequisite does not block unrelated work')
  assert.equal(previewNY.tasks[0].dueDate, day(-2))
  assert.equal(previewNY.tasks[2].system, 'Identity provider')
  assert.ok(previewNY.tasks[2].evidenceRequired)
  assert.equal((await api(`cases/${originalNY.case}`)).tasks.length, 1, 'Preview does not apply a workflow')
  assert.equal((await h.raw(`/app/settings?review=${preview.id}`, { cookie: s.hr.cookie })).status, 404, 'Another authorized HR member cannot read this member-bound preview')
  await h.api('template.publish', s.hr.cookie, { review: preview.id }, 404)
  await api('department.create', { name: 'Field operations' })
  await api('template.publish', { review: preview.id }, 409)
  const fresh = await api('template.preview', { template: draft.id, asOf: today })
  await api('template.publish', { review: fresh.id })
  await api('template.publish', { review: fresh.id }, 409)
  const a = await f.join('Lena Brooks', { workEmail: 'lena@example.com', template: draft.id, startDate: today, locationId: ny, jobTitle: 'Field specialist', managerPersonId: s.managera.person })
  const b = await f.join('Noah Chen', { workEmail: 'noah@example.com', template: draft.id, startDate: today, locationId: ca, jobTitle: 'Field specialist', managerPersonId: s.managera.person })
  let current = await api(`cases/${a.case}`)
  const tasks = current.tasks
  assert.deepEqual(tasks.map(t => t.title), recipe.taskTitle.slice(0, 4))
  assert.deepEqual((await api(`cases/${b.case}`)).tasks.map(t => t.title), [recipe.taskTitle[0], recipe.taskTitle[3], recipe.taskTitle[4]])
  assert.equal(tasks[0].dueDate, day(-2))
  await h.api('task.complete', s.payroll.cookie, { task: tasks[1].id, evidence: 'Payroll reviewed' }, 409)
  await h.api('task.complete', s.employee.cookie, { task: tasks[0].id, evidence: 'Not HR' }, 403)
  await h.api('task.complete', s.hr.cookie, { task: tasks[0].id, evidence: 'Employment reviewed by HR' })
  await h.api('task.complete', s.hr.cookie, { task: tasks[1].id, evidence: 'HR is not payroll' }, 403)
  await h.api('task.complete', s.payroll.cookie, { task: tasks[1].id, evidence: 'Payroll input checked' })
  await h.api('task.fail', s.employee.cookie, { task: tasks[2].id, failure: 'Not IT' }, 403)
  await h.api('task.fail', itCookie, { task: tasks[2].id, failure: 'Provider rejected the account; IT must correct its input' })
  await h.api('task.complete', itCookie, { task: tasks[2].id }, 400)
  await h.api('task.complete', s.managera.cookie, { task: tasks[3].id }, 409)
  await api('case.complete', { case: a.case }, 409)
  current = await api(`cases/${a.case}`)
  assert.equal(current.status, 'open')
  assert.ok(current.tasks[2].failure)
  assert.deepEqual(current.tasks[3].blockedBy.map(t => t.id), [tasks[2].id])
  const work = (await api('work')).items.find(w => w.source === `task:${tasks[2].id}`)
  assert.ok(work.owner && work.dueDate && work.nextAction, 'New workflow work inherits FLOW-002 ownership and deadlines')
  assert.match(work.progress, /failed/)
  const v2 = await publishTemplate(h, owner, { ...recipe, family: draft.family, requiredFields: ['work_email'], name: 'State-specific first week, revised', taskTitle: [...recipe.taskTitle.slice(0, 2), 'Prepare reviewed NY account', ...recipe.taskTitle.slice(3)] })
  assert.equal((await api(`cases/${a.case}`)).template.id, draft.id)
  assert.equal((await api(`cases/${b.case}`)).template.id, draft.id, 'Both existing cases remain pinned after publication')
  const c = await f.join('Mia Wilson', { workEmail: 'mia@example.com', template: v2.id, startDate: today, locationId: ny, jobTitle: 'Field specialist' })
  assert.equal((await api(`cases/${c.case}`)).template.id, v2.id)
  const upgrade = await api('case.upgrade.preview', { case: a.case, template: v2.id })
  assert.deepEqual(upgrade.detail.requiredFields, { before: [], after: ['work_email'] })
  assert.deepEqual(upgrade.detail.retainedCompleted.map(t => t.id), tasks.slice(0, 2).map(t => t.id))
  assert.ok(upgrade.detail.tasks.find(t => t.title === recipe.taskTitle[1]).reusedCompletion)
  assert.ok(upgrade.detail.supersededOpen.find(t => t.id === tasks[2].id).failure)
  assert.equal((await api(`cases/${a.case}`)).template.id, draft.id, 'Upgrade preview is read-only for business work')
  await h.api('case.upgrade', s.employee.cookie, { review: upgrade.id }, 403)
  await api('case.upgrade', { review: upgrade.id })
  current = await api(`cases/${a.case}`)
  assert.equal(current.template.id, v2.id)
  assert.deepEqual(current.tasks.filter(t => t.status === 'done').map(t => [t.id, t.evidence]), tasks.slice(0, 2).map((t, i) => [t.id, i ? 'Payroll input checked' : 'Employment reviewed by HR']))
  assert.equal(current.upgrades.length, 1)
  assert.ok(JSON.parse(current.upgrades[0].detail).supersededOpen.some(t => t.id === tasks[2].id))
  assert.ok(!(await api('work')).items.some(w => w.source === `task:${tasks[2].id}`), 'Superseded work stops reminder follow-up')
  await h.api('task.complete', itCookie, { task: tasks[2].id, evidence: 'Old task cannot be completed' }, 409)
  const newIT = current.tasks.find(t => t.title === 'Prepare reviewed NY account')
  await h.api('task.complete', itCookie, { task: newIT.id, evidence: 'Observed account at provider; IT recorded evidence' })
  const managerTask = (await api(`cases/${a.case}`)).tasks.find(t => t.title === recipe.taskTitle[3])
  await h.api('task.complete', s.managera.cookie, { task: managerTask.id, evidence: 'First-day plan agreed' })
  await api('case.complete', { case: a.case })
  assert.equal((await api(`cases/${a.case}`)).status, 'completed')
  // Mover/employee-change and leaver recipes use the same conditional planner.
  const mover = await publishTemplate(h, owner, { kind: 'mover', name: 'Reviewed employee change', taskTitle: ['Review changed role'], taskAssignee: ['payroll'], taskDueDays: ['2'], taskRules: [{ conditions: { workState: 'CA', jobTitle: 'Team lead' } }] })
  const change = await api('proposal.create', { kind: 'mover', summary: 'Team lead promotion', agent: 'HR', plan: { period: b.period, effectiveFrom: day(10), jobTitle: 'Team lead', template: mover.id, reason: 'Approved promotion' } })
  const accepted = await api('proposal.decide', { proposal: change.id, decision: 'approve' })
  const changedCases = (await api(`people/${b.person}`)).cases
  assert.ok(changedCases.some(c => c.kind === 'mover'))
  const leaver = await publishTemplate(h, owner, { kind: 'leaver', name: 'NY departure', taskTitle: ['Return NY equipment'], taskAssignee: ['it'], taskDueDays: ['-1'], taskSystem: ['Laptop'], taskRules: [{ conditions: { workState: 'NY' } }] })
  const exit = await api('leaver.start', { period: c.period, template: leaver.id, endDate: day(30), reason: 'Planned exit' })
  assert.equal((await api(`cases/${exit.id}`)).tasks[0].dueDate, day(29))
  const pendingIT = (await api(`cases/${c.case}`)).tasks.find(t => t.assignee === 'it')
  await h.api('task.fail', itCookie, { task: pendingIT.id, failure: 'Provider rejected the account; IT must correct its input' })
  await workflowSigningProof(h, owner, s)
  // Use every changed screen through the browser at desktop and phone widths.
  if (process.env.WILLOW_WORKFLOW_BROWSER === '1') {
    const { chromium } = await import(pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href)
    browser = await chromium.launch({ headless: true, executablePath: process.env.WILLOW_CHROMIUM_PATH, args: ['--use-mock-keychain', '--password-store=basic'] })
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    await context.addCookies(owner.split('; ').map(c => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: h.origin })))
    const page = await context.newPage(), output = process.env.WILLOW_EVIDENCE_DIR
    assert.ok(output); await mkdir(output, { recursive: true })
    const capture = async name => {
      await page.evaluate(() => document.fonts.ready)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits viewport`)
      await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(h.origin + '/app/settings')
      const form = page.locator('form[action="/app/do/template.create"]')
      await form.getByLabel('Template name', { exact: true }).fill(`Branch office induction ${width}`)
      await form.getByLabel('Task', { exact: true }).first().fill('Review New York induction')
      await form.getByLabel('Only this US work state (optional)', { exact: true }).first().fill('NY')
      await capture(`FLOW-001-editor-${width}`)
      await form.locator('fieldset').filter({ hasText: 'Task 1' }).screenshot({ path: `${output}/FLOW-001-task-editor-${width}.png` })
      await form.getByRole('button', { name: 'Save template', exact: true }).click()
      await page.getByRole('button', { name: 'Review publication', exact: true }).last().click()
      await capture(`FLOW-001-publication-${width}`)
      await page.locator('section.card').first().screenshot({ path: `${output}/FLOW-001-publication-panel-${width}.png` })
      await page.getByRole('button', { name: 'Publish reviewed workflow', exact: true }).click()
      assert.equal(await page.getByRole('alert').count(), 0)
      const freshUpgrade = await api('case.upgrade.preview', { case: b.case, template: v2.id })
      assert.deepEqual(freshUpgrade.detail.tasks.find(t => t.title === recipe.taskTitle[3]).dependencies, [], 'Upgrade preview skips the same conditional dependency as execution')
      await page.goto(`${h.origin}/app/cases/${b.case}?review=${freshUpgrade.id}`)
      await capture(`FLOW-001-upgrade-${width}`)
      await page.goto(h.origin + `/app/cases/${c.case}`)
      await page.getByText('Record failed work', { exact: true }).first().click()
      await capture(`FLOW-001-case-${width}`)
      await page.goto(h.origin + '/app/tasks'); await capture(`FLOW-001-tasks-${width}`)
      await page.goto(h.origin + '/app'); await capture(`FLOW-001-home-${width}`)
      await page.goto(h.origin + '/app/reports'); await capture(`FLOW-001-reports-${width}`)
      await page.goto(h.origin + `/app/cases/${a.case}`); await capture(`FLOW-001-completed-${width}`)
    }
    await context.close()
  }
  console.log('FLOW-001: PASS — conditional rules, reviewed publication, scoped steps, failures/dependencies, pinned versions, retained upgrade history and all workflow kinds')
} finally { await browser?.close(); await h.close() }
