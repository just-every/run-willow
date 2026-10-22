// Native awards, field-limited history and FLOW-004 compensation approval over HTTP.
import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'
import { publishTemplate } from './publish-template.mjs'

export async function compensationRecordProof(h, owner, fx) {
 const { api, join } = fx
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 const member = async (number, extra = {}) => {
  const key = `synthetic-willow-${number}`, person = await join(key, extra)
  const access = await api('access.give', { person: person.person })
  return { ...person, member: access.id, cookie: await h.signIn(`${key}@example.com`, { requested: true }) }
 }
 const location = await api('location.create', { name: 'synthetic-willow-501', timezone:'UTC' })
 const subject = await member(502, { locationId: location.id }), writer = await member(503), requester = await member(504), reader = await member(505)
 const outside = await join('synthetic-willow-506')
 const scope = { kind: 'group', dimensions: { location: [location.id] } }
 const definition = async (name, others, self = {}, scoped = true) => apply({ kind: 'level', name, permissions: [], ...(scoped ? { scope } : {}), compensationFields: { self, others } })
 const edit = await definition('synthetic-willow-507', { bonus: 'edit', equity: 'edit', history: 'view' })
 const approval = await definition('synthetic-willow-508', { bonus: 'approval', equity: 'approval' })
 const viewing = await definition('synthetic-willow-509', { bonus: 'view', history: 'view' })
 const self = await definition('synthetic-willow-510', {}, { bonus: 'view', equity: 'view' }, false)
 for (const [who, level] of [[writer, edit], [requester, approval], [reader, viewing], [subject, self]]) await apply({ kind: 'assignment', member: who.member, levels: [level.id] })
 const as = (who, path, body, status) => h.api(path, who.cookie, body, status)
 const read = async (who = writer, person = subject.person) => (await as(who, `people/${person}`)).compensationRecords
 const bonusPlan = { kind: 'bonus', effectiveDate: day(10), amount: '250.05', currency: 'AUD', note: 'synthetic-willow-511' }
 const equityPlan = { kind: 'equity', effectiveDate: day(11), units: '123456789012345.123456', security: 'synthetic-willow-512', note: 'synthetic-willow-513' }
 const bonus = await as(writer, 'compensation.record', { person: subject.person, ...bonusPlan })
 const equity = await as(writer, 'compensation.record', { person: subject.person, ...equityPlan })
 const correctedPlan = { ...bonusPlan, record: bonus.id, revision: bonus.revision, amount: '300.01' }
 const corrected = await as(writer, 'compensation.record', { person: subject.person, ...correctedPlan })
 const awards = await read()
 assert.deepEqual(awards.bonus.filter(row => row.id === bonus.id).map(row => row.amountCents), [30001, 25005], 'Corrections append complete immutable award versions')
 assert.equal(awards.equity.find(row => row.id === equity.id).units, equityPlan.units, 'Equity units keep exact decimal precision')
 await as(writer, 'compensation.record', { person: subject.person, ...correctedPlan }, 409)
 await as(writer, 'compensation.record', { person: outside.person, ...bonusPlan }, 403)
 await as(writer, 'compensation.record', { person: writer.person, ...bonusPlan }, 403)
 await as(writer, 'compensation.record', { person: subject.person, ...bonusPlan, payAmount: '1' }, 400)
 assert.deepEqual((await as(writer, 'me')).permissions, [], 'Award writes do not grant salary, global cycle or budget rights')
 await as(writer, 'compensation.cycle', { name: 'synthetic-willow-514', kind: 'bonus', effectiveFrom: day(20), budget: '1' }, 403)
 const limited = await read(reader)
 assert.equal(limited.bonus.filter(row => row.id === bonus.id).length, 2)
 assert.deepEqual(limited.equity, [], 'History never discloses a missing award kind')
 const own = await read(subject)
 assert.equal(own.bonus.filter(row => row.id === bonus.id).length, 1)
 assert.equal(own.bonus.find(row => row.id === bonus.id).revision, corrected.revision)
 assert.equal(own.equity[0].units, equityPlan.units)
 await as(subject, 'compensation.record', { person: subject.person, ...bonusPlan }, 403)
 await apply({ kind: 'level', level: viewing.id, name: 'synthetic-willow-509', permissions: [], scope, compensationFields: { self: {}, others: { bonus: 'view', equity: 'view' } } })
 assert.equal((await read(reader)).bonus.filter(row => row.id === bonus.id).length, 1, 'Revoking history hides superseded versions in the same session')

 const mover = await publishTemplate(h, owner, { name: 'synthetic-willow-515', kind: 'mover', taskTitle: ['synthetic-willow-516'], taskAssignee: ['hr'], taskDueDays: ['0'] })
 await api('change.chain', { requestType: 'compensation', template: mover.id, stepRole: ['hr'] })
 const request = plan => as(requester, 'change.request', { person: subject.person, reason: 'synthetic-willow-517', comment: 'synthetic-willow-524', compensationRecord: plan })
 const approve = async (id, status) => api('change.decide', { request: id, state: (await api(`change-requests/${id}`)).state, decision: 'approve' }, status)
 for (const plan of [{ ...bonusPlan, effectiveDate: day(30), amount: '125' }, { ...equityPlan, effectiveDate: day(31), units: '42.125' }]) {
  const before = await read(), proposed = await request(plan)
  assert.equal(proposed.type, 'compensation')
  assert.deepEqual(await read(), before, 'An approval-required award does not enter native records early')
  const detail = await as(requester, `change-requests/${proposed.id}`)
  assert.equal(detail.editCompensation.kind, 'record')
  assert.equal(detail.editCompensation.values.note, plan.note)
  const revised = { ...plan, note: 'synthetic-willow-521', ...(plan.kind === 'bonus' ? { amount: '126.01' } : { units: '43.125001' }) }
  await as(requester, 'compensation.record.resubmit', { ...revised, request: proposed.id, state: detail.state, reason: 'synthetic-willow-522' })
  const edited = await as(requester, `change-requests/${proposed.id}`)
  assert.equal(edited.revision, detail.revision + 1)
  assert.deepEqual(edited.editCompensation.values, revised)
  assert.equal((await api(`change-requests/${proposed.id}`)).editCompensation, undefined, 'An approver never receives requester edit values')
  const page = await (await h.raw(`/app/changes/${proposed.id}`, { cookie: requester.cookie })).text()
  assert.ok(page.includes('/app/do/compensation.record.resubmit') && !page.includes('/app/do/change.edit'), 'The native page edits an award, preserving its typed values')
  assert.deepEqual(await read(), before, 'Resubmission does not publish an award')
  const decided = await approve(proposed.id)
  assert.equal(decided.status, 'approved')
  assert.ok(decided.result.case, 'The configured typed compensation chain starts its native mover workflow')
  assert.ok((await read())[plan.kind].some(row => row.id === decided.result.id))
  const saved = (await read())[plan.kind].find(row => row.id === decided.result.id)
  assert.equal(saved.note, revised.note)
  if (plan.kind === 'bonus') assert.equal(saved.amountCents, 12601)
  else assert.equal(saved.units, revised.units)
 }
 await as(requester, 'compensation.record', { person: subject.person, ...bonusPlan }, 403)
 await as(requester, 'change.request', { person: subject.person, reason: 'synthetic-willow-517', compensationRecord: bonusPlan, jobTitle: 'synthetic-willow-518' }, 400)
 const stale = await request({ ...bonusPlan, record: bonus.id, revision: corrected.revision, amount: '350' })
 await as(writer, 'compensation.record', { person: subject.person, ...bonusPlan, record: bonus.id, revision: corrected.revision, amount: '400' })
 await approve(stale.id, 409)
 assert.equal((await api(`change-requests/${stale.id}`)).status, 'pending')
 const revoked = await request({ ...bonusPlan, effectiveDate: day(35), amount: '175' })
 assert.ok((await as(requester, `change-requests/${revoked.id}`)).history.some(event => event.comment === 'synthetic-willow-524'))
 await apply({ kind: 'assignment', member: requester.member, levels: [] })
 const withheld = await as(requester, `change-requests/${revoked.id}`)
 assert.equal(withheld.editCompensation, undefined)
 assert.equal(withheld.mayEdit, false)
 assert.ok(withheld.history.every(event => event.comment === null))
 assert.ok(!JSON.stringify(withheld).includes('synthetic-willow-524'), 'Revocation removes previously readable history text')
 await as(requester, 'compensation.record.resubmit', { ...bonusPlan, effectiveDate: day(35), amount: '175', request: revoked.id, state: withheld.state, reason: 'synthetic-willow-523' }, 403)
 await approve(revoked.id, 403)
 await apply({ kind: 'assignment', member: requester.member, levels: [approval.id] })
 const moved = await request({ ...equityPlan, effectiveDate: day(36), units: '75' })
 const otherLocation = await api('location.create', { name: 'synthetic-willow-519', timezone:'UTC' })
 await api('mover.schedule', { period: subject.period, effectiveFrom: day(-1), reason: 'synthetic-willow-520', locationId: otherLocation.id })
 await approve(moved.id, 409)
 await as(writer, 'compensation.record', { person: subject.person, ...bonusPlan }, 403)
 assert.equal((await api(`change-requests/${moved.id}`)).status, 'pending')
 console.log('ROLE-005 award records: PASS — bonus/equity writes and correction history, exact units, scoped field reads, self-view, typed approval and stale/revocation/mover fences')
 return { subject, writer, requester, reader, bonus, equity }
}
