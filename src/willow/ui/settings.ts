// Employer setup, settings (places, teams, schedules, document categories,
// lifecycle templates, leave policies) and access (permissions and preview).
import type { Bindings } from '../../auth.server'
import { PERMISSIONS, PERMISSION_LABELS, PRESETS, can, requireOwner, type Actor } from '../actor'
import { WEEKDAYS, employer, settings } from '../employer'
import { policies } from '../leave'
import { ASSIGNEES, REQUIRED_FIELDS, templates } from '../lifecycle'
import { members, visibilityPreview } from '../members'
import { insist } from '../core'
import { directory } from '../profile'
import { area, checks, field, form, h, hidden, page, person, select, table, tag } from './html'

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Hobart', 'Australia/Darwin', 'Pacific/Auckland', 'UTC']
const zoneOptions = ZONES.map(zone => ({ value: zone, label: zone }))

export async function employerPage(env: Bindings, actor: Actor, url: URL) {
  requireOwner(actor)
  const current = await employer(env)
  const body = h`<div class="first-run"><h1>Your employer</h1><p>Willow keeps people records for one employer. Dates of employment and leave use this time zone.</p>
<section class="card">${form('employer.configure', '/app/settings', [
    field('Employer name', 'name', { value: current?.name ?? '' }),
    select('Time zone', 'timezone', zoneOptions, current?.timezone ?? 'America/Chicago'),
    field('Country (two-letter code)', 'country', { value: current?.country ?? 'US', hint: 'For example US. Willow encodes no country rules: you supply your own policies.' }),
    field('Currency (three-letter code)', 'currency', { value: current?.currency ?? 'USD' }),
  ], 'Save')}</section></div>`
  return page('Employer', actor, body, { current: '/app/settings', url, showNav: Boolean(current) })
}

export async function settingsPage(env: Bindings, actor: Actor, url: URL) {
  insist(can(actor, 'people.manage') || can(actor, 'leave.manage'), 'forbidden', 403)
  const data = await settings(env)
  const [templateList, policyList] = await Promise.all([templates(env), policies(env)])
  const manage = can(actor, 'people.manage')
  const assigneeOptions = ASSIGNEES.map(value => ({ value, label: value === 'hr' ? 'HR' : value === 'it' ? 'IT' : value[0].toUpperCase() + value.slice(1) }))
  const taskRow = (index: number) => h`<fieldset><legend>Task ${index}</legend>${field('Task', 'taskTitle', { required: index === 1 })}${select('Who does it', 'taskAssignee', assigneeOptions, index === 1 ? 'hr' : 'manager', { required: false })}${field('Due (days after the start, end or change date; negative for before)', 'taskDueDays', { value: '0', required: false })}${select('Needs evidence', 'taskEvidence', [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], 'no', { required: false })}${field('External system or device (always needs evidence)', 'taskSystem', { required: false })}${select('Willow action', 'taskAction', [{ value: 'end_access', label: 'End this person’s Willow access' }], '', { required: false, blank: 'None' })}</fieldset>`
  const body = h`<h1>Settings</h1>${data.employer ? h`<p class="lead">${data.employer.name} · ${data.employer.timezone} · ${data.employer.country} · ${data.employer.currency}${actor.owner ? h` · <a href="/app/employer">Change</a>` : ''}</p>` : ''}
<div class="grid settings-grid">
<section class="card"><h2>Locations</h2>${data.locations.length ? h`<ul>${data.locations.map(row => h`<li>${row.name} <span class="muted">(${row.timezone})</span></li>`)}</ul>` : h`<p class="muted">No locations yet.</p>`}
${manage ? form('location.create', '/app/settings', [field('Location name', 'name'), select('Location time zone', 'timezone', zoneOptions, data.employer?.timezone)], 'Add location') : ''}</section>
<section class="card"><h2>Departments</h2>${data.departments.length ? h`<ul>${data.departments.map(row => h`<li>${row.name}</li>`)}</ul>` : h`<p class="muted">No departments yet.</p>`}
${manage ? form('department.create', '/app/settings', [field('Department name', 'name')], 'Add department') : ''}</section>
<section class="card"><h2>Working schedules</h2><p class="muted">Leave is calculated from the schedule in force on each day. Schedules never change once created.</p>${data.schedules.length ? h`<ul>${data.schedules.map(row => h`<li>${row.name}: ${WEEKDAYS.map(day => `${day} ${(row.minutes[day] / 60).toFixed(2)}`).join(', ')} (${(row.weeklyMinutes / 60).toFixed(2)} h/week)</li>`)}</ul>` : h`<p class="muted">No schedules yet.</p>`}
${manage ? form('schedule.create', '/app/settings', [field('Schedule name', 'name'), ...WEEKDAYS.map(day => field(`${day[0].toUpperCase()}${day.slice(1)} hours`, day, { value: ['sat', 'sun'].includes(day) ? '0' : '7.6', required: false }))], 'Add schedule', { layout: 'days' }) : ''}</section>
<section class="card"><h2>Document categories</h2><p class="muted">Members with “Read every private document category” read all of them. Each category decides whether the person and their manager may read it too.</p>${data.categories.length ? h`<ul>${data.categories.map(row => h`<li>${row.name}: ${[row.subjectReads ? 'the person' : '', row.managerReads ? 'their manager' : '', row.acknowledgement ? 'asks for receipt acknowledgement' : ''].filter(Boolean).join(', ') || 'HR only'}</li>`)}</ul>` : h`<p class="muted">No categories yet.</p>`}
${manage ? form('category.create', '/app/settings', [field('Category name', 'name'), h`<label class="check"><input type="checkbox" name="subjectReads" value="yes"> The person it is about</label><label class="check"><input type="checkbox" name="managerReads" value="yes"> Their current manager</label><label class="check"><input type="checkbox" name="acknowledgement" value="yes"> Ask the person to acknowledge receipt (not a signature)</label>`], 'Add category') : ''}</section>
<section class="card"><h2>Leave policies</h2><p class="muted">You write each policy; the owner approves a version before it can be used. Willow does not encode award or statutory rules.</p>
${policyList.length ? policyList.map(policy => h`<h3>${policy.name}</h3><ul>${policy.versions.map(version => h`<li>Version ${version.version} ${tag(version.status)} — accrues ${version.accrualWeeks} weeks a year of scheduled hours; may go ${(version.negativeLimitMinutes / 60).toFixed(2)} h negative. ${version.summary}${version.status === 'draft' && actor.owner ? form('policy.approve', '/app/settings', [hidden('version', version.id)], `Approve version ${version.version}`, { secondary: true }) : ''}</li>`)}</ul>${can(actor, 'leave.manage') ? h`<details><summary>Write a new version of ${policy.name}</summary>${form('policy.write', '/app/settings', [hidden('policy', policy.id), area('Policy text', 'summary'), field('Accrual (weeks per year)', 'accrualWeeks', { value: '0' }), field('Negative balance allowed (hours)', 'negativeLimitHours', { value: '0' })], 'Save draft version')}</details>` : ''}`) : h`<p class="muted">No leave policies yet.</p>`}
${can(actor, 'leave.manage') ? h`<h3>New policy</h3>${form('policy.write', '/app/settings', [field('Policy name', 'name'), area('Policy text', 'summary'), field('Accrual (weeks per year)', 'accrualWeeks', { value: '4', hint: 'Weeks of scheduled hours accrued per year of service; 0 for none.' }), field('Negative balance allowed (hours)', 'negativeLimitHours', { value: '0' })], 'Save draft policy')}` : ''}</section>
${manage ? h`<section class="card templates"><h2>Lifecycle templates</h2><p class="muted">Each case keeps the template version it started from.</p>
${templateList.filter(template => template.status === 'active').map(template => h`<h3>${template.name} ${tag(`${template.kind} v${template.version}`)}</h3><p class="muted">Required information: ${template.requiredFields.join(', ') || 'none'}</p><ol>${template.tasks.map(task => h`<li>${task.title} — ${task.assignee}, due ${task.dueOffsetDays} day(s)${task.system ? ` · ${task.system}` : ''}${task.evidenceRequired ? ' · evidence' : ''}</li>`)}</ol>`)}
<h3>New template</h3>${form('template.create', '/app/settings', [select('Kind', 'kind', [{ value: 'joiner', label: 'Joiner' }, { value: 'mover', label: 'Mover' }, { value: 'leaver', label: 'Leaver' }]), field('Template name', 'name'), checks('Required information before the case completes', 'requiredFields', REQUIRED_FIELDS.map(value => ({ value, label: value.replace(/_/g, ' ') }))), ...[1, 2, 3, 4, 5].map(taskRow)], 'Save template', { layout: 'tasks' })}</section>` : ''}</div>`
  return page('Settings', actor, body, { current: '/app/settings', url })
}

export async function accessPage(env: Bindings, actor: Actor, request: Request, url: URL) {
  const list = await members(env, actor, request)
  const people = await directory(env, actor)
  const previewMember = url.searchParams.get('member'), previewPerson = url.searchParams.get('person')
  const preview = previewMember && previewPerson ? await visibilityPreview(env, actor, previewMember, previewPerson) : null
  const body = h`<h1>Access</h1><p class="lead">Every permission is explicit. Managing someone shows you their work details and leave dates, never their pay, private contact details or confidential reasons.</p>
<section class="card"><h2>Members</h2>${table(['Member', 'Sign-in', 'Permissions', ''], list.map(member => [h`${person(member.name)}<br><span class="muted">${member.email}</span>`, member.status === 'ended' ? tag('ended') : member.signIn ?? '—',
    member.owner ? tag('Owner (everything)') : member.permissions.length ? member.permissions.map((permission: string) => PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS] ?? permission).join('; ') : tag('None (employee)'),
    actor.owner && !member.owner && member.status === 'active' ? h`<details><summary>Change</summary>${form('member.permissions', '/app/access', [hidden('member', member.id), checks('Permissions', 'permissions', PERMISSIONS.map(value => ({ value, label: PERMISSION_LABELS[value] })), member.permissions)], 'Save permissions', { secondary: true })}<p class="muted">Bundles: HR = ${PRESETS.hr.join(', ')}; payroll = ${PRESETS.payroll.join(', ')}; IT = ${PRESETS.it.join(', ')}.</p></details>` : '']))}</section>
<section class="card"><h2>Preview what a member sees</h2><form method="get" action="/app/access" class="row-form">${select('Member', 'member', list.map(member => ({ value: member.id, label: member.name })), previewMember ?? '')}${select('About this person', 'person', people.map(person => ({ value: person.id, label: person.name })), previewPerson ?? '')}<button type="submit">Preview</button></form>
${preview ? h`<h3>${preview.member.name} ${preview.member.isThisPerson ? '(this person)' : preview.member.managesThisPerson ? '(their manager)' : ''}</h3>${table(['What', 'Visible to them'], preview.facets.map(facet => [facet.label, tag(facet.visible ? (facet.withheldFromYou ? 'Yes (withheld from you)' : 'Yes') : 'No')]))}<details><summary>Exactly what they would receive (your access applies)</summary><pre>${JSON.stringify(preview.view, null, 2)}</pre></details>` : ''}</section>`
  return page('Access', actor, body, { current: '/app/access', url })
}
