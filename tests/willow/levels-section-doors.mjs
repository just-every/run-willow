// Extend the registered WIL-03 crawl with compensation and leave field sources.
import assert from 'node:assert/strict'

export async function sectionDoorProof(h, owner, reader, { ids, urls, today, addDays }) {
 const api = (path, body, status) => h.api(path, owner, body, status)
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 const target = await api('joiner.start', { template: ids.joinerTemplate, legalName: 'synthetic-willow-9901', startDate: addDays(today, -180), employmentType: 'full_time', jobTitle: 'synthetic-willow-9902', scheduleId: ids.week, locationId: ids.sydney, departmentId: ids.ops, payBasis: 'salary', payAmount: '92871.63', phone: 'synthetic-willow-9903' })
 const policy = await api('policy.write', { name: 'synthetic-willow-9904', summary: 'synthetic-willow-9905', accrualWeeks: '0', negativeLimitHours: '0' })
 await api('policy.approve', { version: policy.id })
 const account = await api('account.open', { period: target.period, policy: policy.policy, cutoverDate: addDays(today, -150), openingHours: '123', note: 'synthetic-willow-9906' })
 await api('account.approve', { account: account.id })
 await api('leave.adjust', { account: account.id, hours: '1', effectiveDate: today, note: 'synthetic-willow-9907' })
 let leaveDay = addDays(today, 14)
 while (new Date(`${leaveDay}T00:00:00Z`).getUTCDay() !== 1) leaveDay = addDays(leaveDay, 1)
 const request = await api('leave.request', { account: account.id, startDate: leaveDay, endDate: leaveDay, reason: 'synthetic-willow-9908' })
 await api('compensation.record', { person: target.person, kind: 'bonus', effectiveDate: today, amount: '432.17', currency: 'AUD', note: 'synthetic-willow-9909' })
 await api('compensation.record', { person: target.person, kind: 'equity', effectiveDate: today, units: '983.125', security: 'synthetic-willow-9910', note: 'synthetic-willow-9911' })
 const plan = { kind: 'level', name: 'synthetic-willow-9912', permissions: ['reports.read'], scope: { kind: 'group', dimensions: { location: [ids.sydney] } }, compensationFields: { self: {}, others: { pay: 'view' } }, leaveFields: { self: {}, others: { balances: 'view', calendar: 'view' } } }
 const level = await apply(plan)
 await apply({ kind: 'assignment', member: ids.ivanMember, levels: [level.id] })
 const extras = [`/api/willow/people/${target.person}`, `/api/willow/context/${target.person}`, `/app/people/${target.person}`, `/api/willow/leave/${request.id}`, `/app/leave/${request.id}`, `/api/willow/quote?account=${account.id}&startDate=${leaveDay}&endDate=${leaveDay}`, ...['csv', 'xlsx', 'zip'].map(format => `/app/exports/employees.${format}?scope=organization&person=${target.person}&fields=name,payAmount,phone${format === 'zip' ? '&history=employment,leave' : ''}`)]
 const doors = [...new Set([...urls, ...extras])]
 const hidden = ['synthetic-willow-9903', 'synthetic-willow-9905', 'synthetic-willow-9906', 'synthetic-willow-9907', 'synthetic-willow-9908', 'synthetic-willow-9909', 'synthetic-willow-9910', 'synthetic-willow-9911', ':43217,', '432.17', '983.125']
 let sawPay = false
 for (const path of doors) {
  const response = await h.raw(path, { cookie: reader })
  assert.ok(response.status < 500, `${path} returns a controlled response`)
  const body = await response.text()
  for (const value of hidden) assert.ok(!body.includes(value), `Compensation/leave View leaks unrelated data through ${path}`)
  if (body.replaceAll(',', '').includes('92871.63') || body.includes('9287163')) sawPay = true
 }
 assert.ok(sawPay, 'An explicit scoped pay View reads native pay through real registered doors')
 const record = await h.api(`people/${target.person}`, reader)
 assert.equal(record.leave.accounts[0].balanceMinutes, 124 * 60 - request.minutes)
 assert.equal(record.leave.accounts[0].ledger, undefined)
 await h.api('leave.adjust', reader, { account: account.id, hours: '1', effectiveDate: today, note: 'synthetic-willow-9913' }, 403)
 await apply({ ...plan, level: level.id, compensationFields: { self: {}, others: {} }, leaveFields: { self: {}, others: {} } })
 for (const path of doors) {
  const response = await h.raw(path, { cookie: reader })
  assert.ok(response.status < 500, `${path} remains controlled after revocation`)
  const body = await response.text()
  for (const value of [...hidden, '9287163', '92871.63']) assert.ok(!body.replaceAll(',', '').includes(value), `Same-session compensation/leave revocation through ${path}`)
 }
 console.log(`ROLE-005/006 every-door fields: PASS — ${doors.length} registered and native target doors, scoped View, withheld unrelated sections and same-session revocation`)
}
