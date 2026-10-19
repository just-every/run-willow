// PEOPLE-004: date alerts on the production Worker, its scheduler (advanced by
// scheduled time, then a real Worker restart), JSON/page/work doors; mail is the network-edge fake.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harness } from './harness.mjs'
import { fixture, today, day } from './regression-fixture.mjs'
import { browserEvidence } from './date-alerts-browser.mjs'

const directory = await mkdtemp(join(tmpdir(), 'willow-dates-'))
const messages = []
const provider = async request => {
  const body = await request.json()
  if (body.subject === 'Willow: an employee date needs attention') messages.push(body)
  return new Response(null, { status: 202 })
}
let h = await harness({ scheduled: true, persistTo: directory, provider })
const tick = async date => {
  const response = await h.raw(`/cdn-cgi/local/scheduled?time=${Date.parse(`${date}T09:00:00Z`)}&cron=${encodeURIComponent('*/15 * * * *')}&format=json`)
  assert.equal(response.status, 200, await response.text())
}
try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'Olive Owner' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })
  const f = await fixture(h, owner), s = f.staff, api = f.api
  const as = (who, path, body, status) => h.api(path, s[who].cookie, body, status)
  await api('connections.notices', { enabled: true })
  const field = (key, classification, extra = {}) => as('hr', 'customField.define', { definition: { key, classification, type: 'date', validation: {}, effectiveFrom: day(-60), label: key.replaceAll('_', ' '), required: false, employeeRead: false, managerRead: false, retired: false, ...extra } })
  await field('visa_expiry', 'hr', { label: 'Visa expiry' })
  await field('i9_reverification', 'hr', { label: 'I-9 reverification' })
  await field('probation_end', 'general', { label: 'Probation end', managerRead: true })
  const employee = s.employee.person, other = s.invited.person
  await as('hr', 'customField.write', { person: employee, effectiveFrom: day(-1), values: { visa_expiry: day(40), i9_reverification: day(25), probation_end: day(20) } })
  await as('hr', 'customField.write', { person: other, effectiveFrom: day(-1), values: { probation_end: day(12) } })
  await as('hr', 'recordRow.write', { person: employee, table: 'certifications', effectiveFrom: day(-1), values: { name: 'Forklift license', issuer: 'State board', number: 'FL-1', issued_on: day(-300), expires_on: day(15) } })

  await as('managera', 'dateAlert.define', { source: 'custom:visa_expiry', leadDays: ['30, 7'], recipients: ['hr'], channels: ['in_app'] }, 403)
  await as('hr', 'dateAlert.define', { source: 'custom:missing', leadDays: ['7'], recipients: ['hr'], channels: ['in_app'] }, 404)
  await as('hr', 'dateAlert.define', { source: 'custom:visa_expiry', leadDays: ['30, 7'], recipients: ['hr', 'manager'], channels: ['in_app', 'email'] })
  await as('hr', 'dateAlert.define', { source: 'custom:probation_end', leadDays: ['14', '3'], recipients: ['manager', 'hr'], channels: ['in_app'], taskTitle: 'Probation review', taskAssignee: 'manager' })
  await as('hr', 'dateAlert.define', { source: 'custom:i9_reverification', leadDays: ['30, 7'], recipients: ['hr', 'manager'], channels: ['in_app'] })
  const certificate = await as('hr', 'dateAlert.define', { source: 'table:certifications.expires_on', leadDays: ['10, 2'], recipients: ['employee'], channels: ['in_app'] })

  const alerts = async who => (await as(who, 'upcoming-dates')).alerts
  const count = async (who, label) => (await alerts(who)).filter(a => a.label === label && a.person.id === employee).length

  await tick(today)
  assert.deepEqual((await alerts('hr')).filter(a => a.person.id === employee).map(a => [a.label, a.leadDays]), [['I-9 reverification', 30]], 'the I-9 date is already inside its 30-day lead')
  assert.equal((await alerts('hr')).filter(a => a.person.id === other).length, 1, 'the other person’s probation is inside its 14-day lead')
  // The other person leaves today; their later 3-day lead never fires.
  await api('leaver.start', { period: s.invited.period, template: f.templates.leaver, endDate: today, reason: 'Fixed term' })
  const hrUpcoming = (await as('hr', 'upcoming-dates')).upcoming.find(u => u.label === 'I-9 reverification')
  assert.deepEqual([hrUpcoming.person.id, hrUpcoming.owner, hrUpcoming.dueDate], [employee, 'HR', day(25)], 'the upcoming list shows the I-9 date with its owner and due date')
  const managerView = await as('managera', 'upcoming-dates')
  assert.ok(!managerView.upcoming.some(u => u.label !== 'Probation end') && !managerView.alerts.length, 'a manager without the restricted fields sees neither the date nor its alert')

  await tick(day(10))
  assert.equal(await count('hr', 'Visa expiry'), 1)
  assert.equal(await count('hr', 'Probation end'), 1)
  assert.deepEqual((await alerts('managera')).map(a => a.label), ['Probation end'], 'the manager receives only the probation alert')
  assert.deepEqual((await as('managera', 'upcoming-dates')).tasks.map(t => [t.title, t.person.id, t.dueDate]), [['Probation review', employee, day(20)]])
  assert.ok((await as('managera', 'work')).items.some(i => i.kind === 'date-alert-task'), 'the review task is FLOW-002 work')
  await as('hr', 'dateAlert.task', { task: (await as('managera', 'upcoming-dates')).tasks[0].id, evidence: 'x' }, 404)
  assert.deepEqual((await alerts('employee')).map(a => [a.label, a.leadDays]), [['Certifications and licenses: Expires on', 10]])
  assert.equal((await alerts('hr')).filter(a => a.person.id === other).length, 1, 'a person who has left gets no further alerts')

  // A real Worker restart and a repeated tick deliver nothing twice.
  const vars = { ...h.vars }, port = Number(new URL(h.origin).port)
  await h.close(); h = await harness({ scheduled: true, persistTo: directory, provider, port, bindings: vars })
  await tick(day(10))
  assert.equal(await count('hr', 'Visa expiry'), 1)
  assert.equal(await count('managera', 'Probation end'), 1)

  // Retired alerts and moved dates stop firing; the earlier review task closes.
  await as('hr', 'dateAlert.retire', { alert: certificate.id })
  await as('hr', 'customField.write', { person: employee, effectiveFrom: day(-1), values: { probation_end: day(40) } })
  await tick(day(13))
  await tick(day(17))
  assert.equal((await alerts('employee')).length, 1, 'the retired certificate alert does not fire its 2-day lead')
  assert.equal(await count('managera', 'Probation end'), 1, 'the moved probation date does not fire the old 3-day lead')
  assert.deepEqual((await as('managera', 'upcoming-dates')).tasks, [])

  await tick(day(18))
  await tick(day(33))
  assert.deepEqual((await alerts('hr')).filter(a => a.person.id === employee && a.label !== 'Probation end').map(a => [a.label, a.leadDays]).sort(), [['I-9 reverification', 30], ['I-9 reverification', 7], ['Visa expiry', 30], ['Visa expiry', 7]], 'HR receives each restricted alert once per lead time')
  assert.ok(!(await alerts('managera')).some(a => a.label !== 'Probation end'))
  const mailed = messages.flatMap(m => m.personalizations.flatMap(p => p.to.map(t => t.email)))
  assert.deepEqual([...new Set(mailed)].sort(), ['hr@example.com', 'owner@example.com'], 'visa email reaches HR holders only')
  assert.equal(mailed.length, 4)
  for (const m of messages) for (const part of m.content) assert.ok(!part.value.includes(day(40)) && !/visa/i.test(part.value), 'no notice carries the field or its value')
  const page = await (await h.raw('/app/dates', { cookie: s.hr.cookie })).text()
  assert.ok(page.includes('Upcoming dates') && page.includes('Visa expiry'))
  assert.ok(!(await (await h.raw('/app/dates', { cookie: s.managera.cookie })).text()).includes(day(40)))
  // Upcoming dates as HR configures them through the page form.
  const saved = await h.submit('dateAlert.define', s.hr.cookie, { source: 'start', leadDays: '30', recipients: ['hr'], channels: ['in_app'] }, '/app/dates')
  assert.ok(!saved.searchParams.has('error'))
  await browserEvidence(h, s)
  console.log('PEOPLE-004 date alerts: passed')
} finally { await h.close(); await rm(directory, { recursive: true, force: true }) }
