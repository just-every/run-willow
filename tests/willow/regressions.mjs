// Focused public-door proofs of payroll, effective dates, previews and routed leave.
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { genericColumns } from './phase2-fixtures.mjs'
import { fixture, today, day } from './regression-fixture.mjs'
const h = await harness()
let failures = 0
const check = async (name, run) => { try { await run(); console.log(`${name}: PASS`) } catch (error) { failures++; console.error(`${name}: FAIL ${error.message}`) } }
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const { api, join, account, staff: s, templates, schedule } = await fixture(h, owner)
  const preview = (member, person, cookie = owner, status = 200) => h.api(`preview?member=${member}&person=${person}`, cookie, undefined, status)
  const person = id => api(`people/${id}`)

  await check('payroll-source-transaction', async () => {
    const request = await h.api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(5), endDate: day(5) })
    await api('leave.decide', { request: request.id, decision: 'approve' })
    await api('payroll.layout', {format:'generic', columns:genericColumns})
    const draft = async () => { const d = await api('payroll.draft', { periodStart: today, periodEnd: day(90) }); const preview = await api('payroll.preview',{batch:d.id}); return {...d,previewRevision:preview.previewRevision} }
    const stale = async change => {
      const d = await draft()
      try {
        await change()
        await api('payroll.export', { batch: d.id, previewRevision: d.previewRevision }, 409)
        assert.equal((await api(`payroll/${d.id}`)).status, 'draft')
        assert.equal((await h.raw(`/app/payroll/${d.id}.csv`, { cookie: owner })).status, 409)
        assert.ok(!(await api('audit')).some(e => e.action === 'payroll.export' && e.subject === d.id))
      } finally { if ((await api(`payroll/${d.id}`)).status === 'draft') await api('payroll.discard', { batch: d.id, previewRevision: d.previewRevision }) }
    }
    await stale(() => api('leave.cancel', { request: request.id, note: 'Cancelled before handoff' }))
    await stale(() => api('period.payroll', { period: s.employee.period, payrollId: 'PAY-CHANGED' }))
    await stale(async () => {
      await api('period.payroll', { period: s.employee.period, payrollId: 'TEMPORARY-ID' })
      await api('period.payroll', { period: s.employee.period, payrollId: 'PAY-CHANGED' })
    })
    await stale(async () => { const p = await person(s.employee.person); await api('person.update', { person: p.id, revision: p.revision, legalName: 'Changed employee', preferredName: '', workEmail: 'employee@example.com', employeeNumber: 'NEW-NUMBER' }) })
    const terms = await api('mover.schedule', { period: s.employee.period, effectiveFrom: day(10), jobTitle: 'Changed role', reason: 'Review' })
    await stale(() => api('terms.cancel', { terms: terms.terms, reason: 'Cancelled' }))
    const extra = await join('ending-payroll')
    await stale(() => api('leaver.start', { period: extra.period, template: templates.leaver, endDate: day(20), reason: 'Leaving' }))
    const d = await draft()
    const lines = (await api(`payroll/${d.id}`)).lines
    assert.ok(!lines.some(l => l.kind === 'leave' || l.kind === 'leave_reversal'), 'pre-handoff cancellation nets to no lines')
    assert.ok(lines.some(l => l.person === s.employee.person && l.name === 'Changed employee' && l.payrollId === 'PAY-CHANGED' && l.employeeNumber === 'NEW-NUMBER'), 'fresh payload uses current identifiers')
    const exports = await Promise.all([1, 2].map(() => h.raw('/api/willow/payroll.export', { cookie: owner, body: { batch: d.id, previewRevision: d.previewRevision } })))
    assert.deepEqual(exports.map(r => r.status).sort(), [200, 409])
    assert.equal((await h.raw(`/app/payroll/${d.id}.csv`, { cookie: owner })).status, 200)
    const leave = await h.api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(6), endDate: day(6) })
    await api('leave.decide', { request: leave.id, decision: 'approve' })
    const sent = await draft(); await api('payroll.export', { batch: sent.id, previewRevision: sent.previewRevision })
    await api('leave.cancel', { request: leave.id, note: 'After handoff' })
    const reverse = await draft()
    assert.deepEqual((await api(`payroll/${reverse.id}`)).lines.map(l => [l.kind, l.units]), [['leave_reversal', '-8.00']])
    await api('payroll.export', { batch: reverse.id, previewRevision: reverse.previewRevision })
    const empty = await draft()
    const emptyExports = await Promise.all([1, 2].map(() => h.raw('/api/willow/payroll.export', { cookie: owner, body: { batch: empty.id, previewRevision: empty.previewRevision } })))
    assert.deepEqual(emptyExports.map(r => r.status).sort(), [200, 409], 'empty drafts export once too')
    // Competing real transactions may serialize either way; both outcomes must
    // preserve accurate handoff semantics without a partial claim or audit.
    for (let i = 0; i < 3; i++) {
      const r = await h.api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(65 + i), endDate: day(65 + i) })
      await api('leave.decide', { request: r.id, decision: 'approve' })
      const racing = await draft()
      const [cancel, send] = await Promise.all([
        h.raw('/api/willow/leave.cancel', { cookie: owner, body: { request: r.id, note: 'Concurrent cancellation' } }),
        h.raw('/api/willow/payroll.export', { cookie: owner, body: { batch: racing.id, previewRevision: racing.previewRevision } }),
      ])
      assert.equal(cancel.status, 200); assert.ok([200, 409].includes(send.status))
      if (send.status === 409) {
        assert.equal((await api(`payroll/${racing.id}`)).status, 'draft')
        assert.ok(!(await api('audit')).some(e => e.action === 'payroll.export' && e.subject === racing.id))
        await api('payroll.discard', { batch: racing.id, previewRevision: racing.previewRevision })
      }
      const net = await draft()
      assert.deepEqual((await api(`payroll/${net.id}`)).lines.map(l => [l.kind, l.units]), send.status === 200 ? [['leave_reversal', '-8.00']] : [])
      await api('payroll.export', { batch: net.id, previewRevision: net.previewRevision })
    }
  })

  await check('effective-period-selection', async () => {
    const departments = []
    for (const name of ['Present period', 'First period', 'Second period']) departments.push((await api('department.create', { name })).id)
    const p = await join('periods', { managerPersonId: s.managera.person, departmentId: departments[0] })
    await api('leaver.start', { period: p.period, template: templates.leaver, endDate: day(10), reason: 'Scheduled' })
    const upcoming = await join('unused', { person: p.person, startDate: day(20), jobTitle: 'First upcoming', managerPersonId: s.managerb.person, departmentId: departments[1] })
    await api('leaver.start', { period: upcoming.period, template: templates.leaver, endDate: day(30), reason: 'Scheduled' })
    await join('unused2', { person: p.person, startDate: day(40), jobTitle: 'Second upcoming', managerPersonId: s.managerb.person, departmentId: departments[2] })
    const view = await person(p.person)
    assert.equal(view.status, 'active'); assert.equal(view.current.jobTitle, 'Present role')
    assert.equal(view.current.manager.id, s.managera.person)
    assert.equal(view.employment.flatMap(e => e.terms).filter(t => t.inForce).length, 1)
    assert.equal(view.employment.find(e => e.id === p.period).terms[0].inForce, true)
    assert.equal((await api('people')).find(row => row.id === p.person).status, 'active')
    assert.equal((await api(`context/${p.person}`)).record.current.jobTitle, 'Present role')
    assert.ok((await h.api('me', s.managera.cookie)).manages.includes(p.person))
    assert.ok(!(await h.api('me', s.managerb.cookie)).manages.includes(p.person))
    assert.ok(!(await h.api(`people/${p.person}`, s.managerb.cookie)).employment)
    await h.api('reports', s.managerb.cookie, undefined, 403)
    for (const offset of [0, 10, 11, 19, 20, 30, 31, 39, 40]) {
      const report = await api(`reports?asOf=${day(offset)}`)
      assert.equal(report.headcount.byDepartment.reduce((n, row) => n + row.people, 0), report.headcount.total, `as-of terms agree with headcount at ${offset}`)
      const count = name => report.headcount.byDepartment.find(row => row.group === name)?.people ?? 0
      assert.deepEqual(['Present period', 'First period', 'Second period'].map(count), [offset <= 10 ? 1 : 0, offset >= 20 && offset <= 30 ? 1 : 0, offset >= 40 ? 1 : 0])
    }
    const gap = await join('gap', { startDate: day(-50) })
    await api('leaver.start', { period: gap.period, template: templates.leaver, endDate: day(-1), reason: 'Ended' })
    const first = await join('gap-first', { person: gap.person, startDate: day(2), jobTitle: 'Nearest upcoming' })
    await api('leaver.start', { period: first.period, template: templates.leaver, endDate: day(3), reason: 'Ended' })
    await join('gap-next', { person: gap.person, startDate: day(4), jobTitle: 'Later upcoming' })
    assert.equal((await person(gap.person)).current.jobTitle, 'Nearest upcoming')
    await api('access.end', { person: s.ended.person })
    await api('leaver.start', { period: s.ended.period, template: templates.leaver, endDate: today, reason: 'End' })
    await join('ended-rehire', { person: s.ended.person, startDate: day(2) })
    await h.api('me', s.ended.cookie, undefined, 401)
    assert.equal((await api('members')).find(m => m.id === s.ended.member).status, 'ended')
  })

  await check('ended-member-preview', async () => {
    const ended = (await api('members')).find(m => m.id === s.ended.member)
    if (ended.status === 'active') await api('access.end', { person: s.ended.person })
    await h.api('me', s.ended.cookie, undefined, 401)
    const response = await h.raw(`/api/willow/preview?member=${s.ended.member}&person=${s.ended.person}`, { cookie: owner })
    assert.equal(response.status, 403)
    assert.ok(!(await response.text()).includes('PRIVATE-ended'))
    await api('access.give', { person: s.ended.person })
    await h.api('me', s.ended.cookie, undefined, 401)
    const fresh = await h.signIn('ended@example.com')
    assert.equal((await h.api(`people/${s.ended.person}`, fresh)).private.phone, 'PRIVATE-ended')
  })

  await check('former-record-preview', async () => {
    const former = await join('former')
    const access = await api('access.give', { person: former.person })
    const self = await h.signIn('former@example.com', { requested: true })
    await api('leaver.start', { period: former.period, template: templates.leaver, endDate: day(-1), reason: 'Former' })
    await h.api(`people/${former.person}`, s.employee.cookie, undefined, 404)
    await preview(s.employee.member, former.person, owner, 404)
    assert.equal((await h.api(`people/${former.person}`, self)).status, 'former')
    assert.equal((await preview(access.id, former.person)).view.status, 'former')
    const hr = await preview(access.id, former.person, s.hr.cookie)
    assert.ok(hr.facets.find(f => f.facet === 'pay').withheldFromYou)
    assert.ok(!hr.view.pay)
    assert.equal(hr.view.private.phone, 'PRIVATE-former')
    assert.ok((await api('audit')).some(e => e.action === 'person.private.read' && e.actor === s.hr.member && e.subject === former.person))
    await api('member.permissions', { member: s.hr.member, permissions: ['people.manage'] })
    const narrowed = await h.signIn('hr@example.com')
    const limited = await preview(s.employee.member, s.employee.person, narrowed)
    assert.ok(!limited.view.private && !limited.view.pay && !limited.view.documents)
    assert.ok(limited.facets.find(f => f.facet === 'private').withheldFromYou)
    assert.equal((await preview(s.hr.member, former.person)).view.status, 'former')
  })

  await check('future-routed-approver', async () => {
    await api('mover.schedule', { period: s.employee.period, effectiveFrom: day(15), managerPersonId: s.managerb.person, reason: 'New manager' })
    const request = await h.api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(28), endDate: day(28), reason: 'CONFIDENTIAL-REASON' })
    assert.equal(request.approver, s.managerb.member)
    const detail = await h.api(`leave/${request.id}`, s.managerb.cookie)
    assert.ok(detail.canDecide); assert.ok(!('reason' in detail)); assert.ok(!('balanceMinutes' in detail), 'routed access reveals no account balance')
    assert.ok((await h.api('approvals', s.managerb.cookie)).some(r => r.id === request.id))
    for (const path of ['/app/leave', `/app/leave/${request.id}`]) {
      const response = await h.raw(path, { cookie: s.managerb.cookie }); assert.equal(response.status, 200)
      const body = await response.text(); assert.ok(body.includes(request.id)); assert.ok(!body.includes('CONFIDENTIAL-REASON'))
    }
    const general = await h.api(`people/${s.employee.person}`, s.managerb.cookie)
    assert.ok(!general.leave && !general.employment && !general.private)
    await h.api(`quote?account=${s.employee.account}&startDate=${day(28)}&endDate=${day(28)}`, s.managerb.cookie, undefined, 404)
    await h.api(`leave/${request.id}`, s.payroll.cookie, undefined, 404)
    assert.ok((await h.api(`leave/${request.id}`, s.managera.cookie)).calculation)
    await h.api('leave.decide', s.managera.cookie, { request: request.id, decision: 'approve' }, 403)
    await h.api('leave.decide', s.employee.cookie, { request: request.id, decision: 'approve' }, 403)
    await h.api('leave.decide', s.managerb.cookie, { request: request.id, decision: 'approve' })
    await h.api('leave.decide', s.managerb.cookie, { request: request.id, decision: 'approve' }, 409)
    assert.equal((await api(`leave/${request.id}`)).ledger.filter(l => l.kind === 'use').length, 1)
    const decline = await h.api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(29), endDate: day(29) })
    const redirected = await h.submit('leave.decide', s.managerb.cookie, { request: decline.id, decision: 'decline' }, `/app/leave/${decline.id}`)
    assert.ok(!redirected.searchParams.has('error'))
    await h.api('leave.decide', s.managerb.cookie, { request: decline.id, decision: 'decline' }, 409)
    assert.equal((await api(`leave/${decline.id}`)).ledger.filter(l => l.kind === 'release').length, 1)
    const unrelated = await h.api('leave.request', s.employee.cookie, { account: s.employee.account, startDate: day(8), endDate: day(8) })
    await h.api(`leave/${unrelated.id}`, s.managerb.cookie, undefined, 404)
  })

  await check('in-progress-board', async () => {
    const key = `case:${s.employee.case}`
    const board = await api('progress')
    const row = board.rows.find(r => r.key === key)
    assert.ok(row?.exception && row.needsYou, 'an open joiner with an overdue task is the exception and needs the owner')
    assert.ok(board.needYou >= 1)
    assert.ok((await h.api('progress', s.employee.cookie)).rows.every(r => r.person.id === s.employee.person), 'an employee sees no one else’s changes')
    const page = await (await h.raw(`/app/progress?select=${key}`, { cookie: owner })).text()
    assert.ok(page.includes('Expected vs observed') && page.includes('aria-current="true"'))
    for (const task of (await api(`cases/${s.employee.case}`)).tasks.filter(t => t.status === 'open')) await api('task.complete', { task: task.id, evidence: 'Recorded' })
    await api('case.complete', { case: s.employee.case })
    assert.ok(!(await api('progress')).rows.some(r => r.key === key), 'a completed case leaves the board')
  })
} finally { await h.close() }
if (failures) process.exitCode = 1

await import("./people.mjs")

await import("./open-billing.mjs")

await import("./employee-export.mjs")

await import("./employee-bundle.mjs")

await import("./work-followup.mjs")

await import("./workflows.mjs")

await import("./custom-fields.mjs")

await import("./record-tables.mjs")

await import("./change-requests.mjs")

await import("./date-alerts.mjs")

await import("./self-service.mjs")

await import("./custom-reports.mjs")

await import("./leave-policies.mjs")

await import("./company-home.mjs")

await import('./compensation.mjs')

await import('./surveys.mjs')

await import('./levels.mjs')

await import('./retention.mjs')

await import('./eeo-self-id.mjs')

await import('./eeo-snapshot.mjs')
