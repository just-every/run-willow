// ROLE-006 public-door proof: independent fields, native approval and current scope.
import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'
import { readZip } from './export-reader.mjs'

export async function leaveLevelProof(h, owner, fx) {
 const api = (path, body, status) => h.api(path, owner, body, status)
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 const near = (await api('location.create', { name: 'synthetic-willow-leave-near', timezone: 'UTC' })).id
 const far = (await api('location.create', { name: 'synthetic-willow-leave-far', timezone: 'UTC' })).id
 const department = (await api('department.create', { name: 'synthetic-willow-leave-team' })).id
 const reader = await fx.join('synthetic-willow-leave-reader', { locationId: far })
 const member = (await api('access.give', { person: reader.person })).id
 const cookie = await h.signIn('synthetic-willow-leave-reader@example.com', { requested: true })
 const as = (path, body, status) => h.api(path, cookie, body, status)
 const subject = await fx.join('synthetic-willow-leave-subject', { locationId: near, departmentId: department })
 const outside = await fx.join('synthetic-willow-leave-outside', { locationId: far, departmentId: department })
 const account = await fx.account(subject.period), outsideAccount = await fx.account(outside.period)
 const ownAccount = await fx.account(reader.period)
 await api('leave.adjust', { account, hours: '0.5', effectiveDate: day(0), note: 'synthetic-willow-leave-ledger-private' })
 await api('leave.request', { account, startDate: day(40), endDate: day(40), reason: 'synthetic-willow-leave-reason-private' })
 const scope = { kind: 'group', dimensions: { location: [near] } }
 const level = await apply({ kind: 'level', name: 'synthetic-willow-leave-rights', permissions: ['reports.read'], scope, leaveFields: { self: {}, others: { balances: 'view' } } })
 await apply({ kind: 'assignment', member, levels: [level.id] })
 const read = async () => (await as(`people/${subject.person}`)).leave
 const ownerAccount = async () => (await api(`people/${subject.person}`)).leave.accounts.find(a => a.id === account)
 let narrow = await read()
 assert.equal(typeof narrow.accounts[0].balanceMinutes, 'number')
 assert.ok(!('ledger' in narrow.accounts[0]) && !('policy' in narrow.accounts[0]))
 assert.deepEqual(narrow.requests, [])
 const context = await as(`context/${subject.person}`)
 assert.deepEqual(context.record.leave, narrow)
 const preview = await api(`preview?member=${member}&person=${subject.person}`)
 assert.deepEqual(preview.view.leave, narrow)
 const protectedValues = ['PRIVATE-synthetic-willow-leave-subject', 'synthetic-willow-leave-ledger-private', 'synthetic-willow-leave-reason-private', '81234.56', '8123456']
 for (const value of protectedValues) assert.ok(!JSON.stringify([context, preview]).includes(value))
 for (const format of ['csv', 'xlsx', 'zip']) {
  const response = await h.raw(`/app/exports/employees.${format}?scope=organization&person=${subject.person}&fields=name,payAmount,phone${format === 'zip' ? '&history=leave' : ''}`, { cookie })
  assert.equal(response.status, 200)
  const bytes = Buffer.from(await response.arrayBuffer()), text = format === 'csv' ? bytes.toString() : [...readZip(bytes).values()].map(value => value.toString()).join('\n')
  for (const value of protectedValues) assert.ok(!text.includes(value), `${format} preserves leave field boundaries`)
 }
 assert.ok(!JSON.stringify(await as(`people/${subject.person}`)).includes('PRIVATE-synthetic-willow-leave-subject'))
 const adjustment = { account, hours: '1', effectiveDate: day(0), note: 'synthetic-willow-leave-adjustment' }
 await as('leave.adjust', adjustment, 403)
 await as('policy.write', { name: 'Forbidden', summary: 'Forbidden', accrualWeeks: '0', negativeLimitHours: '0' }, 403)
 const before = await ownerAccount()
 await apply({ kind: 'level', level: level.id, name: 'synthetic-willow-leave-rights', permissions: [], scope, leaveFields: { self: {}, others: { balances: 'approval', requests: 'approval', calendar: 'view' } } })
 const pending = await as('leave.adjust', adjustment)
 assert.equal(pending.status, 'pending')
 assert.equal((await api('leave-overrides')).find(item=>item.id===pending.id).person.id,subject.person)
 assert.deepEqual(await ownerAccount(), before, 'A pending override changes neither ledger nor balance')
 await as('leave.override.decide', { override: pending.id, decision: 'approve' }, 403)
 await api('leave.override.decide', { override: pending.id, decision: 'approve' })
 assert.equal((await ownerAccount()).balanceMinutes, before.balanceMinutes + 60)
 assert.equal((await ownerAccount()).ledger.length, before.ledger.length + 1)

 const dates = { startDate: day(25), endDate: day(25) }
 const outsideRequest = await api('leave.request', { account: outsideAccount, ...dates, reason: 'synthetic-willow-leave-secret-reason' })
 const quote = await as(`quote?account=${account}&startDate=${dates.startDate}&endDate=${dates.endDate}`)
 assert.ok(quote.coverage.some(item => item.name === 'synthetic-willow-leave-outside'))
 assert.ok(quote.coverage.every(item => Object.keys(item).every(key => ['name', 'startDate', 'endDate', 'status'].includes(key))))
 await as(`leave/${outsideRequest.id}`, undefined, 404)
 assert.equal((await as(`people/${outside.person}`)).leave, undefined)
 const request = await as('leave.request', { account, ...dates, reason: 'synthetic-willow-leave-private' })
 assert.equal(request.status, 'pending')
 const detail = await as(`leave/${request.id}`)
 assert.equal(detail.canDecide, false)
 assert.ok(!('reason' in detail) && !('policy' in detail))
 assert.deepEqual(detail.ledger, [])
 await as('leave.decide', { request: request.id, decision: 'approve' }, 403)
 await api('leave.decide', { request: request.id, decision: 'approve' })
 assert.equal((await api(`leave/${request.id}`)).status, 'approved')
 await as('leave.cancel', { request: request.id, note: 'Fine approval is not cancellation authority' }, 403)
 // Existing self-service stays independent of this level's scope and self rules.
 const own = await as('leave.request', { account: ownAccount, startDate: day(26), endDate: day(26) })
 await api('leave.decide', { request: own.id, decision: 'approve' })
 await as('leave.cancel', { request: own.id, note: 'synthetic-willow-self-cancel' })

 const stale = await as('leave.adjust', adjustment)
 await api('leave.adjust', { ...adjustment, note: 'synthetic-willow-ledger-source-changed' })
 await api('leave.override.decide', { override: stale.id, decision: 'approve' }, 409)
 await api('leave.override.decide', { override: stale.id, decision: 'decline' })
 const revoked = await as('leave.adjust', adjustment)
 await apply({ kind: 'assignment', member, levels: [] })
 await api('leave.override.decide', { override: revoked.id, decision: 'approve' }, 403)
 await api('leave.override.decide', { override: revoked.id, decision: 'decline' })
 await as('leave.adjust', adjustment, 403)
 await as('leave.request', { account, startDate: day(28), endDate: day(28) }, 404)
 await apply({ kind: 'assignment', member, levels: [level.id] })
 const moved = await as('leave.adjust', adjustment)
 const transfer = await api('mover.schedule', { period: subject.period, effectiveFrom: day(0), locationId: far, reason: 'synthetic-willow-leave-scope-transfer' })
 await api('leave.override.decide', { override: moved.id, decision: 'approve' }, 403)
 await api('leave.override.decide', { override: moved.id, decision: 'decline' })
 await as('leave.adjust', adjustment, 403)
 await api('terms.cancel', { terms: transfer.terms, reason: 'synthetic-willow-leave-restore-scope' })
 // Calendar alone never exposes an account, request, policy or balance.
 await apply({ kind: 'level', level: level.id, name: 'synthetic-willow-leave-rights', permissions: [], scope, leaveFields: { self: {}, others: { calendar: 'view' } } })
 narrow = await read()
 assert.deepEqual(narrow.accounts, [])
 assert.deepEqual(narrow.requests, [])
 assert.ok(narrow.calendar.length)
 const calendarQuote = await as(`quote?account=${account}&startDate=${dates.startDate}&endDate=${dates.endDate}`)
 assert.deepEqual(Object.keys(calendarQuote).sort(), ['coverage', 'withheld'])
 await as(`leave/${request.id}`, undefined, 404)
 await apply({ kind: 'level', level: level.id, name: 'synthetic-willow-leave-rights', permissions: [], scope, leaveFields: { self: {}, others: { balances: 'approval' } } })
 const ended = await as('leave.adjust', adjustment)
 await api('access.end', { person: reader.person })
 await api('leave.override.decide', { override: ended.id, decision: 'approve' }, 403)
 await api('leave.override.decide', { override: ended.id, decision: 'decline' })
}
