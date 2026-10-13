// The directory, the joiner form and a person's page. The person page renders
// only what personView returned for this member: sections for facets the
// member lacks are absent, not hidden.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all } from '../core'
import { formatDate, hours } from '../dates'
import { settings } from '../employer'
import { policies } from '../leave'
import { templates } from '../lifecycle'
import { EMPLOYMENT_TYPES, PRIVATE_FIELDS, PRIVATE_LABELS } from '../people'
import { directory, personView } from '../profile'
import { area, field, fileField, form, h, hidden, page, person as personName, select, table, tag, type Html } from './html'

const TYPE_LABELS: Record<string, string> = { full_time: 'Full time', part_time: 'Part time', casual: 'Casual', fixed_term: 'Fixed term', unknown: 'Unknown (from import)' }
const money = (pay: { basis: string; amountCents: number | null; currency: string } | null) => pay ? (pay.amountCents === null ? `${pay.basis} (amount unknown)` : `${(pay.amountCents / 100).toFixed(2)} ${pay.currency} ${pay.basis === 'hourly' ? 'per hour' : pay.basis === 'salary' ? 'per year' : ''}`) : '—'

async function choices(env: Bindings, actor: Actor) {
  const [data, people] = await Promise.all([settings(env), directory(env, actor)])
  return {
    departments: data.departments.map(row => ({ value: row.id, label: row.name })),
    locations: data.locations.map(row => ({ value: row.id, label: row.name })),
    schedules: data.schedules.map(row => ({ value: row.id, label: `${row.name} (${hours(row.weeklyMinutes)} h/week)` })),
    categories: data.categories.map(row => ({ value: row.id, label: row.name })),
    people: people.filter(person => person.status !== 'former').map(person => ({ value: person.id, label: person.name })),
  }
}

function termsFields(options: Awaited<ReturnType<typeof choices>>, required: boolean, actor: Actor): Html[] {
  return [
    field('Job title', 'jobTitle', { required }),
    select('Department', 'departmentId', options.departments, '', { required: false, blank: required ? 'None' : 'Unchanged' }),
    select('Location', 'locationId', options.locations, '', { required: false, blank: required ? 'None' : 'Unchanged' }),
    select('Manager', 'managerPersonId', options.people, '', { required: false, blank: required ? 'None' : 'Unchanged' }),
    select('Working schedule', 'scheduleId', options.schedules, '', { required: false, blank: required ? 'None' : 'Unchanged' }),
    ...(can(actor, 'pay.read') ? [select('Pay basis', 'payBasis', [{ value: 'salary', label: 'Salary per year' }, { value: 'hourly', label: 'Hourly rate' }, { value: 'unknown', label: 'Not known yet' }], '', { required: false, blank: required ? 'Not known yet' : 'Unchanged' }), field('Pay amount', 'payAmount', { required: false })] : []),
  ]
}

export async function directoryPage(env: Bindings, actor: Actor, url: URL) {
  const people = await directory(env, actor)
  const manage = can(actor, 'people.manage')
  const joinerTemplates = manage ? (await templates(env)).filter(template => template.kind === 'joiner' && template.status === 'active') : []
  const options = manage ? await choices(env, actor) : null
  const body = h`<h1>People</h1>
<section class="card">${people.length ? table(['Name', 'Role', 'Department', 'Location', 'Manager', 'Status'], people.map(person => [personName(person.name, `/app/people/${person.id}`), person.jobTitle ?? '—', person.department?.name ?? '—', person.location?.name ?? '—', person.manager?.name ?? '—', tag(person.status)])) : h`<p class="muted">No people yet.${manage ? h` Start a joiner below, or <a href="/app/import">move in from BambooHR</a>.` : ''}</p>`}</section>
${manage ? h`<section class="card"><h2>Start a joiner</h2>${joinerTemplates.length ? form('joiner.start', '/app/cases/{id}', [
    select('Joiner template', 'template', joinerTemplates.map(template => ({ value: template.id, label: `${template.name} (v${template.version})` }))),
    field('Legal name', 'legalName'), field('Preferred name', 'preferredName', { required: false }), field('Work email', 'workEmail', { type: 'email', required: false }), field('Employee number', 'employeeNumber', { required: false }),
    field('Start date', 'startDate', { type: 'date' }), select('Employment type', 'employmentType', EMPLOYMENT_TYPES.map(value => ({ value, label: TYPE_LABELS[value] }))), field('Payroll identifier', 'payrollId', { required: false, hint: 'The employee’s identifier in your payroll provider, if known.' }),
    ...termsFields(options!, true, actor),
  ], 'Start joiner', { layout: 'columns' }) : h`<p class="muted">Create a joiner template in <a href="/app/settings">Settings</a> first.</p>`}</section>` : ''}`
  return page('People', actor, body, { current: '/app/people', url, art: 'frond' })
}

export async function personPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const view = await personView(env, actor, id) as Record<string, any>
  const manage = can(actor, 'people.manage'), self = actor.personId === id
  const options = manage ? await choices(env, actor) : null
  const allTemplates = manage ? await templates(env) : []
  const ofKind = (kind: string) => allTemplates.filter(template => template.kind === kind && template.status === 'active').map(template => ({ value: template.id, label: `${template.name} (v${template.version})` }))
  const periods = (view.employment ?? []) as any[]
  const live = periods.find(period => !period.endDate)
  const sections: Html[] = []
  sections.push(h`<section class="card facet-directory"><h2>Directory</h2><dl class="facts"><dt>Name</dt><dd>${view.name}${view.preferredName ? h` <span class="muted">(legal name ${view.legalName})</span>` : ''}</dd><dt>Work email</dt><dd>${view.workEmail ?? '—'}</dd><dt>Role</dt><dd>${view.current?.jobTitle ?? '—'}</dd><dt>Department</dt><dd>${view.current?.department?.name ?? '—'}</dd><dt>Location</dt><dd>${view.current?.location?.name ?? '—'}</dd><dt>Manager</dt><dd>${view.current?.manager ? h`<a href="/app/people/${view.current.manager.id}">${view.current.manager.name}</a>` : '—'}</dd><dt>Status</dt><dd>${tag(view.status)}</dd>${view.employeeNumber !== undefined ? h`<dt>Employee number</dt><dd>${view.employeeNumber ?? '—'}</dd>` : ''}</dl>
${manage ? h`<details><summary>Edit directory details</summary>${form('person.update', `/app/people/${id}`, [hidden('person', id), hidden('revision', await revisionOf(env, id)), field('Legal name', 'legalName', { value: view.legalName }), field('Preferred name', 'preferredName', { value: view.preferredName ?? '', required: false }), field('Work email', 'workEmail', { type: 'email', value: view.workEmail ?? '', required: false }), field('Employee number', 'employeeNumber', { value: view.employeeNumber ?? '', required: false })], 'Save details', { secondary: true })}</details>` : ''}</section>`)
  if (view.private) sections.push(h`<section class="card private facet-private"><h2>Private details</h2><dl class="facts">${PRIVATE_FIELDS.map(field => h`<dt>${PRIVATE_LABELS[field]}</dt><dd>${view.private[field] ?? '—'}</dd>`)}</dl>
${self || (manage && can(actor, 'people.private')) ? h`<details><summary>Edit private details</summary>${form('person.update', `/app/people/${id}`, [hidden('person', id), hidden('revision', await revisionOf(env, id)), hidden('private', 'yes'), ...PRIVATE_FIELDS.map(name => field(PRIVATE_LABELS[name], name, { type: name === 'date_of_birth' ? 'date' : name === 'personal_email' ? 'email' : 'text', value: view.private[name] ?? '', required: false }))], 'Save private details', { secondary: true })}</details>` : ''}</section>`)
  if (view.employment) sections.push(h`<section class="card facet-employment"><h2>Employment</h2>${periods.map(period => h`<h3 class="period"><span>${formatDate(period.startDate)} – ${period.endDate ? formatDate(period.endDate) : 'ongoing'}</span> ${tag(TYPE_LABELS[period.employmentType])} ${tag(period.status)}</h3>
${period.payrollId !== undefined ? h`<p>Payroll identifier: ${period.payrollId ?? h`<strong>not set</strong>`}</p>` : ''}${period.endReason !== undefined && period.endReason ? h`<p class="private">End reason: ${period.endReason}</p>` : ''}
${table(['From', 'Role', 'Department', 'Location', 'Manager', 'Schedule', ...(view.pay ? ['Pay'] : []), 'Reason', 'Status', ''], period.terms.map((terms: any) => [formatDate(terms.effectiveFrom), terms.jobTitle, terms.department?.name ?? '—', terms.location?.name ?? '—', terms.manager?.name ?? '—', terms.schedule?.name ?? '—', ...(view.pay ? [money(terms.pay)] : []), terms.reason,
    tag(terms.status === 'cancelled' ? 'cancelled' : terms.inForce ? 'in force' : terms.effectiveFrom > actor.today ? 'scheduled' : 'past'),
    manage && terms.status === 'active' && terms.effectiveFrom !== period.startDate ? form('terms.cancel', `/app/people/${id}`, [hidden('terms', terms.id), field('Why', 'reason', { required: false })], 'Cancel this version', { secondary: true }) : '']))}
${manage || can(actor, 'payroll.handoff') ? h`<details><summary>Set payroll identifier</summary>${form('period.payroll', `/app/people/${id}`, [hidden('period', period.id), field('Payroll identifier', 'payrollId', { value: period.payrollId ?? '' })], 'Save', { secondary: true })}</details>` : ''}`)}
${manage && live ? h`<details><summary>Schedule a change (mover)</summary>${form('mover.schedule', `/app/people/${id}`, [hidden('period', live.id), field('Effective from', 'effectiveFrom', { type: 'date' }), field('Reason', 'reason'), ...termsFields(options!, false, actor).map(item => item), select('Mover template', 'template', ofKind('mover'), '', { required: false, blank: 'No case' })], 'Schedule change')}</details>
<details><summary>Record a leaver</summary>${ofKind('leaver').length ? form('leaver.start', `/app/people/${id}`, [hidden('period', live.id), field('Last day of employment', 'endDate', { type: 'date' }), field('Reason (private)', 'reason'), select('Leaver template', 'template', ofKind('leaver'))], 'Start leaver') : h`<p class="muted">Create a leaver template in Settings first.</p>`}</details>` : ''}
${manage && !live && periods.length ? h`<details><summary>Rehire</summary>${ofKind('joiner').length ? form('joiner.start', '/app/cases/{id}', [hidden('person', id), select('Joiner template', 'template', ofKind('joiner')), field('Start date', 'startDate', { type: 'date' }), select('Employment type', 'employmentType', EMPLOYMENT_TYPES.map(value => ({ value, label: TYPE_LABELS[value] }))), field('Payroll identifier', 'payrollId', { required: false }), ...termsFields(options!, true, actor)], 'Start rehire') : ''}<p class="muted">A rehire is a new employment period. Earlier periods stay as they were, and Willow access is not restored automatically.</p></details>` : ''}</section>`)
  if (view.leave) sections.push(await leaveSection(env, actor, id, view, live))
  if (view.documents) sections.push(h`<section class="card facet-documents"><h2>Documents</h2>${view.documents.length ? view.documents.map((document: any) => h`<h3>${document.title} ${tag(document.category)}</h3><ul>${document.versions.map((version: any) => h`<li><a href="/app/files/document/${version.id}?download=1">Version ${version.number}: ${version.filename}</a>${document.acknowledgementRequested ? (version.acknowledgedAt ? h` ${tag('receipt acknowledged')}` : self && version.number === document.versions[0].number ? form('document.acknowledge', `/app/people/${id}`, [hidden('version', version.id)], 'I received this document', { secondary: true }) : h` ${tag('receipt not yet acknowledged')}`) : ''}</li>`)}</ul>${manage ? h`<details><summary>Upload a new version</summary>${form('document.add', `/app/people/${id}`, [hidden('document', document.id), fileField('File', 'file', { required: true })], 'Upload version', { multipart: true, secondary: true })}</details>` : ''}`) : h`<p class="muted">No documents you can read.</p>`}
<p class="muted">Acknowledging receipt records that a document was received. It is not a signature.</p>
${manage && options!.categories.length ? h`<details><summary>Add a document</summary>${form('document.add', `/app/people/${id}`, [hidden('person', id), select('Category', 'category', options!.categories), field('Title', 'title'), fileField('File', 'file', { required: true })], 'Add document', { multipart: true })}</details>` : ''}</section>`)
  if (view.cases) sections.push(h`<section class="card facet-cases"><h2>Joiner, mover and leaver cases</h2>${view.cases.length ? h`<ul class="cases">${view.cases.map((item: any) => h`<li><a href="/app/cases/${item.id}">${item.kind} from ${formatDate(item.anchorDate)}</a> — ${item.status}${item.openTasks ? `, ${item.openTasks} open task(s)` : ''}</li>`)}</ul>` : h`<p class="muted">No cases.</p>`}</section>`)
  if (manage) {
    const member = (await all(env, 'SELECT status FROM wl_members WHERE person_id = ?', id))[0]
    sections.push(h`<section class="card facet-access"><h2>Willow access</h2><p>${member ? (member.status === 'active' ? 'Has access.' : 'Access ended.') : 'No access.'}</p>${member?.status === 'active' ? form('access.end', `/app/people/${id}`, [hidden('person', id)], 'End access', { secondary: true }) : view.workEmail ? form('access.give', `/app/people/${id}`, [hidden('person', id)], member ? 'Give access again' : 'Give access') : h`<p class="muted">Add a work email to give access.</p>`}</section>`)
  }
  const body = h`<p class="back"><a href="/app/people">← People</a></p><h1>${view.name}</h1><div class="person-grid">${sections}</div>`
  return page(view.name, actor, body, { current: '/app/people', url })
}

async function revisionOf(env: Bindings, id: string) {
  return (await all<{ revision: string }>(env, 'SELECT revision FROM wl_people WHERE id = ?', id))[0]?.revision ?? ''
}

async function leaveSection(env: Bindings, actor: Actor, id: string, view: any, live: any) {
  const leaveManager = can(actor, 'leave.manage')
  const policyList = leaveManager ? (await policies(env)).filter(policy => policy.versions.some(version => version.status === 'approved')) : []
  return h`<section class="card facet-leave"><h2>Leave</h2>${view.leave.accounts.length ? view.leave.accounts.map((account: any) => h`<h3>${account.policy.name} ${tag(`policy v${account.policy.version}`)}</h3>
<p>Balance: <strong>${hours(account.balanceMinutes)} hours</strong> · opening ${hours(account.openingMinutes)} h at ${formatDate(account.cutoverDate)} ${tag(account.openingStatus === 'approved' ? 'signed off' : 'awaiting sign-off')} · accrued through ${formatDate(account.accruedThrough)}</p>
${leaveManager && account.openingStatus === 'proposed' ? form('account.approve', `/app/people/${id}`, [hidden('account', account.id)], 'Sign off opening balance') : ''}
${leaveManager && account.openingStatus === 'approved' ? h`<details><summary>Post accrual</summary>${form('leave.accrue', `/app/people/${id}`, [hidden('account', account.id), field('Accrue through', 'through', { type: 'date', value: actor.today })], 'Post accrual', { secondary: true })}</details>` : ''}
<details><summary>Ledger (${account.ledger.length} entries)</summary>${table(['Date', 'Entry', 'Hours', 'Note'], account.ledger.map((entry: any) => [formatDate(entry.effectiveDate), entry.kind, hours(entry.minutes), entry.note]))}</details>`) : h`<p class="muted">No leave accounts.</p>`}
${view.leave.requests.length ? h`<h3>Requests</h3>${table(['Dates', 'Policy', 'Hours', 'Status', ...(view.leave.requests[0].reason !== undefined ? ['Reason (confidential)'] : [])], view.leave.requests.map((request: any) => [h`<a href="/app/leave/${request.id}">${formatDate(request.startDate)} – ${formatDate(request.endDate)}</a>`, request.policy, request.hours, tag(request.status), ...(request.reason !== undefined ? [request.reason ?? '—'] : [])]))}` : ''}
${leaveManager && live && policyList.length ? h`<details><summary>Open a leave account</summary>${form('account.open', `/app/people/${id}`, [hidden('period', live.id), select('Policy', 'policy', policyList.map(policy => ({ value: policy.id, label: policy.name }))), field('Cutover date', 'cutoverDate', { type: 'date', value: actor.today }), field('Opening balance (hours)', 'openingHours', { value: '0' }), area('Where the opening balance comes from', 'note')], 'Propose opening balance', { secondary: true })}</details>` : ''}</section>`
}
