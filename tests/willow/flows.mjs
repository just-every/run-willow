import { sectionDoorProof } from './levels-section-doors.mjs'
import { jobDoorProof } from './levels-job-doors.mjs'
import { exerciseImportDoor } from './import-door.mjs'
import { imports } from './import-transport.mjs'
import { queuedEntrypoint } from '@runeditrun/rer/queued-entry'
const queued = await queuedEntrypoint(import.meta.url, 'test:flows'); if (queued !== null) process.exit(queued)
// Willow's contract clauses, each exercised through public doors (JSON door,
// form door, pages and downloads) against the built Worker with real local D1
// and R2. No provider is involved. All people are invented.
import assert from 'node:assert/strict'
import { publishTemplate } from './publish-template.mjs'
import { createHash } from 'node:crypto'
import { API_DOORS, PAGE_DOORS } from '../../src/willow/doors.ts'
import { balancesCsv, contractPdf, documentsZip, employeesCsv, pdf } from './fixtures.mjs'
import { genericColumns } from './phase2-fixtures.mjs'
import { file, harness } from './harness.mjs'

const h = await harness()
const sha = value => createHash('sha256').update(value).digest('hex')
const check = async (id, run) => { await run(); console.log(`${id} passed`) }
const zone = 'Australia/Sydney'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now())
const addDays = (date, days) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) }
const weekday = date => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
const mondayAfter = (date, weeks = 1) => { let day = addDays(date, 7 * weeks); while (weekday(day) !== 0) day = addDays(day, 1); return day }
const ids = {}, cookie = {}
// Private values planted for the access proof (WIL-03).
const SECRET = { phone: 'PRIV-PHONE-4417', salary: '91234.56', salaryCents: ':9123456', reason: 'PRIV-REASON-7731', endReason: 'PRIV-END-5520', docTitle: 'PRIV-DOC-TITLE-3391', docBytes: 'PRIV-DOC-BYTES-3391' }
const personOf = async (who, id) => await h.api(`people/${id}`, cookie[who])
const accountOf = async (who, id, policy) => (await personOf(who, id)).leave.accounts.find(account => account.policy.name === policy)

try {
  await check('WIL-01', async () => {
    assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
    cookie.owner = await h.signIn(h.vars.OWNER_EMAIL)
    assert.equal((await h.raw('/setup', { cookie: cookie.owner, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
    assert.equal((await h.raw('/api/willow/me')).status, 401)
    assert.equal((await h.raw('/app', { cookie: cookie.owner })).headers.get('location'), `${h.origin}/app/employer`)
    await h.api('employer.configure', cookie.owner, { name: 'Harbour Freight Co', timezone: 'Mars/Olympus', country: 'AU', currency: 'AUD' }, 400)
    const saved = await h.submit('employer.configure', cookie.owner, { name: 'Harbour Freight Co', timezone: zone, country: 'AU', currency: 'AUD' })
    assert.equal(saved.searchParams.get('notice'), 'Saved.')
    ids.sydney = (await h.api('location.create', cookie.owner, { name: 'Sydney', timezone: zone })).id
    ids.ops = (await h.api('department.create', cookie.owner, { name: 'Operations' })).id
    ids.people = (await h.api('department.create', cookie.owner, { name: 'People and Payroll' })).id
    ids.week = (await h.api('schedule.create', cookie.owner, { name: 'Standard week', mon: '7.6', tue: '7.6', wed: '7.6', thu: '7.6', fri: '7.6', sat: '0', sun: '0' })).id
    await h.api('schedule.create', cookie.owner, { name: 'Standard week', mon: '8' }, 409)
    ids.contract = (await h.api('category.create', cookie.owner, { name: 'Employment contract', subjectReads: true, acknowledgement: true })).id
    ids.medical = (await h.api('category.create', cookie.owner, { name: 'Medical certificates' })).id
    ids.notes = (await h.api('category.create', cookie.owner, { name: 'Team notes', managerReads: true })).id
    const tasks = (rows) => ({ taskTitle: rows.map(row => row[0]), taskAssignee: rows.map(row => row[1]), taskDueDays: rows.map(row => String(row[2])), taskEvidence: rows.map(row => row[3] ? 'yes' : 'no'), taskSystem: rows.map(row => row[4] ?? ''), taskAction: rows.map(row => row[5] ?? '') })
    const joiner = await publishTemplate(h, cookie.owner, { kind: 'joiner', name: 'New starter', requiredFields: ['phone', 'emergency_contact', 'payroll_id'], ...tasks([['Prepare contract', 'hr', -7, false], ['Plan first week', 'manager', -3, false], ['Create email account', 'it', -2, true, 'Email'], ['Read the handbook', 'employee', 5, false]]) })
    ids.joinerTemplate = joiner.id; ids.joinerFamily = joiner.family
    ids.leaverTemplate = (await publishTemplate(h, cookie.owner, { kind: 'leaver', name: 'Departure', requiredFields: [], ...tasks([['Disable email account', 'it', 0, false, 'Email'], ['Collect laptop', 'manager', 0, false, 'Laptop'], ['End Willow access', 'hr', 0, false, '', 'end_access']]) })).id
    ids.moverTemplate = (await publishTemplate(h, cookie.owner, { kind: 'mover', name: 'Team change', requiredFields: [], ...tasks([['Brief the new team', 'manager', 0, false]]) })).id

    // Staff are people first; access is given to a person through their work email.
    const staff = { hana: ['Hana Reid', ids.people], pat: ['Pat Okoro', ids.people], ivan: ['Ivan Ruiz', ids.ops], mia: ['Mia Chen', ids.ops] }
    for (const [key, [name, department]] of Object.entries(staff)) {
      const started = await h.api('joiner.start', cookie.owner, { template: ids.joinerTemplate, legalName: name, workEmail: `${key}@example.com`, startDate: addDays(today, -900), employmentType: 'full_time', payrollId: `PAY-${key}`, jobTitle: key === 'mia' ? 'Operations Manager' : 'Staff', departmentId: department, locationId: ids.sydney, scheduleId: ids.week })
      ids[key] = started.person; ids[`${key}Period`] = started.period
    }
    for (const [key, name, payroll, pay] of [['sam', 'Samira Patel', 'PAY-sam', SECRET.salary], ['lee', 'Lee Park', '', '']]) {
      const started = await h.api('joiner.start', cookie.owner, { template: ids.joinerTemplate, legalName: name, workEmail: `${key}@example.com`, startDate: addDays(today, -200), employmentType: 'full_time', payrollId: payroll, jobTitle: 'Coordinator', departmentId: ids.ops, locationId: ids.sydney, managerPersonId: ids.mia, scheduleId: ids.week, ...(pay ? { payBasis: 'salary', payAmount: pay } : {}), ...(key === 'sam' ? { phone: SECRET.phone } : {}) })
      ids[key] = started.person; ids[`${key}Period`] = started.period; ids[`${key}Case`] = started.case
    }
    for (const key of ['hana', 'pat', 'ivan', 'mia', 'sam', 'lee']) {
      await h.api('access.give', cookie.owner, { person: ids[key] })
      cookie[key] = await h.signIn(`${key}@example.com`, { requested: true })
    }
    const members = await h.api('members', cookie.owner)
    for (const member of members) ids[`${member.email.split('@')[0]}Member`] = member.id
    await h.api('member.permissions', cookie.owner, { member: ids.hanaMember, permissions: ['people.manage', 'people.private', 'documents.private', 'leave.manage', 'reports.read', 'audit.read'] })
    // people.manage makes Hana's sign-in an admin; the role change ends her earlier session.
    cookie.hana = await h.signIn('hana@example.com')
    await h.api('member.permissions', cookie.owner, { member: ids.patMember, permissions: ['pay.read', 'payroll.handoff'] })
    await h.api('member.permissions', cookie.owner, { member: ids.ivanMember, permissions: ['it.tasks'] })
    // Only the owner sets permissions; managing people grants none.
    await h.api('member.permissions', cookie.hana, { member: ids.miaMember, permissions: ['pay.read'] }, 403)
    assert.deepEqual((await h.api('me', cookie.mia)).permissions, [])
    assert.deepEqual((await h.api('me', cookie.mia)).manages.sort(), [ids.lee, ids.sam].sort())
    await h.api('members', cookie.mia, undefined, 403)
    // Ending access ends every session; giving it again needs a fresh sign-in and restores no permissions.
    await h.api('access.end', cookie.hana, { person: ids.ivan })
    await h.api('me', cookie.ivan, undefined, 401)
    await h.api('access.give', cookie.hana, { person: ids.ivan })
    await h.api('me', cookie.ivan, undefined, 401)
    cookie.ivan = await h.signIn('ivan@example.com')
    assert.deepEqual((await h.api('me', cookie.ivan)).permissions, [])
    await h.api('member.permissions', cookie.owner, { member: ids.ivanMember, permissions: ['it.tasks'] })
  })

  await check('WIL-04', async () => {
    const sam = await personOf('hana', ids.sam)
    assert.equal(sam.employment.length, 1)
    const period = sam.employment[0]
    assert.equal(period.startDate, addDays(today, -200))
    assert.equal(period.payrollId, 'PAY-sam')
    assert.equal(period.terms.length, 1)
    assert.equal(period.terms[0].manager.id, ids.mia)
    assert.equal(sam.current.department.name, 'Operations')
    // A person is separate from the employment period: identity is unique, periods never overlap.
    await h.api('joiner.start', cookie.hana, { template: ids.joinerTemplate, legalName: 'Other', workEmail: 'sam@example.com', startDate: today, employmentType: 'casual', jobTitle: 'X' }, 409)
    const overlap = await h.api('joiner.start', cookie.hana, { template: ids.joinerTemplate, person: ids.sam, startDate: today, employmentType: 'casual', jobTitle: 'X' }, 409)
    assert.equal(overlap.error, 'period_overlap')
    await h.api('joiner.start', cookie.mia, { template: ids.joinerTemplate, legalName: 'Nope', startDate: today, employmentType: 'casual', jobTitle: 'X' }, 403)
  })

  await check('WIL-05', async () => {
    const opened = await h.api(`cases/${ids.samCase}`, cookie.hana)
    assert.deepEqual(opened.tasks.map(task => [task.assignee, task.dueDate]), [['hr', addDays(today, -207)], ['manager', addDays(today, -203)], ['it', addDays(today, -202)], ['employee', addDays(today, -195)]])
    assert.deepEqual(opened.missing.sort(), ['emergency_contact'])
    const task = assignee => opened.tasks.find(item => item.assignee === assignee).id
    // Each task belongs to its assignee; IT work needs evidence.
    assert.equal((await h.api('task.complete', cookie.hana, { task: task('it'), evidence: 'done' }, 403)).error, 'not_your_task')
    assert.equal((await h.api('task.complete', cookie.ivan, { task: task('it') }, 400)).error, 'evidence_required')
    await h.api('task.complete', cookie.ivan, { task: task('it'), evidence: 'Mailbox sam@example.com created in the email admin console' })
    await h.api('task.complete', cookie.lee, { task: task('manager') }, 403)
    await h.api('task.complete', cookie.mia, { task: task('manager') })
    await h.api('task.complete', cookie.sam, { task: task('employee') })
    assert.equal((await h.api('case.complete', cookie.hana, { case: ids.samCase }, 409)).error, 'tasks_open')
    await h.api('task.complete', cookie.hana, { task: task('hr') })
    assert.equal((await h.api('case.complete', cookie.hana, { case: ids.samCase }, 409)).error, 'required_information_missing')
    // A new template version leaves the open case on the version it started from.
    const v2 = await publishTemplate(h, cookie.hana, { family: ids.joinerFamily, name: 'New starter', requiredFields: ['phone'], taskTitle: ['Prepare contract'], taskAssignee: ['hr'], taskDueDays: ['-7'], taskEvidence: ['no'], taskSystem: [''], taskAction: [''] })
    assert.equal(v2.version, 2)
    ids.joinerTemplate = v2.id
    assert.equal((await h.api(`cases/${ids.samCase}`, cookie.hana)).template.version, 1)
    // The employee supplies their own private details; then the case completes.
    const current = (await h.api('people/me', cookie.sam)).revision
    await h.api('person.update', cookie.sam, { person: ids.sam, revision: current, private: true, phone: SECRET.phone, emergency_contact: 'Jo Patel 0400 000 999', address: '9 Invented Road' })
    await h.api('person.update', cookie.sam, { person: ids.sam, revision: current, private: true, phone: 'x' }, 409)
    await h.api('case.complete', cookie.hana, { case: ids.samCase })
    assert.equal((await h.api(`cases/${ids.samCase}`, cookie.hana)).status, 'completed')
    // Managers see their report's case; colleagues do not.
    await h.api(`cases/${ids.samCase}`, cookie.mia)
    await h.api(`cases/${ids.samCase}`, cookie.pat, undefined, 404)
  })

  await check('WIL-06', async () => {
    const v1 = await h.api('document.add', cookie.hana, { person: ids.sam, category: ids.contract, title: 'Employment contract', file: file('contract-v1.pdf', pdf('contract v1')) })
    const v2 = await h.api('document.add', cookie.hana, { document: v1.id, file: file('contract-v2.pdf', pdf('contract v2')) })
    assert.equal(v2.number, 2)
    const medical = await h.api('document.add', cookie.hana, { person: ids.sam, category: ids.medical, title: SECRET.docTitle, file: file('certificate.txt', SECRET.docBytes) })
    const notes = await h.api('document.add', cookie.hana, { person: ids.sam, category: ids.notes, title: 'Probation notes', file: file('notes.txt', 'Settling in well.') })
    Object.assign(ids, { contractV1: v1.version, contractV2: v2.version, medicalVersion: medical.version, notesVersion: notes.version })
    await h.api('document.add', cookie.mia, { person: ids.sam, category: ids.notes, title: 'x', file: file('x.txt', 'x') }, 403)
    const status = async (who, version) => (await h.raw(`/app/files/document/${version}?download=1`, { cookie: cookie[who] })).status
    assert.equal(await status('sam', ids.contractV2), 200)
    assert.equal(await status('sam', ids.medicalVersion), 404)
    assert.equal(await status('sam', ids.notesVersion), 404)
    assert.equal(await status('mia', ids.notesVersion), 200)
    assert.equal(await status('mia', ids.contractV2), 404)
    assert.equal(await status('lee', ids.notesVersion), 404)
    assert.equal(await status('hana', ids.medicalVersion), 200)
    const bytes = Buffer.from(await (await h.raw(`/app/files/document/${ids.contractV1}?download=1`, { cookie: cookie.sam })).arrayBuffer())
    assert.equal(sha(bytes), sha(pdf('contract v1')))
    // Receipt acknowledgement of the latest version only; it says it is not a signature.
    assert.equal((await h.api('document.acknowledge', cookie.sam, { version: ids.contractV1 }, 409)).error, 'not_latest_version')
    await h.api('document.acknowledge', cookie.hana, { version: ids.contractV2 }, 404)
    const ack = await h.api('document.acknowledge', cookie.sam, { version: ids.contractV2 })
    assert.match(ack.statement, /not a signature/)
    const listed = (await personOf('sam', ids.sam)).documents
    assert.deepEqual(listed.map(document => document.category), ['Employment contract'])
    assert.ok(listed[0].versions[0].acknowledgedAt)
    assert.ok((await h.api('audit', cookie.hana)).some(event => event.action === 'document.download' && event.subject === ids.medicalVersion))
  })

  await check('WIL-07', async () => {
    const past = addDays(today, -30), future = addDays(today, 30)
    await h.api('mover.schedule', cookie.hana, { period: ids.samPeriod, effectiveFrom: future, reason: 'Moves to People and Payroll', jobTitle: 'Payroll Coordinator', departmentId: ids.people, template: ids.moverTemplate })
    // Pay is part of a terms version: setting it needs pay.read.
    await h.api('mover.schedule', cookie.hana, { period: ids.samPeriod, effectiveFrom: past, reason: 'Annual review', payBasis: 'salary', payAmount: '95000' }, 403)
    const review = await h.api('mover.schedule', cookie.owner, { period: ids.samPeriod, effectiveFrom: past, reason: 'Annual review', payBasis: 'salary', payAmount: '95000' })
    ids.reviewTerms = review.terms
    let sam = await personOf('owner', ids.sam)
    const terms = sam.employment[0].terms
    assert.equal(terms.length, 3)
    assert.equal(sam.current.department.name, 'Operations')
    assert.equal(terms.find(row => row.inForce).id, review.terms)
    assert.equal(terms.find(row => row.effectiveFrom === future).department.name, 'People and Payroll')
    assert.equal(terms.find(row => row.effectiveFrom === addDays(today, -200)).pay.amountCents, 9123456)
    assert.equal(terms.find(row => row.inForce).pay.amountCents, 9500000)
    // The future version can be cancelled; it stays in history. The first version cannot.
    const futureId = terms.find(row => row.effectiveFrom === future).id
    await h.api('terms.cancel', cookie.hana, { terms: futureId, reason: 'Move postponed' })
    await h.api('terms.cancel', cookie.hana, { terms: futureId }, 409)
    await h.api('terms.cancel', cookie.hana, { terms: terms.find(row => row.effectiveFrom === addDays(today, -200)).id }, 409)
    sam = await personOf('hana', ids.sam)
    assert.equal(sam.employment[0].terms.find(row => row.id === futureId).status, 'cancelled')
    assert.equal(sam.employment[0].terms.length, 3)
  })

  await check('WIL-08', async () => {
    const annual = await h.api('policy.write', cookie.hana, { name: 'Annual leave', summary: 'Four weeks of scheduled hours per year of service, accruing progressively.', accrualWeeks: '4', negativeLimitHours: '0' })
    const personal = await h.api('policy.write', cookie.hana, { name: 'Personal leave', summary: 'Ten days per year.', accrualWeeks: '2', negativeLimitHours: '0' })
    Object.assign(ids, { annual: annual.policy, personal: personal.policy })
    await h.api('account.open', cookie.hana, { period: ids.samPeriod, policy: ids.annual, cutoverDate: addDays(today, -200), openingHours: '0', note: 'New starter' }, 409)
    await h.api('policy.approve', cookie.hana, { version: annual.id }, 403)
    await h.api('policy.approve', cookie.owner, { version: annual.id })
    await h.api('policy.approve', cookie.owner, { version: personal.id })
    const cutover = addDays(today, -60)
    const account = await h.api('account.open', cookie.hana, { period: ids.samPeriod, policy: ids.annual, cutoverDate: cutover, openingHours: '76', note: 'Balance in the old spreadsheet at cutover' })
    ids.samAnnual = account.id
    await h.api('account.open', cookie.mia, { period: ids.leePeriod, policy: ids.annual, cutoverDate: cutover, openingHours: '1', note: 'x' }, 403)
    const monday = mondayAfter(today)
    assert.equal((await h.api('leave.request', cookie.sam, { account: ids.samAnnual, startDate: monday, endDate: monday }, 409)).error, 'opening_not_signed_off')
    await h.api('account.approve', cookie.hana, { account: ids.samAnnual })
    let sam = await accountOf('sam', ids.sam, 'Annual leave')
    assert.deepEqual(sam.ledger.map(entry => [entry.kind, entry.minutes, entry.effectiveDate]), [['opening', 76 * 60, cutover]])
    // Accrual: 4 weeks x 38 scheduled hours a week, pro rata per day.
    const through = addDays(today, -1), days = 59
    await h.api('leave.accrue', cookie.hana, { account: ids.samAnnual, through })
    sam = await accountOf('sam', ids.sam, 'Annual leave')
    assert.equal(sam.ledger[1].minutes, Math.round(4 * 38 * 60 * days / 365))
    assert.equal(sam.balanceMinutes, 76 * 60 + Math.round(4 * 38 * 60 * days / 365))
    await h.api('leave.accrue', cookie.hana, { account: ids.samAnnual, through }, 409)
    ids.leeAnnual = (await h.api('account.open', cookie.hana, { period: ids.leePeriod, policy: ids.annual, cutoverDate: cutover, openingHours: '15.2', note: 'Two days at cutover' })).id
    await h.api('account.approve', cookie.hana, { account: ids.leeAnnual })
    ids.samPersonal = (await h.api('account.open', cookie.hana, { period: ids.samPeriod, policy: ids.personal, cutoverDate: cutover, openingHours: '38', note: 'At cutover' })).id
    await h.api('account.approve', cookie.hana, { account: ids.samPersonal })
  })

  await check('WIL-09', async () => {
    const friday = addDays(mondayAfter(today, 2), -3), monday = addDays(friday, 3)
    const quote = await h.api(`quote?account=${ids.samAnnual}&startDate=${friday}&endDate=${monday}`, cookie.sam)
    assert.deepEqual(quote.days.map(day => day.minutes), [456, 0, 0, 456])
    assert.equal(quote.minutes, 912)
    const request = await h.api('leave.request', cookie.sam, { account: ids.samAnnual, startDate: friday, endDate: monday, reason: SECRET.reason })
    ids.samLeave = request.id
    assert.equal(request.approver, ids.miaMember)
    assert.equal((await h.api('leave.request', cookie.sam, { account: ids.samAnnual, startDate: monday, endDate: monday }, 409)).error, 'overlaps_existing_leave')
    await h.api('leave.request', cookie.lee, { account: ids.samAnnual, startDate: friday, endDate: friday }, 404)
    // The manager sees dates, hours and the decision; never the confidential reason.
    const seen = await h.api(`leave/${ids.samLeave}`, cookie.mia)
    assert.equal(seen.minutes, 912)
    assert.ok(!('reason' in seen))
    assert.equal((await h.api(`leave/${ids.samLeave}`, cookie.sam)).reason, SECRET.reason)
    assert.equal((await h.api(`leave/${ids.samLeave}`, cookie.hana)).reason, SECRET.reason)
    // A colleague planning overlapping leave sees who is away and when, nothing more.
    const coverage = (await h.api(`quote?account=${ids.leeAnnual}&startDate=${monday}&endDate=${monday}`, cookie.lee)).coverage
    assert.deepEqual(coverage, [{ name: 'Samira Patel', startDate: friday, endDate: monday, status: 'pending' }])
    assert.ok((await h.api('approvals', cookie.mia)).some(item => item.id === ids.samLeave))
    await h.api('leave.decide', cookie.sam, { request: ids.samLeave, decision: 'approve' }, 403)
    await h.api('leave.decide', cookie.lee, { request: ids.samLeave, decision: 'approve' }, 404)
    await h.api('leave.decide', cookie.mia, { request: ids.samLeave, decision: 'approve' })
    const ledger = (await accountOf('sam', ids.sam, 'Annual leave')).ledger.filter(entry => entry.request === ids.samLeave)
    assert.deepEqual(ledger.map(entry => [entry.kind, entry.minutes]), [['reservation', -912], ['release', 912], ['use', -912]])
  })

  await check('WIL-10', async () => {
    const lee = mondayAfter(today, 3)
    // Two concurrent requests that each fit, but not together: exactly one reserves the balance.
    const both = await Promise.all([lee, addDays(lee, 7)].map(start => h.raw('/api/willow/leave.request', { cookie: cookie.lee, body: { account: ids.leeAnnual, startDate: start, endDate: addDays(start, 1) } })))
    assert.deepEqual(both.map(response => response.status).sort(), [200, 409])
    const granted = await (both.find(response => response.status === 200)).json()
    assert.equal((await (both.find(response => response.status === 409)).json()).error, 'insufficient_balance')
    // Two concurrent approvals of one request: exactly one use entry.
    const decisions = await Promise.all([cookie.mia, cookie.hana].map(who => h.raw('/api/willow/leave.decide', { cookie: who, body: { request: granted.id, decision: 'approve' } })))
    assert.deepEqual(decisions.map(response => response.status).sort(), [200, 409])
    let account = await accountOf('hana', ids.lee, 'Annual leave')
    assert.equal(account.ledger.filter(entry => entry.kind === 'use').length, 1)
    assert.equal(account.balanceMinutes, 0)
    // Cancelling approved leave writes one reversal; the balance returns and history stays.
    await h.api('leave.cancel', cookie.hana, { request: granted.id, note: 'Trip cancelled' })
    await h.api('leave.cancel', cookie.hana, { request: granted.id, note: 'again' }, 409)
    account = await accountOf('hana', ids.lee, 'Annual leave')
    assert.equal(account.balanceMinutes, 912)
    assert.deepEqual(account.ledger.filter(entry => entry.request === granted.id).map(entry => entry.kind), ['reservation', 'release', 'use', 'reversal'])
    // Correcting approved leave reverses the old use and uses the corrected dates, in one step.
    const before = (await accountOf('sam', ids.sam, 'Annual leave')).balanceMinutes
    const sick = mondayAfter(today, 4)
    const personal = await h.api('leave.request', cookie.sam, { account: ids.samPersonal, startDate: sick, endDate: addDays(sick, 2), reason: SECRET.reason })
    await h.api('leave.decide', cookie.mia, { request: personal.id, decision: 'approve' })
    const corrected = await h.api('leave.correct', cookie.mia, { request: personal.id, startDate: sick, endDate: sick, note: 'Back after one day' })
    assert.equal(corrected.minutes, 456)
    assert.equal((await h.api(`leave/${personal.id}`, cookie.sam)).status, 'cancelled')
    assert.equal((await h.api(`leave/${corrected.id}`, cookie.sam)).corrects, personal.id)
    assert.equal((await accountOf('sam', ids.sam, 'Personal leave')).balanceMinutes, 38 * 60 - 456)
    assert.equal((await accountOf('sam', ids.sam, 'Annual leave')).balanceMinutes, before)
    ids.samPersonalLeave = corrected.id
  })

  await check('WIL-11', async () => {
    await h.api('payroll', cookie.hana, undefined, 403)
    await h.api('payroll.draft', cookie.mia, { periodStart: today, periodEnd: today }, 403)
    const end = mondayAfter(today, 5)
    let draft = await h.api('payroll.draft', cookie.pat, { periodStart: addDays(today, -13), periodEnd: end })
    const batch = await h.api(`payroll/${draft.id}`, cookie.pat)
    const kinds = batch.lines.map(line => `${line.kind}:${line.name}`)
    assert.ok(kinds.includes('start:Samira Patel'))
    assert.ok(kinds.includes('change:Samira Patel'))
    assert.ok(kinds.filter(kind => kind === 'leave:Samira Patel').length === 2)
    const change = batch.lines.find(line => line.kind === 'change')
    assert.deepEqual(change.changes, [{ field: 'Pay', from: `salary ${SECRET.salary} AUD`, to: 'salary 95000.00 AUD' }])
    assert.equal(batch.lines.find(line => line.kind === 'leave' && line.units === '15.20').payrollId, 'PAY-sam')
    // Lee has no payroll identifier: an exception, not a line.
    assert.deepEqual(batch.exceptions.map(item => item.name), ['Lee Park'])
    assert.ok(!kinds.some(kind => kind.endsWith('Lee Park')))
    await h.api('payroll.draft', cookie.pat, { periodStart: today, periodEnd: end }, 409)
    await h.api('payroll.layout', cookie.owner, { format: 'generic', columns: genericColumns })
    await h.api('payroll.preview', cookie.pat, { batch: draft.id }, 409)
    await h.api('payroll.discard', cookie.pat, { batch: draft.id })
    await h.api('period.payroll', cookie.pat, { period: ids.leePeriod, payrollId: 'PAY-lee' })
    draft = await h.api('payroll.draft', cookie.pat, { periodStart: addDays(today, -13), periodEnd: end })
    await h.api('payroll.preview', cookie.pat, { batch: draft.id })
    await h.api('payroll.export', cookie.pat, { batch: draft.id, previewRevision: (await h.api(`payroll/${draft.id}`, cookie.pat)).previewRevision })
    await h.api('payroll.export', cookie.pat, { batch: draft.id }, 409)
    const csv = await (await h.raw(`/app/payroll/${draft.id}.csv`, { cookie: cookie.pat })).text()
    assert.match(csv, /^provider_employee_id,employee_number,name,change/)
    assert.match(csv, /PAY-sam,,Samira Patel,leave,/)
    await h.api('payroll.acknowledge', cookie.pat, { batch: draft.id, reference: 'PROVIDER-IMPORT-77' })
    assert.equal((await h.api(`payroll/${draft.id}`, cookie.pat)).status, 'acknowledged')
    // Exported changes are handed off once; a later cancellation becomes a reversal line.
    await h.api('leave.cancel', cookie.hana, { request: ids.samLeave, note: 'Plans changed' })
    await h.api('period.payroll', cookie.pat, { period: ids.leePeriod, payrollId: 'PAY-lee' })
    const next = await h.api('payroll.draft', cookie.pat, { periodStart: addDays(end, 1), periodEnd: addDays(end, 14) })
    const lines = (await h.api(`payroll/${next.id}`, cookie.pat)).lines
    assert.deepEqual(lines.map(line => `${line.kind}:${line.name}`).sort(), ['leave_reversal:Samira Patel'])
    assert.equal(lines.find(line => line.kind === 'leave_reversal').units, '-15.20')
    await h.api('payroll.preview', cookie.pat, { batch: next.id })
    await h.api('payroll.export', cookie.pat, { batch: next.id, previewRevision: (await h.api(`payroll/${next.id}`, cookie.pat)).previewRevision })
    assert.deepEqual((await h.api(`payroll/${draft.id}`, cookie.pat)).exceptions, [])
    ids.batches = [draft.id, next.id]
  })

  await check('WIL-12', async () => {
    const end = addDays(today, 14)
    const leaver = await h.api('leaver.start', cookie.hana, { period: ids.leePeriod, endDate: end, reason: SECRET.endReason, template: ids.leaverTemplate })
    ids.leeLeaver = leaver.case
    const opened = await h.api(`cases/${leaver.case}`, cookie.hana)
    const task = title => opened.tasks.find(item => item.title === title)
    assert.ok(task('Disable email account').evidenceRequired && task('Collect laptop').evidenceRequired)
    assert.equal((await h.api('task.complete', cookie.mia, { task: task('Collect laptop').id }, 400)).error, 'evidence_required')
    await h.api('task.complete', cookie.mia, { task: task('Collect laptop').id, evidence: 'Laptop returned, asset tag LT-0042' })
    await h.api('task.complete', cookie.hana, { task: task('End Willow access').id })
    await h.api('me', cookie.lee, undefined, 401)
    // The IT task is still open, so the departure cannot be claimed complete.
    assert.equal((await h.api('case.complete', cookie.hana, { case: leaver.case }, 409)).error, 'tasks_open')
    assert.equal((await h.api('task.complete', cookie.hana, { task: task('Disable email account').id, evidence: 'done' }, 403)).error, 'not_your_task')
    await h.api('task.complete', cookie.ivan, { task: task('Disable email account').id, evidence: 'Mailbox suspended; forwarding to Mia set in the email admin console' })
    await h.api('case.complete', cookie.hana, { case: leaver.case })
    const lee = await personOf('hana', ids.lee)
    assert.equal(lee.employment[0].endDate, end)
    // Payroll receives the end of employment.
    const draft = await h.api('payroll.draft', cookie.pat, { periodStart: end, periodEnd: addDays(end, 14) })
    assert.deepEqual((await h.api(`payroll/${draft.id}`, cookie.pat)).lines.map(line => `${line.kind}:${line.name}`), ['end:Lee Park'])
    await h.api('payroll.discard', cookie.pat, { batch: draft.id })
  })

  await check('WIL-13', async () => {
    const start = addDays(today, 45)
    const rehire = await h.api('joiner.start', cookie.hana, { template: ids.joinerTemplate, person: ids.lee, startDate: start, employmentType: 'part_time', jobTitle: 'Coordinator', departmentId: ids.ops, managerPersonId: ids.mia, scheduleId: ids.week })
    const lee = await personOf('hana', ids.lee)
    assert.equal(lee.employment.length, 2)
    assert.equal(lee.employment.find(period => period.id === ids.leePeriod).endDate, addDays(today, 14))
    assert.equal(lee.employment.find(period => period.id === ids.leePeriod).terms.length, 1)
    assert.equal(lee.employment.find(period => period.id === rehire.period).startDate, start)
    // Old access is not silently reactivated.
    assert.equal((await h.raw('/auth/magic-link', { body: { email: 'lee@example.com', returnTo: '/app' } })).status, 202)
    await assert.rejects(h.signIn('lee@example.com', { requested: true }))
    const member = (await h.api('members', cookie.hana)).find(row => row.person === ids.lee)
    assert.equal(member.status, 'ended')
    assert.deepEqual(member.permissions, [])
  })

  await check('WIL-14', async () => {
    const organisation = await h.api('reports', cookie.hana)
    assert.equal(organisation.scope, 'organisation')
    assert.equal(organisation.headcount.total, 6)
    assert.ok(!('compensation' in organisation))
    const owner = await h.api('reports', cookie.owner)
    assert.ok(owner.compensation.byDepartment.length > 0)
    const team = await h.api('reports', cookie.mia)
    assert.equal(team.scope, 'your team')
    assert.equal(team.headcount.total, 2)
    assert.ok(!('compensation' in team))
    await h.api('reports', cookie.sam, undefined, 403)
    const csv = await (await h.raw('/app/reports.csv', { cookie: cookie.mia })).text()
    assert.match(csv, /headcount,total,2/)
    assert.ok(!csv.includes('compensation'))
  })

  await check('WIL-15', async () => {
    // The owner's own agent prepares a joiner through the JSON door; nothing changes until HR approves the exact plan.
    const plan = { template: ids.joinerTemplate, legalName: 'Noor Haddad', workEmail: 'noor@example.com', startDate: addDays(today, 21), employmentType: 'full_time', jobTitle: 'Driver', departmentId: ids.ops, managerPersonId: ids.mia }
    const proposal = await h.api('proposal.create', cookie.hana, { kind: 'joiner', summary: 'Onboard Noor as a driver', agent: 'owner agent (intake form)', plan })
    assert.deepEqual(proposal.missing.sort(), ['phone', 'working schedule'])
    assert.ok(!(await h.api('people', cookie.hana)).some(person => person.name === 'Noor Haddad'))
    await h.api('proposal.create', cookie.mia, { kind: 'joiner', summary: 'x', agent: 'x', plan }, 403)
    const detail = await h.api(`proposals/${proposal.id}`, cookie.hana)
    assert.ok(detail.changes.some(change => change.field === 'Manager' && change.to === 'Mia Chen'))
    const approved = await h.api('proposal.decide', cookie.hana, { proposal: proposal.id, decision: 'approve' })
    assert.equal(approved.receipt.planSha256, sha(JSON.stringify(plan)))
    assert.ok((await h.api('people', cookie.hana)).some(person => person.id === approved.receipt.result.person))
    await h.api('proposal.decide', cookie.hana, { proposal: proposal.id, decision: 'approve' }, 409)
    // A plan prepared against a record that has since changed is refused.
    const mover = await h.api('proposal.create', cookie.hana, { kind: 'mover', summary: 'Move Sam to People and Payroll', agent: 'owner agent', plan: { period: ids.samPeriod, effectiveFrom: addDays(today, 60), reason: 'Team change', departmentId: ids.people } })
    assert.ok((await h.api(`proposals/${mover.id}`, cookie.hana)).changes.some(change => change.field === 'Department' && change.from === 'Operations' && change.to === 'People and Payroll'))
    await h.api('period.payroll', cookie.hana, { period: ids.samPeriod, payrollId: 'PAY-sam-2' })
    assert.equal((await h.api('proposal.decide', cookie.hana, { proposal: mover.id, decision: 'approve' }, 409)).error, 'proposal_stale')
    ids.proposals = [proposal.id, mover.id]
    // Agent context: only what the signed-in member may read, with what is withheld and the policy versions behind leave figures.
    const managerContext = await h.api(`context/${ids.sam}`, cookie.mia)
    assert.ok(managerContext.withheld.includes('Compensation') && managerContext.withheld.includes('Private contact details'))
    assert.ok(!('private' in managerContext.record) && !('pay' in managerContext.record))
    assert.deepEqual(managerContext.policies.map(policy => policy.policy).sort(), ['Annual leave', 'Personal leave'])
    const own = await h.api('context/me', cookie.sam)
    assert.equal(own.record.private.phone, SECRET.phone)
  })

  await check('WIL-02', async () => {
    // HR previews what each member would see; values HR cannot read are withheld, never shown.
    const asPayroll = await h.api(`preview?member=${ids.patMember}&person=${ids.sam}`, cookie.hana)
    const facet = (preview, name) => preview.facets.find(item => item.facet === name)
    assert.deepEqual([facet(asPayroll, 'pay').visible, facet(asPayroll, 'pay').withheldFromYou], [true, true])
    assert.equal(facet(asPayroll, 'private').visible, false)
    assert.ok(!JSON.stringify(asPayroll).includes(SECRET.salaryCents))
    const asManager = await h.api(`preview?member=${ids.miaMember}&person=${ids.sam}`, cookie.hana)
    assert.deepEqual(asManager.facets.filter(item => item.visible).map(item => item.facet).sort(), ['directory', 'documents', 'employment', 'leave', 'lifecycle'])
    assert.ok(asManager.member.managesThisPerson)
    assert.ok(!JSON.stringify(asManager).includes(SECRET.phone) && !JSON.stringify(asManager).includes(SECRET.reason))
    assert.deepEqual(asManager.view.documents.map(document => document.title), ['Probation notes'])
    const asSelf = await h.api(`preview?member=${ids.samMember}&person=${ids.sam}`, cookie.owner)
    assert.equal(asSelf.view.private.phone, SECRET.phone)
    await h.api(`preview?member=${ids.patMember}&person=${ids.sam}`, cookie.mia, undefined, 403)
  })

  await check('WIL-03', async () => {
    // ROLE-001: preserve the exact legacy combinations in named levels before
    // crawling every registered door. No preset substitution or extra grants.
    const named = {}
    for (const who of ['mia', 'ivan', 'pat', 'hana', 'sam']) {
      const before = (await h.api('me', cookie[who])).permissions.sort()
      const created = await h.api('level.preview', cookie.owner, { kind: 'level', name: `Exact ${who} access`, permissions: before })
      const level = await h.api('level.apply', cookie.owner, { review: created.id })
      const review = await h.api('level.preview', cookie.owner, { kind: 'assignment', member: ids[`${who}Member`], levels: [level.id] })
      assert.deepEqual(review.impact[0].added, [])
      await h.api('level.apply', cookie.owner, { review: review.id })
      // Remove direct grants only after the named source carries the same set.
      // member.permissions is a full replacement; use an empty direct source
      // first, then attach the exact level and recover an admin session if needed.
      await h.api('member.permissions', cookie.owner, { member: ids[`${who}Member`], permissions: [] })
      const onlyNamed = await h.api('level.preview', cookie.owner, { kind: 'assignment', member: ids[`${who}Member`], levels: [level.id] })
      await h.api('level.apply', cookie.owner, { review: onlyNamed.id })
      if (before.includes('people.manage')) cookie[who] = await h.signIn(`${who}@example.com`)
      assert.deepEqual((await h.api('me', cookie[who])).permissions.sort(), before)
      named[who] = { id: level.id, permissions: before }
    }
    // Every GET door, for every record, for members without each grant: no private value appears.
    const people = (await h.api('people', cookie.owner)).map(person => person.id)
    const cases = (await Promise.all(people.map(id => personOf('owner', id)))).flatMap(person => person.cases?.map(item => item.id) ?? [])
    const requests = (await Promise.all(people.map(id => personOf('owner', id)))).flatMap(person => person.leave?.requests.map(item => item.id) ?? [])
    const versions = [ids.contractV1, ids.contractV2, ids.medicalVersion, ids.notesVersion]
    const memberIds = (await h.api('members', cookie.owner)).map(member => member.id)
    // New EEO doors join the existing crawl with real records, never an omitted path.
    const eeoPacket = await h.api('preboarding.send', cookie.owner, { name: 'Scoped Newhire', email: 'scoped-newhire@example.com' })
    const eeoOpening = await h.api('hiring.opening', cookie.owner, { name: 'Scoped application review', stages: ['New', 'Hired', 'Rejected'], members: [ids.miaMember] })
    const eeoApplication = await h.api('hiring.candidate', cookie.owner, { opening: eeoOpening.id, name: 'Access Applicant', contactEmail: 'scope-applicant@example.com', source: 'Direct application' })
    await h.api('hiring.close', cookie.owner, { application: eeoApplication.id, revision: eeoApplication.revision, openingRevision: eeoOpening.revision, outcome: 'rejected' })
    const selectedReport=await h.api('report.save',cookie.owner,{definition:{name:'synthetic-willow-9701 limited report',columns:['name','jobTitle','phone','payAmount'],asOf:'today',status:'all'}})
    const values = { signatureReviewFile:['unknown-review'],signatureRequest:['unknown-signature'],signatureFile:['unknown-signature'], aiWorkflow:['unknown-workflow'], builtinReport:['builtin-headcount','builtin-payroll','builtin-i9-documents'],builtinReportCsv:['builtin-headcount','builtin-payroll','builtin-i9-documents'],builtinReportXlsx:['builtin-headcount','builtin-payroll','builtin-i9-documents'],eeoPreboarding: [eeoPacket.id], eeoApplicant: [eeoApplication.id], eeoPerson: [ids.sam, ids.lee], erasureReceipt: ['unknown-receipt'], eeoRun: ['unknown-run'], eeoRunPeople: ['unknown-run'], eeoRunAggregate: ['unknown-run'], hiringOpening: ['unknown-opening'], hiringApplication: ['unknown-application'], levelReview: ['unknown-review'], performanceCycle: ['unknown-review'], performanceFile: ['unknown-review'], surveyPlan: ['unknown-plan'], surveyCsv: ['unknown-survey'], survey: ['unknown-survey'], surveyResults: ['unknown-survey'], compensationCycle: ['unknown-cycle'], companyFile: ['unknown-shared-file'], protectedCase: ['unknown-protected'], protectedDetail: ['unknown-protected','unknown-protected?certificate=1'], customReport: [selectedReport.id], customReportCsv: [selectedReport.id], customReportXlsx: [selectedReport.id], selfChange: ['unknown-self-change'], modelDraft: ['unknown-proposal'], changeRequest: ['unknown-request'], change: ['unknown-request', 'unknown-request?attachment=unknown'], person: [...people, 'me'], context: [...people, 'me'], case: cases, leave: requests, batch: ids.batches, proposal: ids.proposals, request: requests, batchFile: ids.batches, document: versions }
    const fill = (pattern, name) => {
      const base = pattern.replace(/^\^|\$$/g, '').replace(/\\\./g, '.')
      if (name === 'employeeBundle') return ['self', 'team', 'organization'].map(scope => `${base}?scope=${scope}&fields=name,phone,payAmount,payrollId&history=employment,leave,lifecycle,documents`)
      if (name === 'employeeCsv' || name === 'employeeXlsx') return ['self', 'team', 'organization'].map(scope => `${base}?scope=${scope}&fields=name,phone,payAmount,payrollId` )
      if (name === 'preview') return memberIds.flatMap(member => [ids.sam, ids.lee].map(person => `preview?member=${member}&person=${person}`))
      if (name === 'quote') return [`quote?account=${ids.samAnnual}&startDate=${today}&endDate=${today}`, `quote?account=${ids.samPersonal}&startDate=${today}&endDate=${today}`]
      if (name === 'access') return memberIds.flatMap(member => [ids.sam, ids.lee].map(person => `/app/access?member=${member}&person=${person}`))
      if (name === 'document') return versions.flatMap(id => [`/app/files/document/${id}`, `/app/files/document/${id}?download=1`])
      if (!base.includes('([\\w-]+)')) return [base]
      return (values[name] ?? []).map(id => base.replace('([\\w-]+)', id))
    }
    const urls = [...API_DOORS.flatMap(([pattern, name]) => fill(pattern, name).map(path => `/api/willow/${path}`)), ...PAGE_DOORS.flatMap(([pattern, name]) => fill(pattern, name))]
    for (const [pattern, name] of [...API_DOORS, ...PAGE_DOORS]) assert.ok(fill(pattern, name).length > 0, `door ${name} is crawled`)
    const forbidden = {
      mia: ['phone', 'salary', 'salaryCents', 'reason', 'endReason', 'docTitle', 'docBytes'],
      ivan: ['phone', 'salary', 'salaryCents', 'reason', 'endReason', 'docTitle', 'docBytes'],
      pat: ['phone', 'reason', 'endReason', 'docTitle', 'docBytes'],
      hana: ['salary', 'salaryCents'],
      sam: ['salary','salaryCents','endReason', 'docTitle', 'docBytes'],
    }
    const seen = new Set()
    for (const [who, keys] of Object.entries(forbidden)) {
      for (const url of urls) {
        const response = await h.raw(url, { cookie: cookie[who] })
        const body = await response.text()
        for (const key of keys) assert.ok(!body.includes(SECRET[key]), `${who} read ${key} through ${url} (${response.status})`)
        for (const key of Object.keys(SECRET)) if (!keys.includes(key) && body.includes(SECRET[key])) seen.add(`${who}:${key}`)
      }
    }
    // Positive control: each holder does read the values they are entitled to through some door.
    for (const expected of ['pat:salaryCents', 'hana:phone', 'hana:reason', 'hana:endReason', 'hana:docTitle', 'hana:docBytes', 'sam:phone', 'sam:reason']) assert.ok(seen.has(expected), `${expected} is readable by its holder`)
    // Revoke the payroll level in the same session and repeat the whole crawl.
    const revoke = await h.api('level.preview', cookie.owner, { kind: 'level', level: named.pat.id, name: 'Exact pat access', permissions: [] })
    assert.deepEqual(revoke.impact[0].removed.sort(), named.pat.permissions)
    await h.api('level.apply', cookie.owner, { review: revoke.id })
    for (const url of urls) {
      const response = await h.raw(url, { cookie: cookie.pat })
      const body = await response.text()
      for (const value of Object.values(SECRET)) assert.ok(!body.includes(value), `ROLE-001 revoked level leaked through ${url}`)
    }
    const restore = await h.api('level.preview', cookie.owner, { kind: 'level', level: named.pat.id, name: 'Exact pat access', permissions: named.pat.permissions })
    await h.api('level.apply', cookie.owner, { review: restore.id })
    // A fine personal-field grant contributes only its field, including exports, previews and context.
    const fine=await h.api('level.preview',cookie.owner,{kind:'level',name:'One personal field',permissions:[],otherFields:{phone:'view'}})
    const fineLevel=await h.api('level.apply',cookie.owner,{review:fine.id})
    const assigned=await h.api('level.preview',cookie.owner,{kind:'assignment',member:ids.miaMember,levels:[named.mia.id,fineLevel.id]})
    await h.api('level.apply',cookie.owner,{review:assigned.id})
    let sawPhone=false
    for(const url of urls) {
      const response=await h.raw(url,{cookie:cookie.mia}),body=await response.text()
      for(const key of forbidden.mia.filter(key=>key!=='phone')) assert.ok(!body.includes(SECRET[key]),`Selective personal right leaked ${key} through ${url}`)
      if(body.includes(SECRET.phone)) sawPhone=true
    }
    assert.ok(sawPhone,'Selective phone read is reachable through the public doors')
    const fineRevoke=await h.api('level.preview',cookie.owner,{kind:'level',level:fineLevel.id,name:'One personal field',permissions:[],otherFields:{phone:'none'}})
    await h.api('level.apply',cookie.owner,{review:fineRevoke.id})
    for(const url of urls) {
      const response=await h.raw(url,{cookie:cookie.mia}),body=await response.text()
      for(const key of forbidden.mia) assert.ok(!body.includes(SECRET[key]),`Revoked personal field leaked ${key} through ${url}`)
    }
    // A category-only reader can read that category without acquiring private contact,
    // compensation, confidential reasons, another category or administrative rights.
    const categoryReview=await h.api('level.preview',cookie.owner,{kind:'level',name:'One document category',permissions:[],documentCategories:{others:{[ids.medical]:'view'}},scope:{kind:'group',dimensions:{location:[ids.sydney]}}})
    const categoryLevel=await h.api('level.apply',cookie.owner,{review:categoryReview.id})
    const categoryAssignment=await h.api('level.preview',cookie.owner,{kind:'assignment',member:ids.ivanMember,levels:[named.ivan.id,categoryLevel.id]})
    await h.api('level.apply',cookie.owner,{review:categoryAssignment.id})
    const sawCategory=new Set()
    for(const url of urls) {
      const response=await h.raw(url,{cookie:cookie.ivan}),body=await response.text()
      for(const key of forbidden.ivan.filter(key=>!['docTitle','docBytes'].includes(key))) assert.ok(!body.includes(SECRET[key]),`Selective category right leaked ${key} through ${url}`)
      for(const key of ['docTitle','docBytes']) if(body.includes(SECRET[key]))sawCategory.add(key)
    }
    assert.deepEqual([...sawCategory].sort(),['docBytes','docTitle'],'The one permitted category is actually readable')
    assert.deepEqual((await h.api('me',cookie.ivan)).permissions.sort(),named.ivan.permissions,'A category grants no additional administrative permission')
    const categoryRevoke=await h.api('level.preview',cookie.owner,{kind:'level',level:categoryLevel.id,name:'One document category',permissions:[],documentCategories:{others:{[ids.medical]:'none'}}})
    await h.api('level.apply',cookie.owner,{review:categoryRevoke.id})
    for(const url of urls) {
      const body=await (await h.raw(url,{cookie:cookie.ivan})).text()
      for(const key of forbidden.ivan) assert.ok(!body.includes(SECRET[key]),`Category revocation leaked ${key} through ${url}`)
    }
    const selectedLevel=await h.api('level.apply',cookie.owner,{review:(await h.api('level.preview',cookie.owner,{kind:'level',name:'One selected report',permissions:[],reports:[selectedReport.id],scope:{kind:'group',dimensions:{location:[ids.sydney]}}})).id})
    await h.api('level.apply',cookie.owner,{review:(await h.api('level.preview',cookie.owner,{kind:'assignment',member:ids.ivanMember,levels:[named.ivan.id,selectedLevel.id]})).id})
    assert.ok((await h.api(`custom-reports/${selectedReport.id}`,cookie.ivan)).result.rows.length>0)
    for(const url of urls) {
      const body=await(await h.raw(url,{cookie:cookie.ivan})).text()
      for(const key of forbidden.ivan)assert.ok(!body.includes(SECRET[key]),`Selected report leaked ${key} through ${url}`)
    }
    await h.api('level.apply',cookie.owner,{review:(await h.api('level.preview',cookie.owner,{kind:'level',level:selectedLevel.id,name:'One selected report',permissions:[],reports:[]})).id})
    for(const url of urls) {
      const body=await(await h.raw(url,{cookie:cookie.ivan})).text()
      for(const key of forbidden.ivan)assert.ok(!body.includes(SECRET[key]),`Selected report revocation leaked ${key} through ${url}`)
    }
    // Certify the split ROLE-001 acceptance as one otherwise empty level.
    const applyLevel=async plan=>h.api('level.apply',cookie.owner,{review:(await h.api('level.preview',cookie.owner,plan)).id})
    const unselected=await h.api('report.save',cookie.owner,{definition:{name:'synthetic-willow-9702 unselected report',columns:['name','phone','payAmount'],asOf:'today'}})
    const combinedPlan={kind:'level',name:'Personal approval, one category, one report',permissions:[],selfFields:{phone:'approval'},otherFields:{phone:'approval'},documentCategories:{others:{[ids.medical]:'view'}},reports:[selectedReport.id]}
    const combined=await applyLevel(combinedPlan)
    await applyLevel({kind:'assignment',member:ids.ivanMember,levels:[combined.id]})
    assert.deepEqual((await h.api('me',cookie.ivan)).permissions,[],'The acceptance member has no other grant')
    const approval=await h.api('self.request',cookie.ivan,{kind:'personal',person:ids.sam,field:'phone',value:'synthetic-willow-9703'})
    assert.ok((await h.api('self-changes',cookie.hana)).some(row=>row.id===approval.id),'The approval-required edit enters HR’s queue')
    assert.equal((await personOf('ivan',ids.sam)).private.phone,SECRET.phone,'The pending edit does not change the record')
    await h.api('self.decide',cookie.hana,{change:approval.id,decision:'reject',comment:'Keep the acceptance source unchanged'})
    const combinedDoors=[...urls,`/api/willow/custom-reports/${unselected.id}`,`/app/reports/custom/${unselected.id}`,`/app/reports/custom/${unselected.id}.csv`,`/app/reports/custom/${unselected.id}.xlsx`]
    const allowed=new Set()
    for(const url of combinedDoors) {
      const body=await(await h.raw(url,{cookie:cookie.ivan})).text()
      for(const key of ['salary','salaryCents','reason','endReason']) assert.ok(!body.includes(SECRET[key]),`Combined level withholds ${key} through ${url}`)
      for(const key of ['phone','docTitle','docBytes']) if(body.includes(SECRET[key])) allowed.add(key)
      assert.ok(!body.includes(unselected.definition?.name??'synthetic-willow-9702 unselected report'),`Unselected report stays hidden through ${url}`)
    }
    assert.deepEqual([...allowed].sort(),['docBytes','docTitle','phone'],'All selected facets are actually readable')
    await h.api(`custom-reports/${unselected.id}`,cookie.ivan,undefined,404)
    await h.api('self.decide',cookie.ivan,{change:approval.id,decision:'approve',comment:'No decision authority'},403)
    await applyLevel({...combinedPlan,level:combined.id,selfFields:{phone:'view'},otherFields:{phone:'none'},documentCategories:{others:{[ids.medical]:'none'}},reports:[]})
    for(const url of combinedDoors) {
      const body=await(await h.raw(url,{cookie:cookie.ivan})).text()
      for(const key of forbidden.ivan) assert.ok(!body.includes(SECRET[key]),`Combined same-session revocation withholds ${key} through ${url}`)
    }
    await h.api('self.request',cookie.ivan,{kind:'personal',person:ids.sam,field:'phone',value:'synthetic-willow-9704'},403)
    const ownerMember=(await h.api('me',cookie.owner)).id
    assert.ok((await h.api('audit',cookie.owner)).some(event=>event.action==='level.level'&&event.subject===combined.id&&event.actor===ownerMember))
    await applyLevel({kind:'assignment',member:ids.ivanMember,levels:[named.ivan.id]})
    await jobDoorProof(h,cookie.owner,cookie.ivan,{ids,urls,today,addDays})
    await sectionDoorProof(h,cookie.owner,cookie.ivan,{ids,urls,today,addDays})
    await h.api('level.apply',cookie.owner,{review:(await h.api('level.preview',cookie.owner,{kind:'assignment',member:ids.ivanMember,levels:[named.ivan.id]})).id})
    console.log(`ROLE-001 crawled ${urls.length} doors with exact named levels, selective personal fields, document categories and saved reports, and same-session revocation`)
    // Reads of someone else's private details are audited.
    const audit = await h.api('audit', cookie.owner)
    assert.ok(audit.some(event => event.action === 'person.private.read' && event.subject === ids.sam && event.actor === ids.hanaMember))
    assert.ok(audit.some(event => event.action === 'leave.reason.read' && event.actor === ids.hanaMember))
    console.log(`WIL-03 crawled ${urls.length} doors x ${Object.keys(forbidden).length} members`)
  })

  await check('WIL-16', async () => {
    const inputs = { employees: file('employees.csv', employeesCsv({ conflictingEmail: 'mia@example.com' })), balances: file('balances.csv', balancesCsv), documents: file('documents.zip', documentsZip()), schedule: ids.week }
    const before = (await h.api('people', cookie.hana)).length
    await imports(h,cookie.mia).request('plan',{uploadId:'unknown'},401)
    await imports(h,cookie.hana).request('plan',{uploadId:'unknown'},401)
    const transfer=imports(h,cookie.owner)
    await h.api('category.create', cookie.hana, { name: 'Passport scans' })
    const preview = await transfer.plan(inputs)
    assert.equal((await h.api('people', cookie.hana)).length, before, 'the preview writes nothing')
    assert.deepEqual(preview.people, { active: 3, former: 1, upcoming: 0 })
    const reasons = preview.rejected.map(item => item.reason).join('\n')
    for (const pattern of [/duplicate of row 4/, /missing or unreadable hireDate/, /already in Willow as Mia Chen/, /inactive in BambooHR without a terminationDate/, /in days; Willow counts hours/, /no Willow leave policy for "Sick Leave"/]) assert.match(reasons, pattern)
    assert.deepEqual(preview.balances.map(item => [item.person, item.hours]), [['Rowan Hale', '112.50'], ['Tamsin Vale', '40.00']])
    assert.deepEqual(preview.documents.map(item => item.person).sort(), ['Rowan Hale', 'Tamsin Vale'])
    assert.ok(preview.unknowns.find(item => item.person === 'Idris Penn').missing.some(field => field.startsWith('pay')))
    assert.deepEqual(preview.create, { departments: ['Warehouse', 'Finance'], locations: ['Parramatta'] })
    await transfer.request('apply',{planId:preview.planId,reviewedFingerprint:'0'.repeat(64)},403)
    const applied = await transfer.apply(preview)
    assert.equal(applied.job.state, 'completed')
    assert.equal((await transfer.reconcile(preview)).ok,true)
    const people = await h.api('people', cookie.owner)
    assert.equal(people.length, before + 6)
    const rowan = await personOf('owner', people.find(person => person.name === 'Rowan Hale').id)
    assert.equal(rowan.employment[0].terms[0].pay.amountCents, 9800000)
    assert.equal(rowan.private.phone, '0400 000 101')
    assert.equal(rowan.leave.accounts[0].openingStatus, 'proposed')
    assert.equal(rowan.documents[0].category, 'Employment contract')
    const tamsin = await personOf('hana', people.find(person => person.name === 'Tam').id)
    assert.equal(tamsin.current.manager.name, 'Rowan Hale')
    assert.equal(tamsin.employment[0].terms[0].schedule.name, 'Standard week')
    const juno = await personOf('hana', people.find(person => person.name === 'Juno Ashby').id)
    assert.equal(juno.employment[0].endDate, '2022-11-30')
    // Imported documents keep their category: a colleague cannot read them.
    const contract = rowan.documents[0].versions[0]
    assert.equal(contract.sha256, sha(contractPdf))
    assert.equal((await h.raw(`/app/files/document/${contract.id}`, { cookie: cookie.mia })).status, 404)
    assert.equal(sha(Buffer.from(await (await h.raw(`/app/files/document/${contract.id}?download=1`, { cookie: cookie.hana })).arrayBuffer())), sha(contractPdf))
    // Importing the same export again adds nothing.
    const again = await transfer.plan(inputs)
    const second = await transfer.apply(again)
    assert.equal((await h.api('people', cookie.owner)).length, before + 6)
    // Catch-up replaces imported values, preserves original custody and is itself reversible.
    const changed={...inputs,employees:file('employees.csv',employeesCsv({conflictingEmail:'mia@example.com'}).replace('0400 000 101','0400 000 909'))}
    const catchup=await transfer.plan(changed,{catchup:true})
    assert.ok(catchup.summary.updated>0)
    await transfer.apply(catchup)
    assert.equal((await personOf('owner',rowan.id)).private.phone,'0400 000 909')
    assert.equal((await transfer.reconcile(catchup)).ok,true)
    await transfer.undo(catchup)
    assert.equal((await personOf('owner',rowan.id)).private.phone,'0400 000 101')
    // Undo removes an untouched import completely.
    assert.equal(second.job.id,applied.job.id)
    await transfer.undo(preview)
    assert.equal((await h.api('people', cookie.owner)).length, before)
    assert.ok(!(await h.api('settings', cookie.hana)).departments.some(row => row.name === 'Warehouse'))
    await exerciseImportDoor({h,owner:cookie.owner,nonOwner:cookie.hana,inputs,before})
    // Once a leave manager signs off an imported balance, undo is refused and names what depends on it.
    const thirdPlan=await transfer.plan(inputs)
    const third=await transfer.apply(thirdPlan)
    const rowanAgain = await personOf('hana', (await h.api('people', cookie.hana)).find(person => person.name === 'Rowan Hale').id)
    await h.api('account.approve', cookie.hana, { account: rowanAgain.leave.accounts[0].id })
    const blocked = await transfer.request('undo',{planId:thirdPlan.planId},409)
    assert.equal(blocked.error, 'undo_blocked')
    const history=await h.api('imports',cookie.owner)
    assert.deepEqual(history.find(job=>job.planId===thirdPlan.planId).blockers.map(item=>item.kind),['account'])
    assert.equal((await h.api('people', cookie.owner)).length, before + 6)
    assert.equal((await h.api('imports', cookie.owner)).find(job => job.id === third.job.id).state, 'completed')
    assert.equal((await h.raw('/auth/signout',{cookie:cookie.owner,body:{}})).status,204)
    await transfer.request('apply',{planId:thirdPlan.planId,reviewedFingerprint:thirdPlan.fingerprint},401)
    const newOwner=await h.signIn(h.vars.OWNER_EMAIL)
    assert.equal((await h.api('people',newOwner)).length,before+6,'a revoked owner session cannot mutate a reviewed import')
  })
} finally {
  await h.close()
}
