// FLOW-004: manager-initiated change requests through HR's approval chains,
// on the production Worker through its JSON, form, page, work and payroll doors.
import assert from 'node:assert/strict'
import { harness, file } from './harness.mjs'
import { fixture, day } from './regression-fixture.mjs'
import { publishTemplate } from './publish-template.mjs'
import { followProof } from './levels-follow.mjs'
import { browserEvidence } from './change-requests-browser.mjs'

const h = await harness()
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const f = await fixture(h, owner), s = f.staff, api = f.api
  const as = (who, path, body, status) => h.api(path, s[who].cookie, body, status)
  // managerb manages managera, who manages the employee: managerb is the skip-level approver and holds no pay rights.
  await api('mover.schedule', { period: s.managera.period, effectiveFrom: day(-50), managerPersonId: s.managerb.person, reason: 'Reporting line' })
  for (const who of ['managera', 'managerb']) s[who].cookie = await h.signIn(`${who}@example.com`)
  const mover = await publishTemplate(h, owner, { name: 'Promotion follow-up', kind: 'mover', taskTitle: ['Confirm new title with the team'], taskAssignee: ['hr'], taskDueDays: ['0'] })
  const effective = (() => { const d = new Date(day(31)); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10) })()

  // HR configures chains per request type; nothing can be requested without one.
  await as('managera', 'change.request', { person: s.employee.person, effectiveFrom: effective, reason: 'Promotion', jobTitle: 'Senior specialist', payIncreasePercent: '10' }, 409)
  await as('managera', 'change.chain', { requestType: 'compensation', template: mover.id, stepRole: ['hr'] }, 403)
  await as('hr', 'change.chain', { requestType: 'compensation', template: mover.id, stepRole: ['skip_manager', 'hr', 'payroll'], stepMinIncrease: ['', '', '5'] })
  await as('hr', 'change.chain', { requestType: 'job', template: mover.id, stepRole: ['hr'] })

  // Scope: a manager requests only for a current direct report, never for themselves.
  await as('managera', 'change.request', { person: s.payroll.person, effectiveFrom: effective, reason: 'x', jobTitle: 'Lead' }, 403)
  await as('managera', 'change.request', { person: s.managera.person, effectiveFrom: effective, reason: 'x', jobTitle: 'Lead' }, 403)
  const requested = await as('managera', 'change.request', { person: s.employee.person, effectiveFrom: effective, reason: 'Promotion to senior specialist', jobTitle: 'Senior specialist', payIncreasePercent: '10', attachment: file('case.txt', 'PROMOTION-CASE'), comment: 'Strong year' })
  assert.equal(requested.type, 'compensation')
  assert.deepEqual(requested.steps.map(step => step.role), ['skip_manager', 'hr', 'payroll'], 'FLOW-004 routes to the manager’s manager, then HR, then payroll')
  assert.equal(requested.steps[0].member, s.managerb.member)
  const id = requested.id
  let detail = await as('managera', `change-requests/${id}`)

  // The requester cannot approve; the subject and unrelated members cannot read; only the current step decides.
  await as('managera', 'change.decide', { request: id, state: detail.state, decision: 'approve' }, 403)
  await as('employee', `change-requests/${id}`, undefined, 404)
  await as('ended', `change-requests/${id}`, undefined, 404)
  assert.equal((await h.raw(`/app/changes/${id}?attachment=${detail.attachments[0].sha256}`, { cookie: s.ended.cookie })).status, 404)
  await as('hr', 'change.decide', { request: id, state: detail.state, decision: 'approve' }, 403)
  assert.equal(detail.changes.find(c => c.field === 'Pay').to, '10% change', 'the requester sees the percentage they entered, not amounts')

  await followProof(h,owner,f,id)

  // A skip-level approver without pay rights sees the request with pay withheld, its attachment and its follow-up work.
  const skip = await as('managerb', `change-requests/${id}`)
  assert.ok(skip.mayDecide)
  assert.deepEqual(skip.changes.find(c => c.field === 'Pay'), { field: 'Pay', from: 'Withheld (you cannot read compensation)', to: 'Withheld (you cannot read compensation)', withheld: true })
  assert.deepEqual(skip.changes.find(c => c.field === 'Job title'), { field: 'Job title', from: 'Present role', to: 'Senior specialist' })
  const skipPage = await (await h.raw(`/app/changes/${id}`, { cookie: s.managerb.cookie })).text()
  assert.ok(skipPage.includes('Withheld') && !skipPage.includes('81,234') && !skipPage.includes('89,358') && !skipPage.includes('10%'), 'the page withholds pay too')
  assert.equal(await (await h.raw(`/app/changes/${id}?attachment=${skip.attachments[0].sha256}`, { cookie: s.managerb.cookie })).text(), 'PROMOTION-CASE')
  assert.ok((await as('managerb', 'work')).items.some(item => item.kind === 'change-request' && item.path === `/app/changes/${id}`), 'the current approver owns FLOW-002 work')
  await as('managerb', 'change.decide', { request: id, state: skip.state, decision: 'approve', comment: 'Agreed' })

  // Payroll reads the exact amounts; HR (no pay rights) sends it back with a comment.
  const payroll = await as('payroll', `change-requests/${id}`)
  assert.equal(payroll.changes.find(c => c.field === 'Pay').to.replace(/[^\d.]/g, ''), '89358.02', '10% rounds half up to the cent')
  assert.ok(!payroll.mayDecide, 'payroll waits for HR')
  const hrView = await as('hr', `change-requests/${id}`)
  assert.ok(hrView.mayDecide && hrView.changes.find(c => c.field === 'Pay').withheld)
  await as('hr', 'change.decide', { request: id, state: hrView.state, decision: 'return' }, 400)
  await as('hr', 'change.decide', { request: id, state: hrView.state, decision: 'return', comment: 'Use the 12% band midpoint' })
  detail = await as('managera', `change-requests/${id}`)
  assert.equal(detail.status, 'returned')
  assert.deepEqual(detail.steps.map(step => step.state), ['approved', 'returned', 'not reached'])
  assert.ok((await as('managera', 'work')).items.some(item => item.kind === 'change-request' && item.title === 'Revise returned change request'))
  await as('payroll', 'change.decide', { request: id, state: detail.state, decision: 'approve' }, 409)

  // Editing after any approval restarts the chain; conditions are re-applied to the edited values.
  let edited = await as('managera', 'change.edit', { request: id, state: detail.state, effectiveFrom: effective, reason: 'Promotion to senior specialist', jobTitle: 'Senior specialist', payIncreasePercent: '3' })
  assert.deepEqual(edited.steps.map(step => step.role), ['skip_manager', 'hr'], 'below 5% the payroll step does not apply')
  detail = await as('managera', `change-requests/${id}`)
  edited = await as('managera', 'change.edit', { request: id, state: detail.state, effectiveFrom: effective, reason: 'Promotion to senior specialist', jobTitle: 'Senior specialist', payIncreasePercent: '12', comment: 'Moved to 12%' })
  assert.equal(edited.revision, 3)
  assert.deepEqual(edited.steps.map(step => step.role), ['skip_manager', 'hr', 'payroll'])
  detail = await as('managera', `change-requests/${id}`)
  assert.deepEqual(detail.steps.map(step => step.state), ['waiting', 'not reached', 'not reached'], 'the earlier skip-level approval no longer counts')
  await as('hr', 'change.decide', { request: id, state: detail.state, decision: 'approve' }, 403)
  assert.deepEqual(detail.history.map(e => e.kind), ['submitted', 'approved', 'returned', 'edited', 'edited'])

  // All three approve: exactly one terms version with the approved title and pay, a started mover case, and the payroll queue.
  const before = (await api(`people/${s.employee.person}`)).employment[0].terms.length
  await as('managerb', 'change.decide', { request: id, state: (await as('managerb', `change-requests/${id}`)).state, decision: 'approve' })
  await as('hr', 'change.decide', { request: id, state: (await as('hr', `change-requests/${id}`)).state, decision: 'approve' })
  const final = await as('payroll', 'change.decide', { request: id, state: (await as('payroll', `change-requests/${id}`)).state, decision: 'approve' })
  assert.equal(final.status, 'approved')
  await as('payroll', 'change.decide', { request: id, state: (await as('payroll', `change-requests/${id}`)).state, decision: 'approve' }, 409)
  const terms = (await api(`people/${s.employee.person}`)).employment[0].terms
  assert.equal(terms.length, before + 1)
  const written = terms.filter(t => t.effectiveFrom === effective)
  assert.equal(written.length, 1)
  assert.equal(written[0].jobTitle, 'Senior specialist')
  assert.deepEqual(written[0].pay, { basis: 'salary', amountCents: 9098271, currency: 'AUD' })
  const moverCase = await api(`cases/${final.result.case}`)
  assert.equal(moverCase.status, 'open')
  assert.ok(moverCase.tasks.some(task => task.title === 'Confirm new title with the team'))
  const draft = await as('payroll', 'payroll.draft', { periodStart: day(-1), periodEnd: effective })
  const line = (await as('payroll', `payroll/${draft.id}`)).lines.find(l => l.kind === 'change' && l.name === 'employee')
  assert.ok(line.changes.some(change => change.field === 'Pay' && change.to.includes('90982.71')), 'the approved pay is in the payroll queue')
  await as('payroll', 'payroll.discard', { batch: draft.id })
  const audit = (await api('audit')).filter(event => event.subject === id).map(event => event.action)
  for (const action of ['change.request', 'change.approve', 'change.return', 'change.edit', 'change.execute']) assert.ok(audit.includes(action), `${action} is audited`)

  // A declined request writes nothing; HR declines through the form door.
  const job = await as('managera', 'change.request', { person: s.employee.person, effectiveFrom: day(60), reason: 'Rename role', jobTitle: 'Field lead' })
  assert.equal(job.type, 'job')
  const jobState = (await as('hr', `change-requests/${job.id}`)).state
  const declined = await h.submit('change.decide', s.hr.cookie, { request: job.id, state: jobState, decision: 'decline', comment: 'Not this year' }, `/app/changes/${job.id}`)
  assert.ok(!declined.searchParams.has('error'))
  assert.equal((await as('managera', `change-requests/${job.id}`)).status, 'declined')
  assert.ok(!(await api(`people/${s.employee.person}`)).employment[0].terms.some(t => t.effectiveFrom === day(60)), 'a declined request writes no terms')

  // Pages: the requester's list and form, and the approver's page.
  const list = await (await h.raw('/app/changes', { cookie: s.managera.cookie })).text()
  assert.ok(list.includes('Request a change') && list.includes(`/app/changes/${id}`))
  assert.ok(!(await (await h.raw('/app/changes', { cookie: s.employee.cookie })).text()).includes(`/app/changes/${id}`))
  await browserEvidence(h, s, id, job.id)
  // FLOW-002 substitute: once the named manager's manager loses access, HR approves that step in their place.
  const cover = await as('managera', 'change.request', { person: s.employee.person, effectiveFrom: day(75), reason: 'Schedule change', jobTitle: 'Field lead', payIncreasePercent: '1' })
  assert.equal(cover.steps[0].member, s.managerb.member)
  await as('hr', 'change.decide', { request: cover.id, state: (await as('hr', `change-requests/${cover.id}`)).state, decision: 'approve' }, 403)
  await api('access.end', { person: s.managerb.person })
  assert.equal((await as('hr', 'change.decide', { request: cover.id, state: (await as('hr', `change-requests/${cover.id}`)).state, decision: 'approve' })).step, 1)
  assert.deepEqual((await as('hr', `change-requests/${cover.id}`)).steps.map(step => step.state), ['approved', 'waiting'])

  // Employment type (ct 19 Oct): approval ends the period the day before and opens a new period with the approved terms, in one commit.
  const typeChange = await as('managera', 'change.request', { person: s.employee.person, effectiveFrom: day(90), reason: 'Moving to part time', employmentType: 'part_time' })
  assert.equal(typeChange.type, 'job')
  const typeView = await as('hr', `change-requests/${typeChange.id}`)
  assert.match(typeView.changes.find(c => c.field === 'Employment type').note, new RegExp(`ends on ${day(89)}.*starts on ${day(90)}`))
  const typeDone = await as('hr', 'change.decide', { request: typeChange.id, state: typeView.state, decision: 'approve' })
  const periods = (await api(`people/${s.employee.person}`)).employment
  const ended = periods.find(p => p.id === s.employee.period), started = periods.find(p => p.id === typeDone.result.period)
  assert.equal(ended.endDate, day(89))
  assert.deepEqual([started.startDate, started.employmentType, started.payrollId], [day(90), 'part_time', ended.payrollId])
  assert.deepEqual([started.terms.length, started.terms[0].jobTitle, started.terms[0].pay.amountCents], [1, 'Senior specialist', 9098271], 'the new period carries the approved terms')
  assert.equal((await api(`cases/${typeDone.result.case}`)).status, 'open')
  console.log('FLOW-004 change requests: passed')
} finally { await h.close() }
