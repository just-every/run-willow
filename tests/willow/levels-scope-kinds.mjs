// ROLE-002: every scope kind reaches exactly its people through the person door; invalid scopes are refused.
import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'

export async function scopeKindsProof(h, owner, fx) {
 const { join } = fx
 const api = (path, body, status) => h.api(path, owner, body, status)
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 let invites = 0
 // Each invitation comes from its own client address so the per-address invitation limit never throttles the fixture.
 const invite = async person => { const response = await h.raw('/api/willow/access.give', { cookie: owner, body: { person }, ip: `10.6.9.${++invites}` }); assert.equal(response.status, 200, await response.clone().text()); return response.json() }
 const place = async name => (await api('location.create', { name, timezone: 'UTC' })).id
 const dept = async name => (await api('department.create', { name })).id
 const [A, B, C] = [await place('Kinds A'), await place('Kinds B'), await place('Kinds C')]
 const [D1, D2, D3] = [await dept('Kinds one'), await dept('Kinds two'), await dept('Kinds three')]
 const division = async name => (await api('division.create', { name })).id
 const [DX, DY] = [await division('Kinds division X'), await division('Kinds division Y')]
 const entity = async name => (await api('entity.create', { name })).id
 const [E1, E2] = [await entity('Kinds Pty One'), await entity('Kinds Pty Two')]
 await api('department.division', { department: D1, division: DX })
 await api('department.division', { department: D2, division: DY })
 const field = (key, classification) => ({ key, classification, type: 'text', validation: { minLength: 2, maxLength: 12 }, effectiveFrom: day(-60), label: key.replaceAll('_', ' '), required: false, employeeRead: false, managerRead: false, retired: false })
 const costCentre = (await api('customField.define', { definition: field('kinds_centre', 'general') })).id
 const restricted = [(await api('customField.define', { definition: field('kinds_hr', 'hr') })).id, (await api('customField.define', { definition: field('kinds_pay', 'payroll') })).id]
 const people = {}
 const rows = [
  ['boss', A, D1, 'full_time', 'CC-1', null], ['m1', A, D1, 'full_time', 'CC-9', 'boss'], ['m2', B, D2, 'part_time', 'CC-1', 'boss'],
  ['l1', A, D2, 'casual', 'CC-9', 'm1'], ['l2', B, D1, 'full_time', 'CC-2', 'm1'], ['l3', B, D2, 'fixed_term', 'CC-9', 'm2'],
  ['x1', A, D2, 'part_time', 'CC-2', null], ['x2', B, D1, 'casual', 'CC-9', null],
 ]
 for (const [key, locationId, departmentId, employmentType, centre, manager] of rows) {
  people[key] = await join(`kd${key}`, { locationId, departmentId, employmentType, jobTitle: 'Kinds role', phone: `PRIVATE-kd${key}`, ...(manager ? { managerPersonId: people[manager].person } : {}) })
  await api('customField.write', { person: people[key].person, effectiveFrom: day(-30), values: { kinds_centre: centre } })
 }
 for (const [key, id] of [['boss', E1], ['m1', E1], ['l1', E1], ['x1', E1], ['m2', E2], ['l2', E2], ['x2', E2]]) await api('period.entity', { period: people[key].period, entity: id })
 assert.equal((await api(`people/${people.boss.person}`)).employment[0].legalEntity.name, 'Kinds Pty One', 'The employment record names the legal entity')
 assert.equal((await api(`people/${people.boss.person}`)).employment[0].terms[0].division.name, 'Kinds division X')
 let readers = 0
 const reader = async key => {
  const person = await join(`kr${key}`, { locationId: C, departmentId: D3, employmentType: 'full_time', jobTitle: 'Kinds reader', phone: `PRIVATE-kr${key}` })
  const member = await invite(person.person)
  return { ...person, member: member.id, cookie: await h.signIn(`kr${key}@example.com`, { requested: true, ip: `10.3.0.${++readers}` }) }
 }
 const everyone = Object.keys(people)
 const permissions = ['people.manage', 'people.private', 'pay.read', 'documents.private', 'leave.manage', 'reports.read']
 const give = async (who, scope, name, rights = permissions) => {
  const level = await apply({ kind: 'level', name, permissions: rights, scope })
  await apply({ kind: 'assignment', member: who.member, levels: [level.id] })
  return level
 }
 const reads = async (who, expected, label) => {
  const me = await h.api('me', who.cookie)
  assert.deepEqual(me.permissions, [], `${label}: scoped rights are not employer-wide`)
  assert.equal(me.scoped[0].people, expected.length, `${label}: reach`)
  // The export and the agent context use the same reach as the person page.
  const csv = await (await h.raw('/app/exports/employees.csv?scope=organization&fields=name,phone', { cookie: who.cookie })).text()
  const exported = csv.split('\r\n').slice(1).filter(Boolean).map(line => line.split(',')[0].replaceAll('"', ''))
  assert.deepEqual(exported.sort(), expected.map(key => people[key].person).sort(), `${label}: export`)
  for (const key of everyone) {
   if (people[key].person === who.person) continue
   const record = JSON.stringify(await h.api(`people/${people[key].person}`, who.cookie))
   assert.equal(record.includes(`PRIVATE-kd${key}`), expected.includes(key), `${label}: ${key} ${expected.includes(key) ? 'is' : 'is not'} in scope`)
   assert.equal(JSON.stringify(await h.api(`context/${people[key].person}`, who.cookie)).includes(`PRIVATE-kd${key}`), expected.includes(key), `${label}: context of ${key}`)
  }
 }
 const group = dimensions => ({ kind: 'group', dimensions })
 // Direct and indirect reports follow the in-force manager chain, self excluded.
 const boss = { ...people.boss, member: (await invite(people.boss.person)).id }
 boss.cookie = await h.signIn('kdboss@example.com', { requested: true, ip: '10.3.1.1' })
 const direct = await give(boss, { kind: 'direct' }, 'Kinds direct reports')
 await reads(boss, ['m1', 'm2'], 'direct reports')
 assert.ok(JSON.stringify(await h.api(`people/${people.boss.person}`, boss.cookie)).includes('PRIVATE-kdboss'), 'Self stays an about-themselves right')
 const indirect = await give(boss, { kind: 'indirect' }, 'Kinds indirect reports')
 await reads(boss, ['m1', 'm2', 'l1', 'l2', 'l3'], 'direct and indirect reports')
 // A manager change takes effect on its date: l3 moves under x1, out of the boss's chain.
 await api('mover.schedule', { period: people.l3.period, effectiveFrom: day(0), managerPersonId: people.x1.person, reason: 'Moves team' })
 await reads(boss, ['m1', 'm2', 'l1', 'l2'], 'a transferred report')
 // Group scopes: one dimension, OR within it, AND across dimensions.
 const cases = [
  ['department', group({ department: [D1] }), ['boss', 'm1', 'l2', 'x2']],
  ['employment type', group({ employment_type: ['part_time', 'casual'] }), ['m2', 'l1', 'x1', 'x2']],
  ['custom field', group({ [`field:${costCentre}`]: ['CC-9'] }), ['m1', 'l1', 'l3', 'x2']],
  ['location and department', group({ location: [A], department: [D2] }), ['l1', 'x1']],
  ['location or location, and type', group({ location: [A, B], employment_type: ['casual'] }), ['l1', 'x2']],
  ['division', group({ division: [DX] }), ['boss', 'm1', 'l2', 'x2']],
  ['legal entity', group({ legal_entity: [E1] }), ['boss', 'm1', 'l1', 'x1']],
  ['division and legal entity', group({ division: [DY], legal_entity: [E1] }), ['l1', 'x1']],
  ['division or division, and entity', group({ division: [DX, DY], legal_entity: [E2] }), ['m2', 'l2', 'x2']],
  ['department, type and field', group({ department: [D1, D2], employment_type: ['full_time'], [`field:${costCentre}`]: ['CC-1', 'CC-2'] }), ['boss', 'l2']],
 ]
 for (const [index, [name, scope, expected]] of cases.entries()) {
  const who = await reader(`c${index}`)
  await give(who, scope, `Kinds ${name}`)
  await reads(who, expected, name)
 }
 // Division follows the dated department: a transfer moves a person between divisions on its effective date.
 const divisionReader = await reader('divx'), divisionOther = await reader('divy')
 await give(divisionReader, group({ division: [DX] }), 'Kinds division reader X')
 await give(divisionOther, group({ division: [DY] }), 'Kinds division reader Y')
 await api('mover.schedule', { period: people.x1.period, effectiveFrom: day(0), departmentId: D1, reason: 'Moves division' })
 await reads(divisionReader, ['boss', 'm1', 'l2', 'x2', 'x1'], 'division after a transfer')
 await reads(divisionOther, ['m2', 'l1', 'l3'], 'division left by a transfer')
 // Restructuring a department moves everyone in it on the next request; clearing the division ends the reach.
 await api('department.division', { department: D2, division: DX })
 await reads(divisionReader, ['boss', 'm1', 'l2', 'x2', 'x1', 'm2', 'l1', 'l3'], 'a restructured department')
 await api('department.division', { department: D2 })
 await reads(divisionOther, [], 'a department without a division')
 await api('department.division', { department: D2, division: DY })
 await api('department.division', { department: 'missing', division: DY }, 404)
 await api('period.entity', { period: people.l3.period, entity: 'missing' }, 404)
 const configured = await api('settings')
 assert.ok(configured.divisions.length === 2 && configured.legalEntities.length === 2 && configured.departments.find(row => row.id === D1).divisionId === DX)
 // Group membership follows effective-dated custom-field values: a scheduled change moves no one today.
 const dated = await reader('dated')
 await give(dated, group({ [`field:${costCentre}`]: ['CC-9'] }), 'Kinds dated field')
 await api('customField.write', { person: people.l3.person, effectiveFrom: day(3), values: { kinds_centre: 'CC-1' } })
 await reads(dated, ['m1', 'l1', 'l3', 'x2'], 'a scheduled field value')
 // Invalid scopes are refused before any review exists.
 const refuse = (scope, name = 'Kinds refused', permissionsList = permissions) => api('level.preview', { kind: 'level', name, permissions: permissionsList, scope }, 400)
 assert.equal((await refuse(group({}))).error, 'empty_scope')
 assert.equal((await refuse(group({ location: [] }))).error, 'empty_scope')
 assert.equal((await refuse(group({ location: ['missing'] }))).error, 'unknown_scope_location')
 assert.equal((await refuse(group({ department: ['missing'] }))).error, 'unknown_scope_department')
 assert.equal((await refuse(group({ employment_type: ['permanent'] }))).error, 'unknown_scope_employment_type')
 assert.equal((await refuse(group({ [`field:${restricted[0]}`]: ['x1'] }))).error, 'scope_field_restricted')
 assert.equal((await refuse(group({ [`field:${restricted[1]}`]: ['x1'] }))).error, 'scope_field_restricted')
 assert.equal((await refuse(group({ [`field:missing`]: ['x1'] }))).error, 'unknown_scope_field')
 assert.equal((await refuse(group({ division: ['missing'] }))).error, 'unknown_scope_division')
 assert.equal((await refuse(group({ legal_entity: ['missing'] }))).error, 'unknown_scope_legal_entity')
 assert.equal((await refuse(group({ region: ['x'] }))).error, 'unknown_scope_dimension')
 assert.equal((await refuse({ kind: 'direct' }, 'Kinds refused', ['payroll.handoff'])).error, 'scope_unsupported_permission')
 assert.equal((await refuse({ kind: 'direct', dimensions: { location: [A] } })).error, 'invalid_scope')
 assert.equal((await refuse({ kind: 'everywhere' })).error, 'invalid_scope')
 // Every level that existed before scopes migrated to everyone, so no effective right changed.
 const levels = (await api('levels')).levels
 const added = new Set(levels.filter(level => level.name.startsWith('Kinds ')).map(level => level.id))
 assert.ok(levels.filter(level => !added.has(level.id) && !['Harbour reader'].includes(level.name)).every(level => level.scope.kind === 'everyone'))
 assert.ok(levels.filter(level => ['Employee', 'Manager', 'HR administrator', 'Payroll administrator', 'IT'].includes(level.name)).every(level => level.scope.kind === 'everyone'))
 assert.deepEqual(levels.find(level => level.name === 'Manager').permissions, [], 'The built-in Manager keeps its direct-report boundary by dated reports, not a permission')
 // Editing a level's scope is reviewed, versioned and applies on the next request.
 const spare = await reader('widen')
 const widen = await give(spare, { kind: 'direct' }, 'Kinds widen', ['people.private'])
 const edit = await api('level.preview', { kind: 'level', level: widen.id, name: 'Kinds widen', permissions: ['people.private'], scope: { kind: 'everyone' } })
 assert.equal(edit.impact[0].added.join(), 'people.private', 'Widening to everyone is shown as an added employer-wide permission')
 assert.equal(edit.impact[0].beforeScoped.length, 1)
 await api('level.apply', { review: edit.id })
 assert.deepEqual((await h.api('me', spare.cookie)).permissions, ['people.private'], 'The edited scope applies on the next request, in the same session')
 assert.ok((await api('levels')).levels.find(level => level.id === widen.id).version > 1)
 void direct; void indirect
 return { people, reader, give, group }
}
