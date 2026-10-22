// EEO-001 on the production Worker: voluntary self-identification in self-service (form version 2
// with the disclosures, version 1 answers kept), the `eeo.individual` compliance door with audited
// reads, HR-recorded categories from employment records, the contractor forms, REPORT-001 parity and
// the privacy matrix across every registered door and the standard export.
import assert from 'node:assert/strict'
import { invitationJourneys } from './eeo-invitations.mjs'
import { API_DOORS, PAGE_DOORS } from '../../src/willow/doors.ts'
import { harness } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'
import { browserEvidence } from './eeo-browser.mjs'

const invitationLinks = new Map()
const h = await harness({provider:async request=>{
 const message=await request.json()
 for(const content of message.content ?? []) {
  const link=content.value.match(/https?:[^\s"<>]+\/(?:preboarding|applicant-self-id)\/[^\s"<>]+/)?.[0]
  if(link) for(const recipient of message.personalizations.flatMap(row=>row.to)) invitationLinks.set(recipient.email,link.replaceAll('&amp;','&'))
 }
 return new Response(null,{status:202})
}})
const MARKER = 'synthetic-willow-eeo-record'
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const f = await fixture(h, owner), s = f.staff, api = f.api
  const as = (who, path, body, status) => h.api(path, who === 'owner' ? owner : s[who].cookie, body, status)
  const get = (who, path, status) => as(who, path, undefined, status)
  const ownerMember = (await get('owner', 'me')).id

  // Two employees open self-identification; one completes it and the other declines.
  const form = await get('employee', 'eeo/self')
  assert.deepEqual([form.form.version, form.form.contractor, form.history.length], [2, false, 0])
  const page = await (await h.raw('/app/eeo/self', { cookie: s.employee.cookie })).text()
  for (const text of ['Answering is voluntary', 'restricted EEO record separate from your personnel file', 'Are you Hispanic or Latino?', 'I do not wish to self-identify']) assert.ok(page.includes(text), text)
  assert.ok(!page.includes('CC-305'), 'no contractor forms for a non-contractor')
  await as('employee', 'eeo.self.write', { person: s.hr.person, hispanic: 'no' }, 400)
  await as('employee', 'eeo.self.write', { races: ['asian'] }, 400)
  await as('employee', 'eeo.self.write', { hispanic: 'no', races: ['asian', 'declined'] }, 400)
  assert.equal((await as('employee', 'eeo.self.write', { hispanic: 'no', races: ['asian'], veteran: 'protected' }, 409)).error, 'contractor_forms_not_offered')
  assert.equal((await as('employee', 'eeo.self.write', { hispanic: 'no', races: ['asian', 'white'], sex: 'nonbinary' })).raceEthnicity, 'two_or_more')
  const first = await as('employee', 'eeo.self.write', { hispanic: 'no', races: ['asian'], sex: 'female' })
  assert.deepEqual([first.formVersion, first.raceEthnicity, first.ruleVersion], [2, 'asian', 'eeo1-component1-2024'])
  const declined = await as('payroll', 'eeo.self.write', { hispanic: 'declined', sex: 'declined' })
  assert.deepEqual([declined.raceEthnicity, declined.sex], ['declined', 'declined'])
  // Change an answer through self-service and inspect its history, newest first.
  await as('employee', 'eeo.self.write', { hispanic: 'yes', sex: 'female' })
  const history = (await get('employee', 'eeo/self')).history
  assert.deepEqual(history.map(v => [v.sequence, v.raceEthnicity]), [[3, 'hispanic_latino'], [2, 'asian'], [1, 'two_or_more']])

  // Individual values need the separate permission: nothing else, not even ownership, implies it.
  const person = s.employee.person
  for (const who of ['hr', 'owner', 'managera', 'employee', 'payroll']) assert.equal((await get(who, `eeo/person/${person}`, 403)).error, 'forbidden')
  assert.equal((await as('hr', 'eeo.grant', { member: s.hr.member, enabled: true }, 403)).error, 'owner_required')
  await as('owner', 'member.permissions', { member: s.managerb.member, permissions: ['reports.read', 'eeo.read'] })
  assert.equal((await get('managerb', `eeo/person/${person}`, 403)).error, 'forbidden', 'the aggregate right does not read individuals')
  assert.ok(!(await get('owner', 'me')).permissions.includes('eeo.individual'))
  for (const level of (await get('owner', 'levels')).levels.filter(row => row.id.startsWith('builtin-') || row.id.startsWith('legacy-'))) assert.ok(!level.permissions.includes('eeo.individual'), `${level.id} does not carry it`)
  await as('owner', 'eeo.grant', { member: s.hr.member, enabled: true })
  const read = await get('hr', `eeo/person/${person}`)
  assert.equal(read.history.length, 3)
  assert.equal(read.filing.raceEthnicity.value, 'hispanic_latino')
  assert.match(read.filing.raceEthnicity.source, /self-identified \(form version 2, \d{4}-\d{2}-\d{2}\)/)
  assert.deepEqual(read.mayRecord, { raceEthnicity: false, sex: false })
  const declinedRead = await get('hr', `eeo/person/${s.payroll.person}`)
  assert.equal(declinedRead.filing.raceEthnicity, null)
  assert.deepEqual(declinedRead.mayRecord, { raceEthnicity: true, sex: true })
  await get('hr', 'eeo/person/not-a-person', 404)
  const audit = await api('audit')
  const reads = audit.filter(e => e.action === 'eeo.individual.read' && e.subject === person && e.actor === s.hr.member)
  assert.equal(reads.length, 1)
  assert.equal(reads[0].detail, '{}', 'the audited read carries reader, subject and time, never values')
  await as('owner', 'eeo.grant', { member: ownerMember, enabled: true })
  await get('owner', `eeo/person/${person}`)
  assert.ok((await get('owner', 'me')).permissions.includes('eeo.individual'), 'the owner may assign it to themselves')
  await as('owner', 'eeo.grant', { member: ownerMember, enabled: false })
  await get('owner', `eeo/person/${person}`, 403)

  // HR-recorded categories: only where the latest answer has no filing category, labelled, immutable, never an overwrite.
  const hrDo = (body, status) => as('hr', 'eeo.record', { ruleVersion: 'eeo1-component1-2024', ...body }, status)
  const payrollPerson = s.payroll.person
  await hrDo({ person, dimension: 'race_ethnicity', category: 'white', employmentRecord: MARKER }, 409)
  await hrDo({ person: payrollPerson, dimension: 'race_ethnicity', category: 'nonbinary', employmentRecord: MARKER }, 400)
  await hrDo({ person: payrollPerson, dimension: 'sex', category: 'female', employmentRecord: MARKER, ruleVersion: 'old' }, 400)
  await hrDo({ person: 'an-applicant-is-not-an-employee', dimension: 'sex', category: 'male', employmentRecord: MARKER }, 404)
  await as('managera', 'eeo.record', { person: payrollPerson, dimension: 'sex', category: 'male', employmentRecord: MARKER, ruleVersion: 'eeo1-component1-2024' }, 403)
  await hrDo({ person: payrollPerson, dimension: 'race_ethnicity', category: 'white', employmentRecord: MARKER })
  await hrDo({ person: payrollPerson, dimension: 'sex', category: 'male', employmentRecord: MARKER })
  const recorded = await get('hr', `eeo/person/${payrollPerson}`)
  assert.equal(recorded.filing.raceEthnicity.value, 'white')
  assert.match(recorded.filing.raceEthnicity.source, /^HR-recorded from employment records/)
  assert.equal(recorded.history[0].raceEthnicity, 'declined', 'the person\'s own answer is untouched')
  assert.equal(recorded.recorded.length, 2)
  assert.equal(recorded.recorded[0].label, 'HR-recorded from employment records')
  const own = await get('payroll', 'eeo/self')
  assert.equal(own.recorded.length, 2)
  assert.ok(!JSON.stringify(own.history).includes(MARKER))
  // A later self-identified answer with a filing category takes precedence; HR can no longer record.
  await as('payroll', 'eeo.self.write', { hispanic: 'no', races: ['black_african_american'], sex: 'male' })
  assert.equal((await get('hr', `eeo/person/${payrollPerson}`)).filing.raceEthnicity.value, 'black_african_american')
  await hrDo({ person: payrollPerson, dimension: 'race_ethnicity', category: 'white', employmentRecord: MARKER }, 409)

  // The contractor setting is the owner's, dated and audited; it brings the veteran invitation and CC-305.
  assert.equal((await as('hr', 'contractor.set', { contractor: true }, 403)).error, 'owner_required')
  await as('owner', 'contractor.set', { contractor: true, covered: false })
  const contractorPage = await (await h.raw('/app/eeo/self', { cookie: s.employee.cookie })).text()
  for (const text of ['Form CC-305', 'OMB Control Number 1250-0005', 'Expires 07/31/2029', 'Traumatic brain injury', 'PUBLIC BURDEN STATEMENT', 'Protected veteran invitation to self-identify', 'Armed Forces service medal veteran', 'I do not wish to self-identify']) assert.ok(contractorPage.includes(text), text)
  await as('employee', 'eeo.self.write', { hispanic: 'no', races: ['asian'], veteranClasses: ['disabled'] }, 400)
  const forms = await as('employee', 'eeo.self.write', { hispanic: 'no', races: ['asian'], sex: 'female', veteran: 'protected', veteranClasses: ['disabled', 'service_medal'], disability: 'declined' })
  assert.deepEqual([forms.veteran, forms.veteranClasses, forms.disability], ['protected', ['disabled', 'service_medal'], 'declined'])
  const withForms = await get('hr', `eeo/person/${person}`)
  assert.deepEqual([withForms.current.veteran, withForms.current.disability], ['protected', 'declined'])
  await as('owner', 'contractor.set', { contractor: false })
  assert.equal((await as('employee', 'eeo.self.write', { hispanic: 'no', races: ['asian'], disability: 'yes' }, 409)).error, 'contractor_forms_not_offered')

  // The diversity aggregate reads both form versions alike and never counts HR-recorded categories.
  const crowd = []
  for (let i = 0; i < 10; i++) {
    const key = `crowd${i}`, joined = await f.join(key)
    await api('access.give', { person: joined.person })
    crowd.push({ ...joined, cookie: await h.signIn(`${key}@example.com`, { requested: true }) })
  }
  const answer = (cookie, body) => h.api('eeo.self.write', cookie, body)
  // 17 people: 12 file white (six on version 1, six on version 2), 5 decline; HR records a category for each decliner.
  const everyone = [...crowd, ...['managera', 'managerb', 'employee', 'payroll', 'hr', 'ended'].map(who => s[who])]
  const invited = { ...s.invited, cookie: await h.signIn('invited@example.com', { requested: true }) }
  everyone.push(invited)
  for (const [index, member] of everyone.entries()) {
    if (index < 6) await answer(member.cookie, { raceEthnicity: 'white', sex: 'female' })
    else if (index < 12) await answer(member.cookie, { hispanic: 'no', races: ['white'], sex: 'female' })
    else await answer(member.cookie, { hispanic: 'declined', sex: 'declined' })
  }
  await as('owner', 'member.permissions', { member: s.hr.member, permissions: ['people.manage', 'people.private', 'documents.private', 'leave.manage', 'reports.read', 'eeo.read', 'eeo.individual'] })
  for (const member of everyone.slice(12)) await hrDo({ person: member.person, dimension: 'race_ethnicity', category: 'asian', employmentRecord: MARKER })
  const report = await get('hr', 'eeo/report')
  assert.equal(report.suppressed, false)
  const count = (rows, category) => rows.find(row => row.category === category).count
  assert.deepEqual([report.total, count(report.raceEthnicity, 'white'), count(report.raceEthnicity, 'declined'), count(report.raceEthnicity, 'asian'), count(report.sex, 'female')], [17, 12, 5, 0, 12])

  // The privacy matrix: no door, for anyone without the permission, returns an answer, its source or the standard export.
  const opening = await as('hr', 'hiring.opening', { name: 'EEO matrix', stages: ['New', 'Hired', 'Rejected'], members: [s.managerb.member] })
  assert.ok(opening.id)
  await as('hr', 'eeo.grant', { member: s.hr.member, enabled: false }, 403)
  const ids = { people: person }
  const fill = (pattern, name) => {
    const base = pattern.replace(/^\^|\$$/g, '').replace(/\\\./g, '.')
    if (name === 'employeeCsv' || name === 'employeeXlsx') return [`${base}?scope=organization&fields=name,phone,payAmount,payrollId`]
    if (name === 'employeeBundle') return [`${base}?scope=organization&fields=name&history=employment,leave,lifecycle,documents`]
    if (name === 'preview') return [`preview?member=${s.managera.member}&person=${person}`]
    return [base.replace('([\\w-]+)', ids.people).replace('([a-z][a-z0-9_]*)', 'certifications')]
  }
  const urls = [...API_DOORS.filter(([, name]) => !['eeoSelf', 'eeoPerson', 'eeoPeople'].includes(name)).flatMap(([pattern, name]) => fill(pattern, name).map(path => `/api/willow/${path}`)),
    ...PAGE_DOORS.filter(([, name]) => !['eeoSelf', 'eeoPerson', 'eeoPeople'].includes(name)).flatMap(([pattern, name]) => fill(pattern, name)), '/app/people', '/app/exports/employees.csv?scope=organization&fields=name,workEmail,jobTitle']
  await as('owner', 'member.permissions', { member: s.hr.member, permissions: ['people.manage', 'people.private', 'documents.private', 'leave.manage', 'reports.read'] })
  assert.ok(urls.length > 100, 'every registered door is crawled')
  const forbiddenKeys = ['"hispanic"', '"races"', '"veteranClasses"', '"employmentRecord"', MARKER, 'hispanic_latino', 'two_or_more']
  const actors = { owner: owner, hr: s.hr.cookie, manager: s.managera.cookie, hiringTeam: s.managerb.cookie, payroll: s.payroll.cookie }
  for (const [who, cookie] of Object.entries(actors)) {
    for (const url of urls) {
      const response = await h.raw(url, { cookie })
      const body = await response.text()
      for (const key of forbiddenKeys) if (!(url.includes('eeo/report') || url.includes('eeo%2Freport')) || !['hispanic_latino', 'two_or_more'].includes(key)) assert.ok(!body.includes(key), `${who} read ${key} through ${url}`)
    }
  }
  for (const who of ['hr', 'owner', 'payroll', 'managera']) assert.ok(!(await (await h.raw('/app/exports/employees.csv?scope=organization&fields=name,workEmail,jobTitle', { cookie: actors[who === 'managera' ? 'manager' : who] })).text()).match(/hispanic|asian|female|declined/i), 'the standard CSV carries no EEO value')

  await as('owner', 'eeo.grant', { member: s.hr.member, enabled: true })
  await as('owner', 'contractor.set', { contractor: true })
  await browserEvidence(h, { employee: s.employee.cookie, hr: s.hr.cookie, owner }, person)
  await invitationJourneys(h,owner,f,invitationLinks)
  console.log('EEO-001 self-identification: passed')
} finally { await h.close() }
