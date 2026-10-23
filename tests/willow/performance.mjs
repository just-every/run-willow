import { performanceLevelProof } from './levels-performance.mjs'
// PERFORM-001: one journey through the real Worker, with mail faked only at its network edge.
import assert from 'node:assert/strict'
import { browserEvidence } from './performance-browser.mjs'
import { harness } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'

const messages = []
const h = await harness({ scheduled: true, provider: async request => {
  assert.equal(new URL(request.url).hostname, 'api.sendgrid.com', 'Only the mail network edge is substituted')
  messages.push(await request.json())
  return new Response(null, { status: 202 })
} })
const contains = (value, items) => {
  const text = JSON.stringify(value)
  for (const item of items) assert.ok(text.includes(item), `Expected retained business value: ${item}`)
}
const excludes = (value, items) => {
  const text = JSON.stringify(value)
  for (const item of items) assert.ok(!text.includes(item), 'A withheld performance value must not cross this door')
}

try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const { api, staff: s, join, account, templates } = await fixture(h, owner)
  const as = (cookie, path, body, status) => h.api(path, cookie, body, status)
  const hr = (path, body, status) => as(s.hr.cookie, path, body, status)
  const other = await join('Review colleague', { workEmail: 'review-colleague@example.com', managerPersonId: s.managerb.person })
  const otherMember = await api('access.give', { person: other.person })
  other.member = otherMember.id
  other.cookie = await h.signIn('review-colleague@example.com', { requested: true })
  const questions = {
    self: ['Which delivery demonstrates your progress?'],
    peer: ['Which collaboration did you observe?'],
    manager: ['Which agreed outcome was delivered?'],
  }
  const cycleInput = { name: 'Two-team review', dueDate: day(20), people: [s.employee.person, other.person], questions }
  await as(s.managera.cookie, 'performance.cycle', cycleInput, 403)
  const cycle = await hr('performance.cycle', cycleInput)
  const detail = (cookie = s.hr.cookie, id = cycle.id) => as(cookie, `performance/${id}`)
  const download = async (cookie = s.hr.cookie, id = cycle.id, status = 200) => {
    const response = await h.raw(`/app/performance/${id}.json`, { cookie })
    assert.equal(response.status, status, 'Performance download uses current reader authority')
    return status === 200 ? response.json() : null
  }
  const assign = (person, member, role, dueDate = today, id = cycle.id) => hr('performance.assign', { cycle: id, person, member, role, dueDate })
  const respond = (cookie, assignment, answer, status) => as(cookie, 'performance.respond', { assignment: assignment.id, answers: [answer] }, status)
  const assignments = {
    self: await assign(s.employee.person, s.employee.member, 'self'),
    peer: await assign(s.employee.person, other.member, 'peer'),
    manager: await assign(s.employee.person, s.managera.member, 'manager', day(-1)),
    otherSelf: await assign(other.person, other.member, 'self'),
    otherPeer: await assign(other.person, s.employee.member, 'peer'),
    otherManager: await assign(other.person, s.managerb.member, 'manager'),
  }
  contains((await detail()).cycle, Object.values(questions).flat())
  await as(s.employee.cookie, 'performance.assign', { cycle: cycle.id, person: s.employee.person, member: s.employee.member, role: 'peer', dueDate: today }, 403)
  await hr('performance.close', { cycle: cycle.id }, 409)

  // Due review work enters the existing scheduler; cover can follow up, never answer as its author.
  const key = `review-input:${assignments.manager.id}`
  const work = async cookie => (await as(cookie, 'work')).items
  assert.ok((await work(s.managera.cookie)).some(w => w.source === key))
  assert.ok(!(await work(s.managerb.cookie)).some(w => w.source === key), 'Rank does not expose another manager\'s assignment')
  await hr('work.policy', { offsets: '0', quietStart: 0, quietEnd: 0, defaultDays: 1 })
  await api('connections.notices', { enabled: true })
  const initialWork = (await work(s.hr.cookie)).find(w => w.source === key)
  assert.ok(initialWork)
  assert.ok((await work(s.hr.cookie)).some(w => w.source === `review-release:${cycle.id}`), 'HR release remains accountable work while the cycle is open')
  await hr('work.schedule', { source: key, revision: initialWork.revision, owner: s.managera.member, substitute: s.hr.member, dueDate: day(-1), nextAction: 'Follow up the outstanding manager review' })
  const managerAccount = await account(s.managera.period)
  const absence = await as(s.managera.cookie, 'leave.request', { account: managerAccount, startDate: today, endDate: today })
  await api('leave.decide', { request: absence.id, decision: 'approve' })
  messages.length = 0
  const tick = async () => {
    const instant = Date.parse(`${today}T09:00:00Z`)
    const result = await h.raw(`/cdn-cgi/local/scheduled?time=${instant}&cron=${encodeURIComponent('*/15 * * * *')}&format=json`)
    assert.equal(result.status, 200, await result.text())
  }
  await tick()
  const escalated = (await work(s.hr.cookie)).find(w => w.source === key)
  assert.equal(escalated.effectiveOwner, s.hr.member)
  assert.ok(escalated.history.some(event => event.kind === 'coverage.escalated'))
  assert.ok(escalated.deliveries.some(delivery => delivery.recipient === s.hr.member && delivery.status === 'accepted'))
  const deliveryCount = escalated.deliveries.length
  await tick()
  assert.equal((await work(s.hr.cookie)).find(w => w.source === key).deliveries.length, deliveryCount)
  assert.ok(messages.some(message => message.personalizations.some(p => p.to.some(to => to.email === 'hr@example.com'))), 'The actual scheduler reaches the authorized cover through mail')
  await respond(s.hr.cookie, assignments.manager, 'Cannot impersonate the assigned manager', 404)

  const answers = {
    self: 'SELF-PRIVATE shipped the agreed migration',
    revised: 'SELF-REVISED shipped and documented the migration',
    peer: 'PEER-PRIVATE collaborated on recovery drills',
    manager: 'MANAGER-PRIVATE delivered the agreed handover',
    otherSelf: 'OTHER-SELF-PRIVATE completed the support rotation',
    otherPeer: 'OTHER-PEER-PRIVATE shared the incident checklist',
    otherManager: 'OTHER-MANAGER-PRIVATE improved response ownership',
  }
  await respond(s.employee.cookie, assignments.peer, 'Cannot edit a peer response', 404)
  await respond(s.managerb.cookie, assignments.manager, 'Cannot edit another manager response', 404)
  await respond(s.employee.cookie, assignments.self, answers.self)
  await respond(s.employee.cookie, assignments.self, answers.revised)
  await respond(other.cookie, assignments.peer, answers.peer)
  await respond(s.managera.cookie, assignments.manager, answers.manager)
  await respond(other.cookie, assignments.otherSelf, answers.otherSelf)
  await respond(s.employee.cookie, assignments.otherPeer, answers.otherPeer)
  await respond(s.managerb.cookie, assignments.otherManager, answers.otherManager)
  assert.ok(!(await work(s.hr.cookie)).some(w => w.source === key), 'Answering finishes the assignment work')
  await hr('performance.close', { cycle: cycle.id }, 409)
  const privateNote = 'HR-CALIBRATION-PRIVATE evidence discussion'
  await as(s.managera.cookie, 'performance.note', { cycle: cycle.id, person: s.employee.person, note: privateNote, rating: 'Draft rating' }, 403)
  await hr('performance.note', { cycle: cycle.id, person: s.employee.person, note: privateNote, rating: 'Draft rating' })
  await hr('performance.note', { cycle: cycle.id, person: s.employee.person, note: 'HR-REVISED-PRIVATE calibration correction', rating: 'Calibrated rating' })
  const calibration = await detail()
  contains(calibration.inputs, Object.values(answers))
  for (const [assignment, author] of [[assignments.self, s.employee.member], [assignments.peer, other.member], [assignments.manager, s.managera.member]]) {
    assert.ok(calibration.inputs.some(input => input.assignment_id === assignment.id && input.author === author), 'HR sees feedback authors explicitly')
  }
  for (const [cookie, own, hidden] of [
    [s.employee.cookie, [answers.self, answers.revised, answers.otherPeer], [answers.peer, answers.manager, answers.otherSelf, answers.otherManager]],
    [s.managera.cookie, [answers.manager], [answers.self, answers.revised, answers.peer, answers.otherSelf, answers.otherPeer, answers.otherManager]],
    [s.managerb.cookie, [answers.otherManager], [answers.self, answers.revised, answers.peer, answers.manager, answers.otherSelf, answers.otherPeer]],
    [other.cookie, [answers.peer, answers.otherSelf], [answers.self, answers.revised, answers.manager, answers.otherPeer, answers.otherManager]],
  ]) {
    const view = await detail(cookie)
    contains(view.inputs, own)
    excludes(view, [...hidden, privateNote, 'HR-REVISED-PRIVATE'])
    excludes(await download(cookie), [...hidden, privateNote, 'HR-REVISED-PRIVATE'])
  }

  // Corrections are new releases. Withholding names one summary and one incoming manager.
  const release = (summary, rating = 'Meets agreed outcomes', person = s.employee.person, id = cycle.id) => hr('performance.release', { cycle: id, person, summary, rating })
  await as(s.managera.cookie, 'performance.release', { cycle: cycle.id, person: s.employee.person, summary: 'Manager cannot release', rating: 'Unapproved' }, 403)
  const first = await release('RELEASE-FIRST agreed delivery summary')
  const firstSnapshot = (await detail()).summaries.find(summary => summary.id === first.id)
  assert.equal(firstSnapshot.rating,'Meets agreed outcomes','PERFORM-001 retains the human rating without inference')
  await as(s.employee.cookie, 'performance.ack', { summary: first.id })
  await as(s.employee.cookie, 'performance.appeal', { summary: first.id, reason: 'APPEAL-FIRST missing the recovery exercise' })
  const correction = await release('RELEASE-CORRECTED includes the recovery exercise', 'Exceeds agreed outcomes')
  assert.ok(correction.version > first.version, 'A correction adds a later release')
  await hr('performance.withhold', { summary: correction.id, manager: s.managerb.member, reason: '' }, 400)
  const withholdingReason = 'WITHHOLD-PRIVATE pending employee discussion before succession'
  await hr('performance.withhold', { summary: correction.id, manager: s.managerb.member, reason: withholdingReason })
  await api('mover.schedule', { period: s.employee.period, effectiveFrom: today, managerPersonId: s.managerb.person, reason: 'Review-cycle team transfer' })
  const employmentAfterTransfer=(await api(`people/${s.employee.person}`)).employment
  const incoming = await detail(s.managerb.cookie)
  contains(incoming.summaries, ['RELEASE-FIRST'])
  assert.ok(incoming.inputs.every(input => input.author === s.managerb.member), 'Succession transfers released summaries without transferring confidential input')
  excludes(incoming, ['RELEASE-CORRECTED', withholdingReason, privateNote, 'HR-REVISED-PRIVATE', answers.manager, answers.peer, answers.self, answers.revised, answers.otherSelf, answers.otherPeer])
  // A withholding made after someone received a release preserves that historical receipt.
  await hr('performance.withhold', { summary: first.id, manager: s.managerb.member, reason: 'Retain the already delivered historical release' })
  contains((await detail(s.managerb.cookie)).summaries, ['RELEASE-FIRST'])
  const current = await release('RELEASE-AFTER-TRANSFER current manager discussion')
  await as(s.employee.cookie, 'performance.appeal', { summary: first.id, reason: 'APPEAL-SECOND retain the follow-up employee concern' })
  await release('RELEASE-OTHER-TEAM support rotation summary', 'Meets agreed outcomes', other.person)
  const former = await detail(s.managera.cookie)
  contains(former, [answers.manager, 'RELEASE-FIRST', 'RELEASE-CORRECTED'])
  assert.ok(former.inputs.every(input => input.author === s.managera.member), 'Former managers retain only their authored input')
  excludes(former, ['RELEASE-AFTER-TRANSFER', 'RELEASE-OTHER-TEAM', answers.self, answers.revised, answers.peer, answers.otherSelf, answers.otherPeer, answers.otherManager, privateNote, 'HR-REVISED-PRIVATE', withholdingReason])
  contains((await detail(s.managerb.cookie)).summaries, ['RELEASE-FIRST', 'RELEASE-AFTER-TRANSFER', 'RELEASE-OTHER-TEAM'])
  await as(s.managera.cookie, 'performance.ack', { summary: current.id }, 404)
  await as(s.managera.cookie, 'performance.appeal', { summary: current.id, reason: 'No access by former rank' }, 404)
  assert.deepEqual((await detail()).summaries.find(summary => summary.id === first.id), firstSnapshot, 'The original release survives correction unchanged')
  contains((await detail()).appeals, ['APPEAL-FIRST', 'APPEAL-SECOND'])
  assert.ok((await detail()).acknowledgments.some(ack => ack.summary_id === first.id && ack.member_id === s.employee.member))
  for (const cookie of [s.employee.cookie, s.managera.cookie, s.managerb.cookie, other.cookie]) {
    const view = await detail(cookie)
    assert.deepEqual(await download(cookie), view, 'Files use the same filtered projection as the API')
  }

  // Development goals persist through another cycle, with employee-owned check-ins and completion evidence.
  const goal = await as(s.employee.cookie, 'goal.create', { person: s.employee.person, title: 'DEVELOPMENT-GOAL incident leadership', milestones: ['Shadow an incident', 'Lead a recovery exercise'], dueDate: day(60), development: true, owner: s.employee.member })
  assert.ok((await work(s.employee.cookie)).some(w => w.source === `development:${goal.id}`), 'A development action has accountable work')
  await as(s.employee.cookie, 'goal.checkin', { goal: goal.id, progress: 40, note: 'CHECKIN-FIRST shadowed the incident owner' })
  await as(s.managerb.cookie,'goal.checkin',{goal:goal.id,progress:70,note:'MANAGER-CHECKIN coached the recovery exercise'})
  await hr('performance.close', { cycle: cycle.id })
  const locked = await detail()
  await hr('performance.correct', {review:first.id,summary:'Cannot correct closed history',rating:'Unapproved'},409)
  await respond(s.employee.cookie, assignments.self, 'Cannot overwrite closed feedback', 409)
  await hr('performance.release', { cycle: cycle.id, person: s.employee.person, summary: 'Cannot replace a closed summary', rating: 'Unapproved' }, 409)
  await hr('performance.note', { cycle: cycle.id, person: s.employee.person, note: 'Cannot revise closed calibration', rating: 'Unapproved' }, 409)
  assert.ok(!(await work(s.hr.cookie)).some(w => w.source === `review-release:${cycle.id}`), 'Closing finishes HR release work')
  const second = await hr('performance.cycle', { ...cycleInput, name: 'Development follow-through', people: [s.employee.person] })
  for (const [role, member, cookie] of [['self', s.employee.member, s.employee.cookie], ['peer', other.member, other.cookie], ['manager', s.managerb.member, s.managerb.cookie]]) {
    const assignment = await assign(s.employee.person, member, role, day(30), second.id)
    await respond(cookie, assignment, `SECOND-CYCLE-${role} development evidence`)
  }
  await as(s.employee.cookie, 'goal.checkin', { goal: goal.id, progress: 100, note: 'CHECKIN-SECOND led the recovery exercise' })
  await as(s.employee.cookie, 'goal.complete', { goal: goal.id, evidence: 'GOAL-EVIDENCE incident retrospective approved by the response owner' })
  assert.ok(!(await work(s.employee.cookie)).some(w => w.source === `development:${goal.id}`), 'Completion evidence finishes development work')
  await release('RELEASE-SECOND-CYCLE development completed', 'Meets agreed outcomes', s.employee.person, second.id)
  await hr('performance.close', { cycle: second.id })
  contains((await as(s.employee.cookie, 'performance')).goals, ['DEVELOPMENT-GOAL', 'Shadow an incident', 'Lead a recovery exercise', 'CHECKIN-FIRST', 'MANAGER-CHECKIN', 'CHECKIN-SECOND', 'GOAL-EVIDENCE'])
  await as(s.managera.cookie, `performance/${second.id}`, undefined, 404)
  await as(s.managera.cookie, 'goal.checkin', { goal: goal.id, progress: 50, note: 'Former manager has no continuing goal authority' }, 404)
  excludes(await as(s.managera.cookie, 'performance'), ['RELEASE-SECOND-CYCLE', 'DEVELOPMENT-GOAL', 'CHECKIN-FIRST', 'MANAGER-CHECKIN', 'CHECKIN-SECOND', 'GOAL-EVIDENCE'])

  // Permission changes apply to the existing session, including cached download links.
  await api('member.permissions', { member: s.hr.member, permissions: [] })
  await as(s.hr.cookie,'performance',undefined,401)
  await as(s.hr.cookie,`performance/${cycle.id}`,undefined,401)
  await download(s.hr.cookie,cycle.id,303)
  await hr('performance.note',{cycle:second.id,person:s.employee.person,note:'Ended session cannot write',rating:'Unapproved'},401)
  s.hr.cookie=await h.signIn('hr@example.com')
  excludes(await as(s.hr.cookie, 'performance'), [...Object.values(answers), privateNote, 'RELEASE-FIRST', withholdingReason])
  await as(s.hr.cookie, `performance/${cycle.id}`, undefined, 404)
  await download(s.hr.cookie, cycle.id, 404)
  await hr('performance.note', { cycle: second.id, person: s.employee.person, note: 'Revoked HR cannot write', rating: 'Unapproved' }, 403)
  await api('member.permissions', { member: s.hr.member, permissions: ['people.manage'] })
  s.hr.cookie=await h.signIn('hr@example.com')
  await performanceLevelProof(h,owner,{staff:s,join,today,day})
  await browserEvidence(h,owner,s,{cycle:cycle.id,person:s.employee.person,subjectCookie:s.employee.cookie})
  for(const cookie of [s.employee.cookie,s.managera.cookie,s.managerb.cookie,s.hr.cookie]) excludes(await as(cookie,`context/${s.employee.person}`),[...Object.values(answers),privateNote,'RELEASE-FIRST','RELEASE-CORRECTED','DEVELOPMENT-GOAL'])
  assert.deepEqual((await api(`people/${s.employee.person}`)).employment,employmentAfterTransfer,'PERFORM-001 reviews and goals never decide employment, promotion or compensation')
  const exportBeforeExit = await download()
  await api('leaver.start', { period: s.employee.period, template: templates.leaver, endDate: today, reason: 'Review subject departure' })
  await api('access.end', { person: s.employee.person })
  await as(s.employee.cookie, `performance/${cycle.id}`, undefined, 401)
  await download(s.employee.cookie, cycle.id, 303)
  const exportAfterExit = await download()
  for (const field of ['cycle', 'assignments', 'inputs', 'notes', 'summaries', 'appeals', 'acknowledgments']) {
    assert.deepEqual(exportAfterExit[field], exportBeforeExit[field], 'Employee exit retains the locked review history')
    assert.deepEqual((await detail())[field], locked[field], 'Later cycles and exit do not rewrite the first closed cycle')
  }
  const events = await api('audit')
  assert.ok(events.some(event => event.action === 'performance.summary.transfer' && event.subject === first.id))
  assert.ok(events.some(event => event.action === 'performance.summary.withhold' && event.subject === correction.id && event.detail.includes(withholdingReason)))
  console.log('PERFORM-001: PASS — two teams, scoped feedback, late escalation, calibration, immutable releases, succession, appeals, cross-cycle goals, current authority and retained exit history')
} finally {
  await h.close()
}
