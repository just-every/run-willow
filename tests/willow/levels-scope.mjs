// ROLE-002: a level scoped to one location, assigned to ten members, through every registered door,
// the four control members, dated transfers on each side of the effective date, and batch revert.
import assert from 'node:assert/strict'
import { API_DOORS, PAGE_DOORS } from '../../src/willow/doors.ts'
import { day } from './regression-fixture.mjs'

export const RIGHTS = ['people.manage', 'people.private', 'pay.read', 'documents.private', 'leave.manage', 'reports.read']
const payForms = cents => [String(cents), (cents / 100).toFixed(2), (cents / 100).toLocaleString('en', { minimumFractionDigits: 2 })]
const stamp = zone => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date())
const after = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10)

export async function scopeProof(h, owner, fx) {
 const { join, account, templates } = fx
 const api = (path, body, status) => h.api(path, owner, body, status)
 const preview = body => api('level.preview', body), apply = review => api('level.apply', { review: review.id })
 const setZone = timezone => api('employer.configure', { name: 'Recovery example', timezone, country: 'AU', currency: 'AUD' })
 let invites = 0
 // Each invitation comes from its own client address so the per-address invitation limit never throttles the fixture.
 const invite = async person => { const response = await h.raw('/api/willow/access.give', { cookie: owner, body: { person }, ip: `10.5.9.${++invites}` }); assert.equal(response.status, 200, await response.clone().text()); return response.json() }
 const harbour = (await api('location.create', { name: 'Scope Harbour', timezone: 'UTC' })).id
 const hills = (await api('location.create', { name: 'Scope Hills', timezone: 'UTC' })).id
 const category = (await api('category.create', { name: 'Scope files', subjectReads: true })).id
 let count = 0
 const make = async (key, { location = harbour, member = false, ...extra } = {}) => {
  const cents = 6100000 + ++count * 137 + 19
  const person = await join(`sc${key}`, { locationId: location, jobTitle: 'Scope role', phone: `PRIVATE-sc${key}`, payAmount: (cents / 100).toFixed(2), payrollId: `SCPAY-${key}`, employeeNumber: `EMPNO-${key}`, ...extra })
  const record = { key, cents, ...person, secrets: [`PRIVATE-sc${key}`, `SCPAY-${key}`, `EMPNO-${key}`, ...payForms(cents)] }
  if (member) { record.member = (await invite(person.person)).id; record.cookie = await h.signIn(`sc${key}@example.com`, { requested: true, ip: `10.2.0.${count}` }) }
  return record
 }
 const note = async (who, kind, text) => { const title = `SECRET-${kind}-${who.key}`; who.secrets.push(title); return title }
 const leave = async (who, reason, from = 10) => {
  who.account ??= await account(who.period)
  const request = await api('leave.request', { account: who.account, startDate: day(from), endDate: day(from), reason })
  who.secrets.push(reason)
  return request.id
 }
 const document = async who => {
  const title = await note(who, 'DOC')
  await api('document.add', { person: who.person, category, title, file: { filename: 'scope.txt', base64: Buffer.from(`SCOPE-BYTES-${who.key}`).toString('base64') } })
  who.secrets.push(`SCOPE-BYTES-${who.key}`)
 }

 // The ten, four controls and in-location colleagues; Hills people sit outside the level's scope.
 const ten = []
 for (let i = 0; i < 10; i++) ten.push(await make(`a${i}`, { member: true }))
 const c1 = await make('c1', { member: true }), c2 = await make('c2', { member: true }), c3 = await make('c3', { member: true }), c4 = await make('c4', { member: true })
 const inside = await make('in'), insideB = await make('in2')
 const b0 = await make('b0', { location: hills, managerPersonId: c2.person }), b1 = await make('b1', { location: hills, managerPersonId: c3.person })
 const b2 = await make('b2', { location: hills, managerPersonId: c4.person }), b3 = await make('b3', { location: hills })
 const formerIn = await make('fin'), formerOut = await make('fout', { location: hills })
 for (const [who, key] of [[formerIn, 'in'], [formerOut, 'out']]) {
  const reason = `ENDREASON-${key}`
  await api('leaver.start', { period: who.period, endDate: day(-5), reason, template: templates.leaver })
  who.secrets.push(reason)
 }
 for (const who of [inside, ten[0], b0, b3]) await document(who)
 const requests = { inside: await leave(inside, 'SECRET-REASON-in', 11), b0: await leave(b0, 'SECRET-REASON-b0', 12), b1: await leave(b1, 'SECRET-REASON-b1', 13), b3: await leave(b3, 'SECRET-REASON-b3', 14) }
 // A routed approver stays routed after the manager changes: the manager link moves, the stored approver does not.
 await api('mover.schedule', { period: b1.period, effectiveFrom: day(0), managerPersonId: c2.person, reason: 'Moved under another manager' })
 const cycle = await api('performance.cycle', { name: 'Scope summary cycle', dueDate: day(20), people: [b2.person], questions: { self: ['Q self'], peer: ['Q peer'], manager: ['Q manager'] } })
 const summary = 'RELEASE-SCOPE-b2 summary only its recipients read'
 await api('performance.release', { cycle: cycle.id, person: b2.person, summary, rating: 'Meets agreed outcomes' })
 b2.secrets.push(summary)
 const outside = [b0, b1, b2, b3, formerOut], insiders = [...ten, c1, c2, c3, c4, inside, insideB, formerIn]
 const outsideSecrets = outside.flatMap(who => who.secrets)

 // Level scoped to one location; owner grants c1 an employer-wide grant before assignment.
 await api('member.permissions', { member: c1.member, permissions: ['people.private'] })
 const scope = { kind: 'group', dimensions: { location: [harbour] } }
 await api('level.preview', { kind: 'level', name: 'Scope refused', permissions: [...RIGHTS, 'payroll.handoff'], scope }, 400)
 const level = await apply(await preview({ kind: 'level', name: 'Harbour reader', permissions: RIGHTS, scope }))
 const prior = await apply(await preview({ kind: 'level', name: 'Scope prior summaries', permissions: ['it.tasks'] }))
 await apply(await preview({ kind: 'bulk-assignment', members: [ten[5].member, ten[6].member], levels: [prior.id] }))
 const batchMembers = [...ten, c1, c2, c3, c4]
 const ids = batchMembers.map(who => who.member)
 const assigned = data => Object.fromEntries(ids.map(id => [id, data.assignments.filter(a => a.member_id === id).map(a => a.level_id).sort()]))
 const before = assigned(await api('levels'))
 const review = await preview({ kind: 'bulk-assignment', members: ids, levels: [level.id] })
 assert.ok(review.impact.every(item => item.afterScoped.length === 1 && item.afterScoped[0].reach === insiders.length), 'The preview names each member\'s scoped rights and the people they reach today')
 assert.ok(review.impact.every(item => !item.after.some(p => RIGHTS.includes(p)) || item.member === c1.member), 'A scoped level adds no employer-wide permission')
 for (const who of batchMembers) assert.deepEqual((await h.api('me', who.cookie)).scoped, [], 'Previewing changes no authority')
 await apply(review)
 for (const who of batchMembers) {
  const me = await h.api('me', who.cookie)
  assert.deepEqual(me.permissions, who === c1 ? ['people.private'] : [], 'Scoped rights are never employer-wide permissions')
  assert.equal(me.scoped.length, 1)
  assert.deepEqual(me.scoped[0].permissions, [...RIGHTS].sort())
 }

 // Every door: the ten read in-location people and nothing beyond the directory about others.
 const versions = []
 for (const who of [inside, ten[0], b0, b3]) for (const doc of (await api(`people/${who.person}`)).documents ?? []) for (const version of doc.versions) versions.push(version.id)
 const personIds = (await api('people?status=all')).map(p => p.id)
 const caseIds = [...insiders, ...outside].map(who => who.case)
 const accounts = [inside, b0, b1, b3].map(who => who.account)
 const memberIds = (await api('members')).map(member => member.id)
 const values = { person: personIds, context: personIds, case: caseIds, leave: Object.values(requests), request: Object.values(requests), performanceCycle: [cycle.id], performanceFile: [cycle.id] }
 const fill = (pattern, name) => {
  const base = pattern.replace(/^\^|\$$/g, '').replace(/\\\./g, '.')
  if (name === 'employeeBundle') return ['self', 'team', 'organization'].map(scopeName => `${base}?scope=${scopeName}&fields=name,phone,payAmount,payrollId&history=employment,leave,lifecycle,documents`)
  if (name === 'employeeCsv' || name === 'employeeXlsx') return ['self', 'team', 'organization'].map(scopeName => `${base}?scope=${scopeName}&fields=name,phone,payAmount,payrollId`)
  if (name === 'preview') return memberIds.slice(0, 4).flatMap(member => [inside.person, b0.person].map(person => `preview?member=${member}&person=${person}`))
  if (name === 'quote') return accounts.map(id => `quote?account=${id}&startDate=${day(30)}&endDate=${day(30)}`)
  if (name === 'access') return [`/app/access?member=${memberIds[0]}&person=${b0.person}`]
  if (name === 'document') return versions.flatMap(id => [`/app/files/document/${id}`, `/app/files/document/${id}?download=1`])
  if (!base.includes('([\\w-]+)')) return [base]
  return (values[name] ?? ['unknown-id']).map(id => base.replace('([\\w-]+)', id))
 }
 const urls = [...API_DOORS.flatMap(([pattern, name]) => fill(pattern, name).map(path => `/api/willow/${path}`)), ...PAGE_DOORS.flatMap(([pattern, name]) => fill(pattern, name))]
 const seen = new Map()
 for (const who of [ten[0], ten[9]]) for (const url of urls) {
  const response = await h.raw(url, { cookie: who.cookie })
  const body = await response.text()
  for (const secret of outsideSecrets) assert.ok(!body.includes(secret), `${who.key} read ${secret} through ${url} (${response.status})`)
  for (const person of insiders) for (const secret of person.secrets) if (body.includes(secret)) seen.set(secret, (seen.get(secret) ?? 0) + 1)
 }
 // The visibility preview names a member's scoped rights and applies them per person.
 const previewIn = await api(`preview?member=${ten[0].member}&person=${inside.person}`)
 assert.ok(previewIn.facets.find(item => item.facet === 'private').visible && previewIn.member.scoped[0].reachesThisPerson)
 const previewOut = await api(`preview?member=${ten[0].member}&person=${b0.person}`)
 assert.deepEqual(previewOut.facets.filter(item => item.visible).map(item => item.facet), ['directory'])
 assert.equal(previewOut.member.scoped[0].reachesThisPerson, false)
 const read = who => who.secrets.filter(secret => seen.has(secret))
 for (const who of [inside, ten[0]]) for (const secret of [`PRIVATE-sc${who.key}`, ...payForms(who.cents).slice(0, 1), `EMPNO-${who.key}`, `SCPAY-${who.key}`]) assert.ok(seen.has(secret), `${secret} is readable in scope`)
 assert.ok(seen.has('SECRET-REASON-in') && seen.has('SECRET-DOC-in') && seen.has('ENDREASON-in'), 'Leave reasons, documents and end reasons of in-location people are readable in scope')
 assert.ok(read(formerIn).length, 'A former in-location person is reachable through the level')
 for (const who of ten.slice(0, 3)) {
  const profile = await h.api(`people/${inside.person}`, who.cookie)
  assert.ok(JSON.stringify(profile).includes(inside.secrets[0]))
  const outProfile = await h.api(`people/${b0.person}`, who.cookie)
  assert.deepEqual(outProfile.facets, ['directory'], 'An out-of-location record is the directory projection only')
  await h.api(`people/${formerOut.person}`, who.cookie, undefined, 404)
  await h.api(`cases/${b0.case}`, who.cookie, undefined, 404)
  await h.api(`leave/${requests.b0}`, who.cookie, undefined, 404)
  assert.deepEqual((await h.api(`context/${b0.person}`, who.cookie)).record.facets, ['directory'])
  assert.ok((await h.api(`context/${inside.person}`, who.cookie)).record.facets.includes('private'))
 }
 // Lists, search, counts, reports and exports hold only the level's people.
 const harbourIds = new Set(insiders.map(who => who.person))
 const scopedReport = await h.api('reports', ten[0].cookie)
 assert.equal(scopedReport.scope, 'your scope')
 assert.equal(scopedReport.headcount.total, insiders.length - 1, 'The headcount counts the level\'s active people, the member included')
 assert.deepEqual(scopedReport.headcount.byLocation.map(row => row.group), ['Scope Harbour'])
 assert.ok(scopedReport.compensation, 'Compensation totals need both reports.read and pay.read about the same people')
 const csv = await (await h.raw('/app/exports/employees.csv?scope=organization&fields=name,phone,payAmount', { cookie: ten[0].cookie })).text()
 const exported = new Set(csv.split('\r\n').slice(1).filter(Boolean).map(line => line.split(',')[0].replaceAll('"', '')))
 assert.deepEqual([...exported].sort(), [...harbourIds].sort(), 'The organization export is exactly the level\'s people')
 // Employer-wide doors stay closed to scoped rights.
 for (const path of ['members', 'audit', 'templates', 'custom-fields', 'record-tables', 'payroll', 'levels', 'eeo/report', 'compensation/equity', 'payroll-layout']) await h.api(path, ten[0].cookie, undefined, 403)
 await h.api('level.preview', ten[0].cookie, { kind: 'level', name: 'Escalation', permissions: ['pay.read'] }, 403)
 await h.api('member.permissions', ten[0].cookie, { member: ten[1].member, permissions: ['pay.read'] }, 403)
 assert.equal((await h.raw('/app/access', { cookie: ten[0].cookie })).status, 403, 'A scoped people.manage holder is not a Base administrator')

 // Control members keep exactly their reads with the level assigned.
 const body = async (who, path) => JSON.stringify(await h.api(path, who.cookie))
 assert.ok((await body(c1, `people/${b0.person}`)).includes('PRIVATE-scb0'), 'An owner-set direct grant still reads out-of-location private details')
 assert.ok(!(await body(c1, `people/${b0.person}`)).includes(String(b0.cents)), 'The direct grant carries no pay')
 const manager = await h.api(`people/${b0.person}`, c2.cookie)
 assert.ok(manager.facets.includes('employment') && !JSON.stringify(manager).includes('PRIVATE-scb0') && !JSON.stringify(manager).includes(String(b0.cents)), 'A direct manager keeps manager facets over an out-of-location report')
 assert.ok((await body(c3, `leave/${requests.b1}`)).includes('"status":"pending"'), 'A routed approver reads and decides only that request')
 await h.api(`leave/${requests.b3}`, c3.cookie, undefined, 404)
 assert.ok((await body(c4, `performance/${cycle.id}`)).includes('RELEASE-SCOPE-b2'), 'A released-summary recipient keeps the release')
 assert.ok((await body(c2, `people/${inside.person}`)).includes('PRIVATE-scin'), 'Controls also read in-location people through the level')

 // Reverting the bulk assignment restores the prior levels and ends the scoped reads.
 const revert = await preview({ kind: 'revert', batch: review.id })
 assert.ok(revert.impact.every(item => item.beforeScoped.length === 1 && item.afterScoped.length === 0))
 await apply(revert)
 assert.deepEqual(assigned(await api('levels')), before, 'Revert restores every prior assigned level')
 for (const who of batchMembers) assert.deepEqual((await h.api('me', who.cookie)).scoped, [], 'The reverted level reaches nobody')
 assert.ok(!JSON.stringify(await h.api(`people/${inside.person}`, ten[0].cookie)).includes('PRIVATE-scin'), 'Reverted members read nothing beyond the directory')
 assert.deepEqual((await h.api('me', ten[5].cookie)).permissions, ['it.tasks'], 'The prior level returns')
 assert.deepEqual((await h.api('me', c1.cookie)).permissions, ['people.private'], 'The direct grant survives')
 const second = await preview({ kind: 'bulk-assignment', members: ids, levels: [level.id] })
 await apply(second)

 // Scoped writes and decisions apply only to people in scope and are rechecked inside the write.
 const target = await api(`people/${inside.person}`)
 const fields = { person: inside.person, revision: target.revision, private: 'yes', personal_email: 'inside@example.org', phone: 'PRIVATE-scin-updated', address: 'Scope address', date_of_birth: '1990-01-02', emergency_contact: 'Scope contact' }
 const outsideTarget = await api(`people/${b3.person}`)
 await h.api('person.update', ten[1].cookie, { ...fields, person: b3.person, revision: outsideTarget.revision }, 403)
 await h.api('person.update', ten[1].cookie, fields)
 assert.equal((await api(`people/${inside.person}`)).private.phone, 'PRIVATE-scin-updated')
 await h.api('leave.decide', ten[2].cookie, { request: requests.b3, decision: 'approve' }, 404)
 await h.api('leave.decide', ten[2].cookie, { request: requests.inside, decision: 'approve' })
 assert.equal((await api(`leave/${requests.inside}`)).status, 'approved')
 await h.api('leave.cancel', ten[3].cookie, { request: requests.b3, note: 'x' }, 404)
 await h.api('leave.cancel', ten[3].cookie, { request: requests.inside, note: 'Scoped cancellation' })
 const definition = { name: 'Scope people', columns: ['name', 'location', 'employeeNumber', 'phone', 'payAmount'], asOf: 'today', status: 'all' }
 const saved = await h.api('report.save', ten[0].cookie, { definition })
 const custom = await h.api(`custom-reports/${saved.id}`, ten[0].cookie)
 assert.deepEqual(custom.result.rows.map(row => row.personId).sort(), [...harbourIds].sort(), 'A custom report holds only the level\'s people')
 assert.equal(custom.result.scope, 'scoped people')

 return { level, ten, inside, b0, harbour, hills, setZone, make, api, preview, apply }
}

/** A transfer changes access on its effective date, next request, with no edit or fresh sign-in. */
export async function transferProof(h, ctx) {
 const { level, ten, harbour, hills, setZone, make, api, preview, apply } = ctx
 const west = 'Etc/GMT+12', east = 'Pacific/Kiritimati', effective = after(stamp(west), 1)
 const leaving = await make('t0'), joining = await make('t1', { location: hills })
 await api('mover.schedule', { period: leaving.period, effectiveFrom: effective, locationId: hills, reason: 'Moves out of Harbour' })
 await api('mover.schedule', { period: joining.period, effectiveFrom: effective, locationId: harbour, reason: 'Moves into Harbour' })
 const reader = ten[1]
 const sees = async who => JSON.stringify(await h.api(`people/${who.person}`, reader.cookie)).includes(who.secrets[0])
 await setZone(west)
 assert.equal(stamp(west) < effective, true)
 assert.equal(await sees(leaving), true, 'Before the effective date the person is still in the location')
 assert.equal(await sees(joining), false, 'Before the effective date the incoming person is not yet in scope')
 await setZone(east)
 assert.equal(stamp(east) >= effective, true)
 assert.equal(await sees(leaving), false, 'On the effective date access ends with no edit or fresh sign-in')
 assert.equal(await sees(joining), true, 'On the effective date access begins on the next request')
 const dated = await h.api(`people/${leaving.person}?asOf=${after(effective, -1)}`, reader.cookie)
 assert.ok(!JSON.stringify(dated).includes(leaving.secrets[0]), 'Viewing a past date restores no access')
 assert.deepEqual((await h.api('me', reader.cookie)).scoped[0].permissions.length, 6, 'The member\'s level was never edited')
 await setZone('UTC')
}
