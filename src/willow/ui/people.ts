import { selfWriteModes } from '../levels/personal'
import { accrualCalculations } from './accrual-calculations'
import { selfProfilePanel } from './self-service'
// The directory, the joiner form and a person's page. The person page renders
// only what personView returned for this member: sections for facets the
// member lacks are absent, not hidden.
import type { Bindings } from '../../auth.server'
import { can, canAbout, type Actor } from '../actor'
import { effectiveField, fieldSchemas, writesCustomField } from '../custom-fields/store'
import { customPersonSection, customValueInputs } from './custom-fields'
import { recordTablesSection } from './record-tables'
import { one } from '../core'
import { formatDate, hours, requireDate } from '../dates'
import { settings } from '../employer'
import { policies } from '../leave'
import { templates } from '../lifecycle'
import { EMPLOYMENT_TYPES, PRIVATE_FIELDS, PRIVATE_LABELS } from '../people'
import { formatPay } from '../money'
import { directory, personView } from '../profile'
import { directoryFilters, filterDirectory, organizationChart } from '../organization'
import { organizationSection } from './organization'
import { employeeExportSection } from './employee-export'
import { area, avatar, field, fileField, form, h, hidden, page, person as personName, raw, select, table, tag, type Html } from './html'
import { KIND_LABELS, TYPE_LABELS, sentence } from './labels'
const money = (pay: { basis: string; amountCents: number | null; currency: string } | null) => pay ? formatPay(pay.basis, pay.amountCents, pay.currency) : '—'

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
    // A new record's blank pay basis records pay as not known yet, so it needs no second "Not known yet".
    ...(can(actor, 'pay.read') ? [select('Pay basis', 'payBasis', [{ value: 'salary', label: 'Salary per year' }, { value: 'hourly', label: 'Hourly rate' }, ...(required ? [] : [{ value: 'unknown', label: 'Not known yet' }])], '', { required: false, blank: required ? 'Not known yet' : 'Unchanged' }), field('Pay amount', 'payAmount', { required: false })] : []),
  ]
}

export async function directoryPage(env: Bindings, actor: Actor, url: URL) {
  const filters = directoryFilters(url.searchParams, actor.today)
  const allPeople = await directory(env, actor, filters.date)
  const people = filterDirectory(allPeople, filters)
  const chart = organizationChart(allPeople, filters.date)
  const organization = url.searchParams.get('view') === 'organization'
  const manage = can(actor, 'people.manage')
  const joinerTemplates = manage ? (await templates(env)).filter(template => template.kind === 'joiner' && template.status === 'active') : []
  const options = manage ? await choices(env, actor) : null
  const joinerDate = requireDate(url.searchParams.get('joinerDate') ?? actor.today, 'invalid_startDate')
  const customSchemas = manage ? await fieldSchemas(env, joinerDate) : []
  const customDefinitions = customSchemas.flatMap(schema => { const definition = effectiveField(schema); return definition && writesCustomField(actor, definition) ? [definition] : [] })
  const views = [{ label: 'Directory', href: `/app/people?asOf=${filters.date}`, on: !organization }, { label: 'Organization chart', href: `/app/people?view=organization&asOf=${filters.date}`, on: organization }]
  const body = h`<header class="page-head"><h1>People</h1><p class="count">${chart.activeCount} active people${!organization ? ` · ${people.length} matching records` : ''}</p></header>
<nav class="tabs page-tabs" aria-label="People views">${views.map(view => h`<a href="${view.href}"${view.on ? raw(' aria-current="page"') : ''}>${view.label}</a>`)}</nav>
<section class="card filters-card"><form method="get" action="/app/people" class="filters">${hidden('view', organization ? 'organization' : 'directory')}${field('Record as of', 'asOf', { type: 'date', value: filters.date })}${!organization ? [field('Search name, location, department or role', 'q', { required: false, value: filters.q }), field('Name', 'name', { required: false, value: filters.name }), field('Location', 'location', { required: false, value: filters.location }), field('Department', 'department', { required: false, value: filters.department }), field('Role', 'role', { required: false, value: filters.role }), select('Status', 'status', [{ value: 'all', label: 'All visible records' }, { value: 'active', label: 'Active' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'former', label: 'Former' }], filters.status)] : ''}<button type="submit" class="secondary">${organization ? 'Preview date' : 'Search'}</button></form></section>
${organization ? organizationSection(chart, actor, url) : h`<section class="card">${people.length ? table(['Name', 'Role', 'Department', 'Location', 'Manager', 'Status'], people.map(person => [personName(person.name, `/app/people/${person.id}${url.searchParams.has('asOf') ? `?asOf=${filters.date}` : ''}`), person.jobTitle ?? '—', person.department?.name ?? '—', person.location?.name ?? '—', person.manager?.name ?? '—', tag(person.status)])) : h`<p class="muted">No people yet.${manage ? h` Start a joiner below, or <a href="/app/import">move in from BambooHR</a>.` : ''}</p>`}</section>`}
${!organization ? await employeeExportSection(env, actor, filters) : ''}
${manage && !organization ? h`<section class="card"><h2>Start a joiner</h2>${customSchemas.length ? h`<form method="get" action="/app/people" class="row-form">${field('Start date for custom fields', 'joinerDate', { type: 'date', value: joinerDate })}<button type="submit" class="secondary">Preview required fields</button></form>` : ''}${joinerTemplates.length ? form('joiner.start', '/app/cases/{id}', [
    select('Joiner template', 'template', joinerTemplates.map(template => ({ value: template.id, label: `${template.name} (v${template.version})` }))),
    field('Legal name', 'legalName'), field('Preferred name', 'preferredName', { required: false }), field('Work email', 'workEmail', { type: 'email', required: false }), field('Employee number', 'employeeNumber', { required: false }),
    field('Start date', 'startDate', { type: 'date', value: joinerDate }), select('Employment type', 'employmentType', EMPLOYMENT_TYPES.map(value => ({ value, label: TYPE_LABELS[value] }))), field('Payroll identifier', 'payrollId', { required: false, hint: 'The employee’s identifier in your payroll provider, if known.' }),
    ...termsFields(options!, true, actor), customValueInputs(customDefinitions),
  ], 'Start joiner', { layout: 'columns' }) : h`<p class="muted">Create a joiner template in <a href="/app/settings">Settings</a> first.</p>`}</section>` : ''}`
  return page('People', actor, body, { current: organization ? '/app/people?view=organization' : '/app/people', url })
}

export async function personPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const asOf = url.searchParams.get('asOf') ?? undefined
  const dated = asOf !== undefined
  const manage = !dated && can(actor, 'people.manage'), self = !dated && actor.personId === id
  // A scoped level's HR rights reach this person's directory and private details only (ROLE-002).
  const manageHere = !dated && canAbout(actor, 'people.manage', id)
  const selfModes = self ? await selfWriteModes(env,actor) : null
  const [projection, options, allTemplates, member, policyList] = await Promise.all([
    personView(env, actor, id, { asOf }),
    manage ? choices(env, actor) : null,
    manage ? templates(env) : [],
    manage ? one(env, 'SELECT status FROM wl_members WHERE person_id = ?', id) : null,
    can(actor, 'leave.manage') ? policies(env) : [],
  ])
  const view = projection as Record<string, any>
  const ofKind = (kind: string) => allTemplates.filter(template => template.kind === kind && template.status === 'active').map(template => ({ value: template.id, label: `${template.name} (v${template.version})` }))
  const periods = (view.employment ?? []) as any[]
  const live = periods.find(period => !period.endDate)
  const selectedTerm = periods.flatMap(period => period.terms).find(term => term.inForce)
  const sections: Html[] = []
  sections.push(h`<section class="card facet-directory"><h2>Directory</h2>${dated ? h`<p>Record as of ${formatDate(view.asOf)}. Access is based on your permissions today.</p>${view.current?.scheduled ? h`<p>${tag('scheduled')} This version takes effect after today.</p>` : ''}` : ''}<dl class="facts"><dt>Name</dt><dd>${view.name}${view.preferredName ? h` <span class="muted">(legal name ${view.legalName})</span>` : ''}</dd><dt>Work email</dt><dd>${view.workEmail ?? '—'}</dd><dt>Role</dt><dd>${view.current?.jobTitle ?? '—'}</dd><dt>Department</dt><dd>${view.current?.department?.name ?? '—'}</dd><dt>Location</dt><dd>${view.current?.location?.name ?? '—'}</dd><dt>Manager</dt><dd>${view.current?.manager ? h`<a href="/app/people/${view.current.manager.id}">${view.current.manager.name}</a>` : '—'}</dd><dt>Status</dt><dd>${tag(view.status)}</dd>${view.employeeNumber !== undefined ? h`<dt>Employee number</dt><dd>${view.employeeNumber ?? '—'}</dd>` : ''}${selectedTerm ? h`<dt>Terms version</dt><dd><a href="#terms-${selectedTerm.id}">From ${formatDate(selectedTerm.effectiveFrom)}</a></dd><dt>Working schedule</dt><dd>${selectedTerm.schedule?.name ?? '—'}</dd>${view.pay ? h`<dt>Pay in force</dt><dd>${money(selectedTerm.pay)}</dd>` : ''}` : ''}</dl>
${manageHere ? h`<details><summary>Edit directory details</summary>${form('person.update', `/app/people/${id}`, [hidden('person', id), hidden('revision', view.revision), field('Legal name', 'legalName', { value: view.legalName }), field('Preferred name', 'preferredName', { value: view.preferredName ?? '', required: false }), field('Work email', 'workEmail', { type: 'email', value: view.workEmail ?? '', required: false }), field('Employee number', 'employeeNumber', { value: view.employeeNumber ?? '', required: false })], 'Save details', { secondary: true })}</details>` : ''}</section>`)
  if (!dated) sections.push(selfProfilePanel(actor,view,await selfWriteModes(env,actor)))
  if (view.private) sections.push(h`<section class="card private facet-private"><h2>Private details</h2><dl class="facts">${PRIVATE_FIELDS.map(field => h`<dt>${PRIVATE_LABELS[field]}</dt><dd>${view.private[field] ?? '—'}</dd>`)}</dl>
${!dated && (self || (manageHere && canAbout(actor, 'people.private', id))) ? h`<details><summary>Edit private details</summary>${form('person.update', `/app/people/${id}`, [hidden('person', id), hidden('revision', view.revision), hidden('private', 'yes'), ...PRIVATE_FIELDS.map(name => selfModes && selfModes[name]!=='edit' ? h`${hidden(name,view.private[name]??'')}<p>${PRIVATE_LABELS[name]}: ${selfModes[name]==='approval' ? h`<a href="/app/self-changes">Request an HR-approved change</a>` : 'View only'}</p>` : field(PRIVATE_LABELS[name], name, { type: name === 'date_of_birth' ? 'date' : name === 'personal_email' ? 'email' : 'text', value: view.private[name] ?? '', required: false }))], 'Save private details', { secondary: true })}</details>` : ''}</section>`)
  if (view.customFields) sections.push(customPersonSection(view.customFields, dated ? undefined : actor, id))
  if (view.recordTables) sections.push(recordTablesSection(view.recordTables, dated ? undefined : actor, id))
  if (view.employment) sections.push(h`<section class="card facet-employment"><h2>Employment</h2>${periods.map(period => h`<h3 class="period"><span>${formatDate(period.startDate)} – ${period.endDate ? formatDate(period.endDate) : 'ongoing'}</span> ${tag(TYPE_LABELS[period.employmentType])} ${tag(period.status)}</h3>
${period.payrollId !== undefined ? h`<p>Payroll identifier: ${period.payrollId ?? h`<strong>not set</strong>`}</p>` : ''}${period.endReason !== undefined && period.endReason ? h`<p class="private">End reason: ${period.endReason}</p>` : ''}
${table(['From', 'Role', 'Department', 'Location', 'Manager', 'Schedule', ...(view.pay ? ['Pay'] : []), 'Reason', 'Status', ''], period.terms.map((terms: any) => [h`<span id="terms-${terms.id}">${formatDate(terms.effectiveFrom)}</span>`, terms.jobTitle, terms.department?.name ?? '—', terms.location?.name ?? '—', terms.manager?.name ?? '—', terms.schedule?.name ?? '—', ...(view.pay ? [money(terms.pay)] : []), terms.reason,
    tag(terms.status === 'cancelled' ? 'cancelled' : terms.inForce ? (terms.effectiveFrom > actor.today ? 'scheduled · selected' : 'in force') : terms.effectiveFrom > actor.today ? 'scheduled' : 'past'),
    manage && terms.status === 'active' && terms.effectiveFrom !== period.startDate ? form('terms.cancel', `/app/people/${id}`, [hidden('terms', terms.id), field('Why', 'reason', { required: false })], 'Cancel this version', { secondary: true }) : '']))}
${manage || can(actor, 'payroll.handoff') ? h`<details><summary>Set payroll identifier</summary>${form('period.payroll', `/app/people/${id}`, [hidden('period', period.id), field('Payroll identifier', 'payrollId', { value: period.payrollId ?? '' })], 'Save', { secondary: true })}</details>` : ''}`)}
${manage && live ? h`<details><summary>Schedule a change (mover)</summary>${form('mover.schedule', `/app/people/${id}`, [hidden('period', live.id), field('Effective from', 'effectiveFrom', { type: 'date' }), field('Reason', 'reason'), ...termsFields(options!, false, actor).map(item => item), select('Mover template', 'template', ofKind('mover'), '', { required: false, blank: 'No case' })], 'Schedule change')}</details>
<details><summary>Record a leaver</summary>${ofKind('leaver').length ? form('leaver.start', `/app/people/${id}`, [hidden('period', live.id), field('Last day of employment', 'endDate', { type: 'date' }), field('Reason (private)', 'reason'), select('Leaver template', 'template', ofKind('leaver'))], 'Start leaver') : h`<p class="muted">Create a leaver template in Settings first.</p>`}</details>` : ''}
${manage && !live && periods.length ? h`<details><summary>Rehire</summary>${ofKind('joiner').length ? form('joiner.start', '/app/cases/{id}', [hidden('person', id), select('Joiner template', 'template', ofKind('joiner')), field('Start date', 'startDate', { type: 'date' }), select('Employment type', 'employmentType', EMPLOYMENT_TYPES.map(value => ({ value, label: TYPE_LABELS[value] }))), field('Payroll identifier', 'payrollId', { required: false }), ...termsFields(options!, true, actor), customValueInputs(view.customFields.fields.filter((item: any) => writesCustomField(actor, item.currentDefinition)).map((item: any) => item.currentDefinition), Object.fromEntries(view.customFields.fields.map((item: any) => [item.key, item.value])))], 'Start rehire') : ''}<p class="muted">A rehire is a new employment period. Earlier periods stay as they were, and Willow access is not restored automatically.</p></details>` : ''}</section>`)
  if (view.leave) sections.push(leaveSection(actor, id, view, live, policyList, dated))
  if (view.documents) sections.push(h`<section class="card facet-documents"><h2>Documents</h2>${view.documents.length ? view.documents.map((document: any) => h`<h3 id="document-${document.id}">${document.title} ${tag(document.category)}</h3><ul>${document.versions.map((version: any) => h`<li><a href="/app/files/document/${version.id}?download=1">Version ${version.number}: ${version.filename}</a>${document.acknowledgementRequested ? (version.acknowledgedAt ? h` ${tag('receipt acknowledged')}` : self && version.number === document.versions[0].number ? form('document.acknowledge', `/app/people/${id}`, [hidden('version', version.id)], 'I received this document', { secondary: true }) : h` ${tag('receipt not yet acknowledged')}`) : ''}</li>`)}</ul>${manage ? h`<details><summary>Upload a new version</summary>${form('document.add', `/app/people/${id}`, [hidden('document', document.id), fileField('File', 'file', { required: true })], 'Upload version', { multipart: true, secondary: true })}</details>` : ''}`) : h`<p class="muted">No documents you can read.</p>`}
<p class="muted">Acknowledging receipt records that a document was received. It is not a signature.</p>
${manage && options!.categories.length ? h`<details><summary>Add a document</summary>${form('document.add', `/app/people/${id}`, [hidden('person', id), select('Category', 'category', options!.categories), field('Title', 'title'), fileField('File', 'file', { required: true })], 'Add document', { multipart: true })}</details>` : ''}</section>`)
  if (view.cases) sections.push(h`<section class="card facet-cases"><h2>Joiner, mover and leaver cases</h2>${view.cases.length ? h`<ul class="cases">${view.cases.map((item: any) => h`<li><a href="/app/cases/${item.id}">${KIND_LABELS[item.kind] ?? item.kind} from ${formatDate(item.anchorDate)}</a> ${tag(item.status)}${item.openTasks ? ` ${item.openTasks} open task${item.openTasks === 1 ? '' : 's'}` : ''}</li>`)}</ul>` : h`<p class="muted">No cases.</p>`}</section>`)
  if (manage) {
    sections.push(h`<section class="card facet-access"><h2>Willow access</h2><p>${member ? (member.status === 'active' ? 'Has access.' : 'Access ended.') : 'No access.'}</p>${member?.status === 'active' ? form('access.end', `/app/people/${id}`, [hidden('person', id)], 'End access', { secondary: true }) : view.workEmail ? form('access.give', `/app/people/${id}`, [hidden('person', id)], member ? 'Give access again' : 'Give access') : h`<p class="muted">Add a work email to give access.</p>`}</section>`)
  }
  const facts = [view.current?.jobTitle, view.current?.department?.name, view.current?.location?.name].filter(Boolean).join(' · ')
  const body = h`<p class="back"><a href="/app/people">← People</a></p><header class="profile-head">${avatar(view.name)}<div><h1>${view.name}</h1><p>${facts || 'No role recorded'}</p></div>
<form method="get" action="/app/people/${id}" class="as-of">${field('Record as of', 'asOf', { type: 'date', value: view.asOf })}<button type="submit" class="secondary">View date</button></form></header>
<p class="record-links"><a href="/app/people/${id}">Current record</a> · <a href="/api/willow/people/${id}?asOf=${view.asOf}">JSON record</a> · <a href="/api/willow/context/${id}?asOf=${view.asOf}">Agent context</a></p><div class="person-grid">${sections}</div>`
  return page(view.name, actor, body, { current: '/app/people', url })
}

function leaveSection(actor: Actor, id: string, view: any, live: any, availablePolicies: Awaited<ReturnType<typeof policies>>, dated = false) {
  const leaveManager = !dated && can(actor, 'leave.manage')
  const policyList = availablePolicies.filter(policy => policy.versions.some(version => version.status === 'approved'))
  return h`<section class="card facet-leave"><h2>Leave</h2>${view.leave.accounts.length ? view.leave.accounts.map((account: any) => h`<h3>${account.policy.name} ${tag(`policy v${account.policy.version}`)}</h3>
<p>${dated ? h`<a href="#ledger-${account.id}">Balance as of ${formatDate(view.asOf)}</a>` : 'Balance'}: <strong>${hours(account.balanceMinutes)} hours</strong> · opening ${hours(account.openingMinutes)} h at ${formatDate(account.cutoverDate)} ${tag(account.openingStatus === 'approved' ? 'signed off' : 'awaiting sign-off')} · accrued through ${formatDate(account.accruedThrough)}</p>
${leaveManager && account.openingStatus === 'proposed' ? form('account.approve', `/app/people/${id}`, [hidden('account', account.id)], 'Sign off opening balance') : ''}
${leaveManager && account.openingStatus === 'approved' ? h`<details><summary>Post accrual</summary>${form('leave.accrue', `/app/people/${id}`, [hidden('account', account.id), field('Accrue through', 'through', { type: 'date', value: actor.today })], 'Post accrual', { secondary: true })}</details>` : ''}
${accrualCalculations(account.calculations??[],id)}
${leaveManager && account.openingStatus==='approved'?h`<details><summary>Propose balance override</summary><p>The owner approves every override. Reasons are visible to readers of the leave ledger; keep medical information in protected cases.</p>${form('leave.adjust','/app/leave',[hidden('account',account.id),field('Adjustment (hours, signed)','hours'),field('Effective date','effectiveDate',{type:'date',value:actor.today}),field('Reason','note')],actor.owner?'Approve and post override':'Request owner approval',{secondary:true})}</details>`:''}
<details id="ledger-${account.id}"><summary>Ledger (${account.ledger.length} entries)</summary>${table(['Date', 'Entry', 'Hours', 'Note'], account.ledger.map((entry: any) => [formatDate(entry.effectiveDate), sentence(String(entry.kind).replace(/_/g, ' ')), hours(entry.minutes), entry.note]))}</details>`) : h`<p class="muted">No leave accounts.</p>`}
${view.leave.requests.length ? h`<h3>Requests</h3>${table(['Dates', 'Policy', 'Hours', 'Status', ...(view.leave.requests[0].reason !== undefined ? ['Reason (confidential)'] : [])], view.leave.requests.map((request: any) => [h`<a href="/app/leave/${request.id}">${formatDate(request.startDate)} – ${formatDate(request.endDate)}</a>`, request.policy, request.hours, tag(request.status), ...(request.reason !== undefined ? [request.reason ?? '—'] : [])]))}` : ''}
${leaveManager && live && policyList.length ? h`<details><summary>Open a leave account</summary>${form('account.open', `/app/people/${id}`, [hidden('period', live.id), select('Policy', 'policy', policyList.map(policy => ({ value: policy.id, label: policy.name }))), field('Cutover date', 'cutoverDate', { type: 'date', value: actor.today }), field('Opening balance (hours)', 'openingHours', { value: '0' }), area('Where the opening balance comes from', 'note')], 'Propose opening balance', { secondary: true })}</details>` : ''}</section>`
}
