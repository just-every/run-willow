import assert from 'node:assert/strict'
import { publishTemplate } from './publish-template.mjs'

// Real records for the shipped detail pages, created through public actions.
export async function openAreaFixtures(h, { owner, employees, today, day }) {
  const api = (path, data) => h.api(path, undefined, data)
  const employee = employees[0], colleague = employees[46]
  const member = (await api('members')).find(member => member.id === owner.id)
  assert.ok(member?.email, 'Local owner has a readable member email')
  const person = await api(`people/${employee.person}`)
  await api('person.update', {
    person: employee.person, revision: person.revision, legalName: person.legalName,
    preferredName: person.preferredName, employeeNumber: person.employeeNumber, workEmail: member.email,
  })
  const access = await api('access.give', { person: employee.person })
  assert.equal(access.id, owner.id, 'Public access action links the existing local owner')

  const performance = await api('performance.cycle', {
    name: 'Annual development review', dueDate: day(20), people: [employee.person, colleague.person],
    questions: { self: ['Which delivery demonstrates your progress?'], peer: ['Which collaboration helped the team?'], manager: ['Which agreed outcome was delivered?'] },
  })
  const assignment = await api('performance.assign', { cycle: performance.id, person: employee.person, member: owner.id, role: 'self', dueDate: day(20) })
  await api('performance.respond', { assignment: assignment.id, answers: ['Completed the service handover and documented the team induction checklist.'] })
  const survey = await api('survey.create', {
    name: 'Onboarding check-in', kind: 'onboarding', mode: 'named', members: [owner.id], deliveryDate: today, dueDate: day(7),
    questions: [{ key: 'welcome', label: 'What helped you settle into the team?', type: 'text' }],
  })
  await api('survey.respond', { survey: survey.id, answers: { welcome: 'A clear induction checklist and time with the service team.' } })
  const plan = await api('survey.plan', { survey: survey.id, theme: 'Consistent team onboarding', plan: 'Publish the service induction checklist for all new starters.', ownerMember: owner.id, dueDate: day(14) })
  await api('customField.define', { definition: { key: 'job_level', classification: 'general', label: 'Job level', type: 'text', required: false, effectiveFrom: today, employeeRead: true, managerRead: true, retired: false, validation: { maxLength: 60 } } })
  await api('customField.write', { person: colleague.person, effectiveFrom: today, values: { job_level: 'Service' } })
  const compensation = await api('compensation.cycle', { name: 'Annual merit review', kind: 'merit', effectiveFrom: day(30), budget: '12000' })
  await api('compensation.budget', { cycle: compensation.id })
  await api('compensation.propose', { cycle: compensation.id, person: colleague.person, percent: '3', note: 'Annual merit review following the service delivery handover' })
  const folder = await api('company.folder', { name: 'Employee handbook', audience: { kind: 'everyone', id: null } })
  const sharedFile = await api('company.file', { folder: folder.id, title: 'Team induction checklist', file: { filename: 'induction.txt', base64: Buffer.from('Juniper induction checklist: meet your manager, review your employment record, and complete the team handover.').toString('base64') } })
  const protectedLeave = await api('protected.open', { person: colleague.person, title: 'Reviewed family leave', startDate: today, endDate: day(20), entitlementHours: '24', reviewNote: 'Employer reviewed the applicable leave policy and recorded the agreed entitlement.' })
  await api('protected.absence', { case: protectedLeave.id, startDate: today, endDate: today, hours: '4', note: 'Agreed intermittent family leave' })
  const report = await api('report.save', { definition: { name: 'Current workforce', columns: ['name', 'jobTitle', 'fte'], asOf: today, from: day(-30), to: today, status: 'active' } })
  const selfChange = await api('self.request', { kind: 'legalName', legalName: `${person.legalName} Williams` })
  await api('recordRow.write', { person: colleague.person, table: 'certifications', effectiveFrom: today, values: { name: 'Forklift license', issuer: 'State board', number: 'JF-FL-1047', issued_on: today, expires_on: day(365) } })
  const mover = await publishTemplate(h, undefined, { name: 'Role change follow-up', kind: 'mover', taskTitle: ['Confirm the new role with the team'], taskAssignee: ['hr'], taskDueDays: ['0'] })
  await api('change.chain', { requestType: 'job', template: mover.id, stepRole: ['hr'] })
  const change = await api('change.request', { person: colleague.person, effectiveFrom: day(30), reason: 'Quarterly development review', jobTitle: 'Senior Sales Specialist' })
  return {
    compensationEquity: `/app/compensation/equity?asOf=${today}&level=Service`,
    employeeCsv: '/app/exports/employees.csv?scope=organization&fields=name,jobTitle',
    employeeXlsx: '/app/exports/employees.xlsx?scope=organization&fields=name,jobTitle',
    employeeBundle: '/app/exports/employees.zip?scope=organization&fields=name,jobTitle&history=employment',
    performanceCycle: `/app/performance/${performance.id}`, performanceFile: `/app/performance/${performance.id}.json`,
    survey: `/app/surveys/${survey.id}`, surveyResults: `/app/surveys/${survey.id}/results`, surveyCsv: `/app/surveys/${survey.id}.csv`, surveyPlan: `/app/survey-plans/${plan.id}`,
    compensationCycle: `/app/compensation/${compensation.id}`, companyFile: `/app/company/files/${sharedFile.versionId}`,
    protectedDetail: `/app/protected-leave/${protectedLeave.id}`,
    customReport: `/app/reports/custom/${report.id}`, customReportCsv: `/app/reports/custom/${report.id}.csv`, customReportXlsx: `/app/reports/custom/${report.id}.xlsx`,
    selfChange: `/app/self-changes/${selfChange.id}`, recordReportFile: '/app/reports/tables/certifications.csv', change: `/app/changes/${change.id}`,
  }
}
