import type { Bindings } from './auth.server'
import { PERMISSIONS, ensureMember, type Actor } from './willow/actor'
import { all, one, stmt } from './willow/core'
import { addDays } from './willow/dates'
import { configureEmployer, createCategory, createDepartment, createLocation, createSchedule } from './willow/employer'
import { Input } from './willow/input'
import { approveOpening, approvePolicy, createPolicy, decideLeave, openAccount, requestLeave } from './willow/leave'
import { completeCase, completeTask, createTemplate, scheduleMover, startJoiner, startLeaver } from './willow/lifecycle'
import { addDocument } from './willow/documents'
import { previewTemplate, publishTemplate } from './willow/workflow-review'
import { acknowledgeBatch, createBatch, CSV_COLUMNS, exportBatch } from './willow/payroll'
import { configureLayout, previewPayroll } from './willow/payroll-layout'
import { propose } from './willow/proposals'
import { approveWorkPolicy } from './willow/work'

/** Invented people from tests/willow/fixtures.mjs, expanded into native records.
 * No fixture parser or test dependency ships in the app. Each stage can resume. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
 const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
 const member = await ensureMember(env, ownerEmail, 'Rowan Hale')
 const actor: Actor = { id: member.id, sessionId: 'demo-seed', email: ownerEmail, name: 'Rowan Hale', owner: true, permissions: new Set(PERMISSIONS), personId: null, reports: new Set(), today: date }
 const input = Input.of
 const stage = async (name: string, run: () => Promise<void>) => {
  if (await one(env, 'SELECT 1 FROM rer_demo WHERE name = ?', `willow:${name}`)) return
  await run()
  await stmt(env, 'INSERT OR IGNORE INTO rer_demo(name,value) VALUES (?,?)', `willow:${name}`, date).run()
 }
 const named = async (table: string, name: string, create: () => Promise<{id: string}>) =>
  (await one<{id: string}>(env, `SELECT id FROM ${table} WHERE name = ?`, name)) ?? await create()
 await stage('employer', async () => { await configureEmployer(env, actor, input({ name: 'Harbor & Field', timezone: 'America/Chicago', country: 'US', currency: 'USD' })) })
 const austin = await named('wl_locations', 'Austin studio', () => createLocation(env, actor, input({ name: 'Austin studio', timezone: 'America/Chicago' })))
 const denver = await named('wl_locations', 'Denver workshop', () => createLocation(env, actor, input({ name: 'Denver workshop', timezone: 'America/Denver' })))
 const departments: {id: string}[] = []
 for (const name of ['Operations', 'Customer care', 'Design', 'People & Finance']) departments.push(await named('wl_departments', name, () => createDepartment(env, actor, input({ name }))))
 const week = await named('wl_schedules', 'Full week · 40 hours', () => createSchedule(env, actor, input({ name: 'Full week · 40 hours', mon: '8', tue: '8', wed: '8', thu: '8', fri: '8' })))
 const part = await named('wl_schedules', 'Four days · 32 hours', () => createSchedule(env, actor, input({ name: 'Four days · 32 hours', mon: '8', tue: '8', wed: '8', thu: '8' })))
 const category = await named('wl_doc_categories', 'Welcome & working together', () => createCategory(env, actor, input({ name: 'Welcome & working together', subjectReads: true, managerReads: true, acknowledgement: true })))
 const template = async (kind: string, name: string, titles: string[], assignees: string[]) => {
  const record = await named('wl_templates', name, () => createTemplate(env, actor, input({ kind, name, requiredFields: [], taskTitle: titles, taskAssignee: assignees, taskDueDays: titles.map((_, i) => String(i - 3)), taskEvidence: titles.map(() => 'yes') })))
  const state = await one<{publication: string}>(env, 'SELECT publication FROM wl_templates WHERE id = ?', record.id)
  if (state?.publication === 'draft') {
   const review = await previewTemplate(env, actor, input({ template: record.id }))
   await publishTemplate(env, actor, input({ review: review.id }))
  }
  return record
 }
 const joiner = await template('joiner', 'A thoughtful first week', ['Prepare welcome pack', 'Prepare laptop and workspace', 'Check payroll details'], ['hr', 'it', 'payroll'])
 const mover = await template('mover', 'A smooth team move', ['Confirm new responsibilities', 'Update team and payroll records'], ['hr', 'payroll'])
 const leaver = await template('leaver', 'A considered goodbye', ['Agree the handover plan', 'Arrange equipment return', 'Prepare final payroll handoff'], ['hr', 'it', 'payroll'])
 // Names and roles reuse the valid invented rows in Willow's BambooHR fixtures.
 const people = [
  ['Rowan Hale', 'Operations Lead', 0, -950, '98000'],
  ['Tamsin Vale', 'Support Specialist', 1, -760, '78000'],
  ['Idris Penn', 'Workshop Coordinator', 0, -520, '69000'],
  ['Juno Ashby', 'Finance Partner', 3, -1200, '95000'],
  ['Marlo Quist', 'Product Designer', 2, -360, '88000'],
  ['Ola Bennett', 'Customer Care Lead', 1, -440, '85000'],
  ['Hana Reid', 'People Partner', 3, -620, '92000'],
  ['Samira Patel', 'Operations Coordinator', 0, -210, '74000'],
  ['Lee Park', 'Design Researcher', 2, -120, '82000'],
  ['Kit Morgan', 'Workshop Assistant', 0, -3, '62000'],
  ['Amara Cole', 'Customer Care Specialist', 1, 8, '71000'],
  ['Theo Rivera', 'Designer', 2, 15, '79000'],
 ] as const
 const records: { person: string; period: string; case: string }[] = []
 for (const [i, [name, title, department, offset, salary]] of people.entries()) {
  const email = i === 0 ? ownerEmail : `${name.toLowerCase().replaceAll(' ', '.')}@harbor-field.example`
  const existing = await one<{person: string; period: string; case: string}>(env, `SELECT p.id AS person, e.id AS period, c.id AS "case" FROM wl_people p JOIN wl_periods e ON e.person_id = p.id JOIN wl_cases c ON c.period_id = e.id AND c.kind = 'joiner' WHERE p.work_email = ?`, email)
  const record = existing ?? await startJoiner(env, actor, input({ template: joiner.id, legalName: name, preferredName: i === 1 ? 'Tam' : '', workEmail: email, employeeNumber: `HF-${101 + i}`, startDate: addDays(date, offset), employmentType: i === 1 ? 'part_time' : 'full_time', payrollId: `PAY-${101 + i}`, jobTitle: title, departmentId: departments[department].id, locationId: i === 2 || i === 9 ? denver.id : austin.id, managerPersonId: i ? records[0].person : '', scheduleId: i === 1 ? part.id : week.id, payBasis: 'salary', payAmount: salary, reason: 'Initial employment terms' }))
  records.push(record)
  // Kit Morgan started this week: the welcome pack and payroll check are done, but the
  // laptop and workspace task is still open past its due date (the In progress exception).
  const recent = i === 9
  if (offset < 0) await stage(`welcome:${i}`, async () => {
   const tasks = await all<{id: string; assignee: string}>(env, "SELECT id, assignee FROM wl_case_tasks WHERE case_id = ? AND status = 'open'", record.case)
   for (const task of tasks.filter(task => !recent || task.assignee !== 'it')) await completeTask(env, actor, input({ task: task.id, evidence: recent ? (task.assignee === 'payroll' ? 'Payroll identifier PAY-110 confirmed in the payroll provider.' : 'Welcome pack sent with the first-week plan.') : 'Sample history: welcome preparation and details checked with the team.' }), new Request(env.AUTH_ORIGIN))
   if (!recent) await completeCase(env, actor, input({ case: record.case }))
  })
 }
 actor.personId = records[0].person
 await stmt(env, 'UPDATE wl_members SET person_id = ? WHERE id = ? AND person_id IS NULL', actor.personId, actor.id).run()
 const policy = await named('wl_leave_policies', 'Paid time off', async () => {
  const version = await createPolicy(env, actor, input({ name: 'Paid time off', summary: 'Sample company policy: four weeks per year, based on the working schedule. Opening balances reviewed by People & Finance.', accrualWeeks: '4', negativeLimitHours: '0' }))
  return { id: version.policy }
 })
 const draft = await one<{id: string}>(env, "SELECT id FROM wl_policy_versions WHERE policy_id = ? AND status = 'draft'", policy.id)
 if (draft) await approvePolicy(env, actor, input({ version: draft.id }))
 for (let i = 0; i < 9; i++) {
  const record = records[i]
  const account = (await one<{id: string}>(env, 'SELECT id FROM wl_leave_accounts WHERE period_id = ? AND policy_id = ?', record.period, policy.id)) ?? await openAccount(env, actor, input({ period: record.period, policy: policy.id, cutoverDate: addDays(date, -30), openingHours: String(84 + i * 6), note: 'Sample opening balance reviewed at the monthly cutover.' }))
  if (await one(env, "SELECT 1 FROM wl_leave_accounts WHERE id = ? AND opening_status = 'proposed'", account.id)) await approveOpening(env, actor, input({ account: account.id }))
  if (i > 0 && i < 5) await stage(`leave:${i}`, async () => {
   const employee = await ensureMember(env, `${people[i][0].toLowerCase().replaceAll(' ', '.')}@harbor-field.example`, people[i][0])
   await stmt(env, 'UPDATE wl_members SET person_id = ? WHERE id = ?', record.person, employee.id).run()
   const requester: Actor = { ...actor, id: employee.id, email: `${people[i][0]}@harbor-field.example`, name: employee.name, owner: false, permissions: new Set(), personId: record.person }
   let start = addDays(date, 7 + i * 7)
   while ([0, 6].includes(new Date(start + 'T00:00:00Z').getUTCDay()) || i === 1 && new Date(start + 'T00:00:00Z').getUTCDay() === 5) start = addDays(start, 1)
   const leave = await requestLeave(env, requester, input({ account: account.id, startDate: start, endDate: addDays(start, 1), reason: i === 1 ? 'Family weekend away' : 'A few days to recharge' }))
   if (i > 2) await decideLeave(env, actor, input({ request: leave.id, decision: 'approve', note: 'Team coverage confirmed.' }))
  })
 }
 await stage('move', async () => { await scheduleMover(env, actor, input({ person: records[7].person, period: records[7].period, effectiveFrom: addDays(date, 14), jobTitle: 'Senior Operations Coordinator', reason: 'Taking on workshop scheduling', template: mover.id })) })
 await stage('departure', async () => { await startLeaver(env, actor, input({ person: records[8].person, period: records[8].period, endDate: addDays(date, 28), reason: 'Moving to a new opportunity', template: leaver.id })) })
 await stage('documents', async () => {
  for (const i of [0, 1, 9, 10]) await addDocument(env, actor, input({ person: records[i].person, category: category.id, title: 'Your first week at Harbor & Field', file: { filename: 'welcome.txt', base64: btoa('Welcome to Harbor & Field.\nMonday: meet your team and settle into your workspace.\nTuesday: customer care and workshop walkthrough.\nFriday: check in with Rowan about your first week.\nThis is an invented sample document for the Willow demo.') } }))
 })
 await stage('proposal', async () => { await propose(env, actor, input({ kind: 'joiner', summary: 'Prepare a new customer care starter for next month', agent: 'People planning assistant', plan: { template: joiner.id, legalName: 'Nia Lawson', workEmail: 'nia.lawson@harbor-field.example', startDate: addDays(date, 32), employmentType: 'full_time', jobTitle: 'Customer Care Specialist', departmentId: departments[1].id, locationId: austin.id, scheduleId: week.id, managerPersonId: records[0].person } })) })
 await stage('reminders', async () => { await approveWorkPolicy(env, actor, input({ offsets: '0, 2, 5', quietStart: '20', quietEnd: '8', defaultDays: '1' })) })
 await stage('payroll-layout', async () => {
  await configureLayout(env, actor, input({ format: 'generic', columns: CSV_COLUMNS.map(source => ({ source, heading: source })) }))
 })
 await stage('payroll-history', async () => {
  const batch = await createBatch(env, actor, input({ periodStart: addDays(date, -30), periodEnd: addDays(date, -1) }))
  const preview = await previewPayroll(env, actor, input({ batch: batch.id }))
  await exportBatch(env, actor, input({ batch: batch.id, previewRevision: preview.previewRevision }))
  await acknowledgeBatch(env, actor, input({ batch: batch.id, reference: 'HF-PAY-previous-month', note: 'Sample history: prior employment changes handed off and acknowledged by payroll.' }))
 })
 await stage('payroll', async () => {
  const batch = await createBatch(env, actor, input({ periodStart: date, periodEnd: addDays(date, 14) }))
  await previewPayroll(env, actor, input({ batch: batch.id }))
 })
 await stmt(env, 'INSERT OR IGNORE INTO oa_first_run(singleton,completed_by,completed_at) SELECT 1,id,? FROM oa_operators WHERE email = ?', now.getTime(), ownerEmail).run()
}
