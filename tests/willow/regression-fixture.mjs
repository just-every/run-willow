import { publishTemplate } from './publish-template.mjs'

// Invented people created only through Willow's public doors.
export const today = new Date().toISOString().slice(0, 10)
export const day = offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10)
export async function fixture(h, owner) {
  const api = (path, body, status) => h.api(path, owner, body, status)
  await api('employer.configure', { name: 'Recovery example', timezone: 'UTC', country: 'AU', currency: 'AUD' })
  const schedule = (await api('schedule.create', { name: 'Every day', mon: '8', tue: '8', wed: '8', thu: '8', fri: '8', sat: '8', sun: '8' })).id
  const templates = {}
  for (const kind of ['joiner', 'leaver']) templates[kind] = (await publishTemplate(h, owner, { name: kind, kind, taskTitle: ['Record evidence'], taskAssignee: ['hr'], taskDueDays: ['0'] })).id
  let count = 0
  const join = async (key, extra = {}) => api('joiner.start', { template: templates.joiner, legalName: key, workEmail: `${key}@example.com`, startDate: day(-100), employmentType: 'full_time', jobTitle: 'Present role', payrollId: `PAY-${++count}`, scheduleId: schedule, payBasis: 'salary', payAmount: '81234.56', phone: `PRIVATE-${key}`, ...extra })
  const staff = {}
  for (const key of ['managera', 'managerb', 'employee', 'payroll', 'hr', 'ended', 'invited']) {
    const person = await join(key, key === 'employee' ? { managerPersonId: staff.managera.person } : {})
    const member = await api('access.give', { person: person.person })
    staff[key] = { ...person, member: member.id }
    if (key !== 'invited') staff[key].cookie = await h.signIn(`${key}@example.com`, { requested: true })
  }
  for (const [key, permissions] of [['payroll', ['pay.read', 'payroll.handoff']], ['hr', ['people.manage', 'people.private', 'documents.private', 'leave.manage']]]) {
    await api('member.permissions', { member: staff[key].member, permissions })
    staff[key].cookie = await h.signIn(`${key}@example.com`)
  }
  const policy = await api('policy.write', { name: 'Annual', summary: 'Hours from schedule', accrualWeeks: '4', negativeLimitHours: '0' })
  await api('policy.approve', { version: policy.id })
  const account = async period => {
    const opened = await api('account.open', { period, policy: policy.policy, cutoverDate: day(-90), openingHours: '200', note: 'Opening balance' })
    await api('account.approve', { account: opened.id })
    return opened.id
  }
  staff.employee.account = await account(staff.employee.period)
  const category = await api('category.create', { name: 'Subject contract', subjectReads: true })
  const document = await api('document.add', { person: staff.employee.person, category: category.id, title: 'Contract', file: { filename: 'contract.txt', base64: Buffer.from('RESTORED-CONTRACT').toString('base64') } })
  return { api, join, account, staff, templates, schedule, document }
}
