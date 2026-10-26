import { launchSigningBrowser } from './sign-browser.mjs'
// Signing inherits the real lifecycle graph through the same public JSON doors.
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { file } from './harness.mjs'
import { publishTemplate } from './publish-template.mjs'
import { day } from './regression-fixture.mjs'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function workflowSigningProof(h, owner, staff) {
  const api = (path, body, status) => h.api(path, owner, body, status)
  const as = (cookie, path, body, status) => h.api(path, cookie, body, status)
  const folder = await api('company.folder', { name: 'synthetic-willow-18100', audience: { kind: 'everyone', id: null } })
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
  const source = await api('company.file', { folder: folder.id, title: 'synthetic-willow-18101', file: file('synthetic-willow-18101.pdf', await pdf.save()) })
  const category = await api('category.create', { name: 'synthetic-willow-18102', subjectReads: true, managerReads: false })
  const fields = [0, 1].map(signer => ({ signer, kind: 'signature', page: 1, x: 0.1, y: 0.2 + signer * 0.3, width: 0.6, height: 0.08 }))
  const signTemplate = await api('signature.template', { source: source.versionId, title: 'synthetic-willow-18103', category: category.id, signers: ['employee', 'hr'], fields })
  const definition = (await api('signature-templates')).find(t => t.id === signTemplate.id)
  await api('signature.template.approve', { template: signTemplate.id, digest: definition.digest, reviewed: true })
  const location = await api('location.create', { name: 'synthetic-willow-18104', timezone: 'UTC' })
  for (const person of [staff.employee, staff.managerb]) await api('mover.schedule', { period: person.period, effectiveFrom: day(-1), locationId: location.id, reason: 'synthetic-willow-18105' })

  const visual = await signingWorkflowBrowser(h)
  try { for (const [index, cohortKind] of ['named', 'location'].entries()) {
    const signature = { template: signTemplate.id, hr: staff.hr.member, cohortKind, cohortValue: cohortKind === 'location' ? location.id : '' }
    const recipe = { kind: 'mover', name: `synthetic-willow-${18110 + index}`, taskTitle: ['Review and issue signing', 'Confirm completed filing'], taskAssignee: ['hr', 'payroll'], taskDueDays: ['0', '1'], taskRules: [{ signature }, { dependencies: [1] }] }
    const draft = await api('template.create', recipe)
    const preview = await api('template.preview', { template: draft.id })
    const named = preview.detail.affected.find(p => p.person === staff.employee.person).tasks[0].signature
    const expected = cohortKind === 'named' ? [staff.employee.person] : [staff.employee.person, staff.managerb.person]
    assert.equal(named.action, 'signature.send')
    assert.equal(named.provider, 'native')
    assert.equal(named.template.id, signTemplate.id)
    assert.equal(named.countersigner.id, staff.hr.member)
    assert.deepEqual(named.recipients.map(p => p.id).sort(), [...expected].sort())
    await visual?.capture('/app/settings', owner, `${cohortKind}-editor`)
    await visual?.capture(`/app/settings?review=${preview.id}`, owner, `${cohortKind}-publication`)
    const beforePublication = (await api('signature-requests')).length
    await api('template.publish', { review: preview.id })
    assert.equal((await api('signature-requests')).length, beforePublication, 'Graph publication issues no signing work')
    const opened = await api('mover.schedule', { period: staff.employee.period, effectiveFrom: day(10 + index), jobTitle: `synthetic-willow-${18120 + index}`, template: draft.id, reason: 'synthetic-willow-18122' })
    let current = await api(`cases/${opened.case}`)
    const [signing, dependent] = current.tasks
    await visual?.capture(`/app/cases/${opened.case}`, staff.hr.cookie, `${cohortKind}-ready`)
    await as(staff.employee.cookie, 'task.signature.preview', { task: signing.id }, 403)
    await as(staff.payroll.cookie, 'task.signature.preview', { task: signing.id }, 403)
    await as(staff.hr.cookie, 'task.complete', { task: signing.id, evidence: 'A note cannot sign a document' }, 409)
    let review = await as(staff.hr.cookie, 'task.signature.preview', { task: signing.id })
    assert.deepEqual(review.recipients.map(p => p.id).sort(), [...expected].sort())
    assert.equal((await api('signature-requests')).length, beforePublication, 'Exact byte preview issues no request')
    if (visual) review = { ...review, ...await visual.preview(opened.case, signing.id, staff.hr.cookie, cohortKind) }
    await api('task.signature.issue', { task: signing.id, review: review.id, digest: review.digest, approved: true }, 409)
    const issued = await as(staff.hr.cookie, 'task.signature.issue', { task: signing.id, review: review.id, digest: review.digest, approved: true })
    assert.equal(issued.status, 'open')
    await as(staff.hr.cookie, 'task.signature.issue', { task: signing.id, review: review.id, digest: review.digest, approved: true }, 409)
    const actual = (await api('signature-requests')).filter(r => issued.requests.includes(r.id))
    assert.deepEqual(actual.map(r => r.person).sort(), named.recipients.map(p => p.id).sort(), 'The observed native issue matches the named preview')
    assert.ok(actual.every(r => r.template === named.template.id && r.cohort === review.id))
    await as(staff.hr.cookie, 'task.signature.verify', { task: signing.id }, 409)
    await as(staff.hr.cookie, 'task.fail', { task: signing.id, failure: 'Native signing is incomplete; obtain the outstanding personal signatures' })
    await as(staff.payroll.cookie, 'task.complete', { task: dependent.id, evidence: 'Premature filing' }, 409)
    await api('case.complete', { case: opened.case }, 409)
    current = await api(`cases/${opened.case}`)
    assert.ok(current.tasks[0].failure)
    assert.deepEqual(current.tasks[1].blockedBy.map(t => t.id), [signing.id])
    await visual?.capture(`/app/cases/${opened.case}`, staff.hr.cookie, `${cohortKind}-incomplete`)

    const sign = async (cookie, id, name, status) => {
      const request = await as(cookie, `signature-requests/${id}`)
      const prepared = await as(cookie, 'signature.prepare', { request: id, revision: request.revision, digest: request.digest, name }, status)
      if (status) return
      await as(cookie, 'signature.act', { request: id, revision: request.revision, digest: request.digest, action: 'sign', consent: true, payload: prepared.id })
    }
    for (const request of actual) {
      const person = request.person === staff.employee.person ? staff.employee : staff.managerb
      await sign(staff.hr.cookie, request.id, 'synthetic-willow-18130', 403)
      await sign(person.cookie, request.id, 'synthetic-willow-18131')
      await as(staff.hr.cookie, 'task.signature.verify', { task: signing.id }, 409)
      await sign(staff.hr.cookie, request.id, 'synthetic-willow-18132')
    }
    await as(staff.payroll.cookie, 'task.signature.verify', { task: signing.id }, 403)
    const verified = await as(staff.hr.cookie, 'task.signature.verify', { task: signing.id })
    assert.equal(verified.records.length, expected.length)
    assert.ok(verified.records.every(r => r.version && r.sha256))
    const completed = (await api(`cases/${opened.case}`)).tasks[0]
    assert.equal(completed.status, 'done')
    assert.equal(completed.failure, null)
    assert.deepEqual(JSON.parse(completed.evidence).records, verified.records)
    assert.equal((await as(staff.employee.cookie, `cases/${opened.case}`)).tasks.find(t => t.id === signing.id).evidence, null, 'A case assignment does not disclose cohort signing evidence')

    const next = await publishTemplate(h, owner, { ...recipe, family: draft.family, taskTitle: [recipe.taskTitle[0], 'Review retained signed filing'] })
    assert.equal((await api(`cases/${opened.case}`)).template.id, draft.id, 'Publication preserves the original graph')
    const upgrade = await api('case.upgrade.preview', { case: opened.case, template: next.id })
    assert.ok(upgrade.detail.retainedCompleted.some(t => t.id === signing.id && t.evidence === completed.evidence))
    assert.equal(upgrade.detail.tasks[0].reusedCompletion, signing.id)
    await visual?.capture(`/app/cases/${opened.case}?review=${upgrade.id}`, owner, `${cohortKind}-upgrade`)
    await api('case.upgrade', { review: upgrade.id })
    current = await api(`cases/${opened.case}`)
    assert.equal(current.template.id, next.id)
    assert.equal(current.tasks.find(t => t.id === signing.id).evidence, completed.evidence)
    assert.deepEqual(current.tasks.find(t => t.status === 'open').blockedBy, [])
    await as(staff.payroll.cookie, 'task.complete', { task: current.tasks.find(t => t.status === 'open').id, evidence: 'synthetic-willow-18140' })
    await api('case.complete', { case: opened.case })
    assert.equal((await api(`cases/${opened.case}`)).status, 'completed')
    for (const record of verified.records) assert.equal((await api(`signature-requests/${record.request}`)).sealedVersion, record.version)
    await visual?.capture(`/app/cases/${opened.case}`, staff.hr.cookie, `${cohortKind}-retained`)
  } } finally { await visual?.close() }
  console.log('SIGN-001 and SIGN-002 reviewed workflow: named issue, separate authority, incomplete-signing gates, graph pinning and retained sealed evidence')
}

async function signingWorkflowBrowser(h) {
  if (process.env.WILLOW_SIGN_BROWSER !== '1' && process.env.WILLOW_WORKFLOW_BROWSER !== '1') return null
  const destination = process.env.WILLOW_EVIDENCE_DIR; assert.ok(destination)
  await mkdir(destination, { recursive: true })
  const browser = await launchSigningBrowser()
  const contexts = []
  const enter = async cookie => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true }); contexts.push(context)
    await context.addCookies(cookie.split('; ').map(c => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: h.origin })))
    return context.newPage()
  }
  const capturePage = async (page, label) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => document.fonts.ready)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} fits ${width}`)
      await page.screenshot({ path: `${destination}/SIGN-workflow-${label}-${width}.png`, fullPage: true })
    }
  }
  return {
    async capture(path, cookie, label) {
      const page = await enter(cookie)
      assert.equal((await page.goto(h.origin + path)).status(), 200)
      if (label.endsWith('-editor')) await page.locator('section.templates').getByText('Native signing step', { exact: true }).first().click()
      await capturePage(page, label); await page.context().close()
    },
    async preview(caseId, taskId, cookie, label) {
      const page = await enter(cookie)
      await page.goto(h.origin + `/app/cases/${caseId}`)
      const form = page.locator('form[action="/app/do/task.signature.preview"]').filter({ has: page.locator(`input[name="task"][value="${taskId}"]`) })
      await form.locator('xpath=..').evaluate(node => { node.open = true })
      await form.getByRole('button', { name: 'Review signing requests', exact: true }).click()
      assert.equal(await page.getByRole('alert').count(), 0)
      assert.equal(await page.locator('form[action="/app/do/task.signature.issue"]').count(), 1)
      await capturePage(page, `${label}-exact-review`)
      const result = { id: await page.locator('input[name="review"]').inputValue(), digest: await page.locator('input[name="digest"]').inputValue() }
      await page.context().close(); return result
    },
    async close() { for (const context of contexts) await context.close(); await browser.close() },
  }
}
