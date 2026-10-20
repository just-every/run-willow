// FLOW-004 pages: requests in the member's scope, a request form for managers
// and HR, HR's chain settings, and one request with its chain and history.
import type { Bindings } from '../../auth.server'
import { can, employerZone, type Actor } from '../actor'
import { all } from '../core'
import { formatDate } from '../dates'
import { EMPLOYMENT_TYPES, displayName } from '../people'
import { ROLES, ROLE_LABELS } from '../change-requests/chain'
import { changeRequest, changeRequests } from '../change-requests/view'
import { area, field, fileField, form, h, hidden, page, select, table, tag, when } from './html'

async function options(env: Bindings) {
  const named = (rows: { id: string; name: string }[]) => rows.map(r => ({ value: r.id, label: r.name }))
  return {
    departments: named(await all(env, 'SELECT id, name FROM wl_departments ORDER BY name')),
    locations: named(await all(env, 'SELECT id, name FROM wl_locations ORDER BY name')),
    schedules: named(await all(env, 'SELECT id, name FROM wl_schedules ORDER BY name')),
    people: (await all(env, 'SELECT id, legal_name, preferred_name FROM wl_people ORDER BY legal_name')).map(p => ({ value: p.id, label: displayName(p) })),
  }
}

function requestFields(actor: Actor, o: Awaited<ReturnType<typeof options>>, values: Record<string, string | null | undefined> = {}) {
  const keep = { required: false, blank: 'No change' }
  return h`${field('Effective from', 'effectiveFrom', { type: 'date', value: values.effectiveFrom ?? '' })}${area('Reason', 'reason', values.reason ?? '')}
${field('New job title', 'jobTitle', { required: false, value: values.jobTitle ?? '' })}${select('Department', 'departmentId', o.departments, values.departmentId ?? '', keep)}${select('Location', 'locationId', o.locations, values.locationId ?? '', keep)}
${select('Employment type', 'employmentType', EMPLOYMENT_TYPES.map(t => ({ value: t, label: t.replace('_', ' ') })), values.employmentType ?? '', keep)}${select('Manager', 'managerPersonId', o.people, values.managerPersonId ?? '', keep)}${select('Working schedule (hours / FTE)', 'scheduleId', o.schedules, values.scheduleId ?? '', keep)}
${field('Pay change (percent, for example 10)', 'payIncreasePercent', { required: false, value: values.payIncreasePercent ?? '', hint: 'Applied to the pay in force on the effective date, rounded to the cent.' })}
${can(actor, 'pay.read') ? h`${select('Pay basis (exact amount)', 'payBasis', [{ value: 'salary', label: 'Salary per year' }, { value: 'hourly', label: 'Hourly' }], '', { required: false, blank: 'Use percent' })}${field('New pay amount', 'payAmount', { required: false })}` : ''}
${fileField('Attachment', 'attachment')}${area('Comment for approvers', 'comment', '', false)}`
}

export async function changeRequestsPage(env: Bindings, actor: Actor, url: URL) {
  const data = await changeRequests(env, actor), o = await options(env)
  const chainForm = (type: 'compensation' | 'job') => {
    const current = data.chains?.find(c => c!.type === type)
    const rows = [0, 1, 2, 3].map(index => { const step = current?.steps[index]; return h`<fieldset><legend>Step ${index + 1}</legend>${select('Approver', 'stepRole', ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] })), step?.role ?? '', { required: false, blank: 'Not used' })}${field('Only at or above pay change (%)', 'stepMinIncrease', { required: false, value: step?.minIncreasePercent ?? '' })}${select('Only for location', 'stepLocations', o.locations, step?.locations[0] ?? '', { required: false, blank: 'Any location' })}${field('Only for band positions', 'stepBandPositions', { required: false, value: step?.bandPositions?.join(', ') ?? '', hint: 'Comma-separated: below, within, above, unbanded. Uses the proposed terms and band effective on the change date.' })}</fieldset>` })
    return h`<details><summary>${type === 'compensation' ? 'Pay changes' : 'Job changes without pay'}${current ? h` · ${current.steps.map(s => ROLE_LABELS[s.role]).join(' → ')}` : ' · not configured'}</summary>${form('change.chain', '/app/changes', [hidden('requestType', type), select('Mover workflow started on approval', 'template', data.moverTemplates!.map(t => ({ value: t.id, label: t.name })), current?.templateId ?? ''), ...rows], 'Save approval chain')}</details>`
  }
  const body = h`<h1>Change requests</h1><p><a href="/app/compensation">Compensation bands and planning</a></p><p>Managers request dated changes for their direct reports; each request follows HR’s approval chain and writes one terms version only after final approval.</p>
${data.chains ? h`<section class="card"><h2>Approval chains</h2><p>Each approver sees only the fields their access allows. Nobody approves a request they made or one that changes their own terms. While a named manager’s manager is away or has left, HR approves that step.</p>${chainForm('compensation')}${chainForm('job')}</section>` : ''}
${data.mayRequestFor.length ? h`<section class="card"><h2>Request a change</h2>${form('change.request', '/app/changes/{id}', [select('Person', 'person', data.mayRequestFor.map(p => ({ value: p.id, label: p.name }))), requestFields(actor, o)], 'Submit for approval', { multipart: true })}</section>` : ''}
<section class="card"><h2>Requests</h2>${data.requests.length ? table(['Person', 'Type', 'Effective', 'Status', 'Waiting on', 'Requested by'], data.requests.map(r => [h`<a href="/app/changes/${r.id}">${r.person.name}</a>`, r.type === 'compensation' ? 'Pay change' : 'Job change', formatDate(r.effectiveFrom), tag(r.status), r.yourTurn ? h`${r.waitingOn} ${tag('your turn')}` : r.waitingOn ?? '—', r.requestedBy])) : h`<p>No change requests in your scope.</p>`}</section>`
  return page('Change requests', actor, body, { current: '/app/changes', url })
}

export async function changeRequestPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const r = await changeRequest(env, actor, id), zone = await employerZone(env)
  const body = h`<p class="back"><a href="/app/changes">← Change requests</a></p><div class="title-row"><h1>${r.type === 'compensation' ? 'Pay change' : 'Job change'} for ${r.person.name}</h1><p>${tag(r.status)} · revision ${r.revision}</p></div>
<section class="card"><h2>Requested change</h2><dl><dt>Effective from</dt><dd>${formatDate(r.effectiveFrom)}</dd><dt>Requested by</dt><dd>${r.requestedBy.name}</dd><dt>Reason</dt><dd>${r.reason}</dd></dl>
${table(['Field', 'Now', 'Requested'], r.changes.map(c => [c.field, c.from ?? '—', h`${c.to ?? '—'}${'note' in c && c.note ? h`<p class="muted">${c.note}</p>` : ''}`]))}
${r.attachments.length ? h`<h3>Attachments</h3><ul>${r.attachments.map(a => h`<li><a href="/app/changes/${r.id}?attachment=${a.sha256}">${a.filename}</a> (revision ${a.revision})</li>`)}</ul>` : ''}
${r.result ? h`<p>Approved terms version recorded${r.result.case ? h`; <a href="/app/cases/${r.result.case}">mover case started</a>` : ''}. The change is in the payroll handoff queue.</p>` : ''}</section>
<section class="card"><h2>Approval chain</h2><ol>${r.steps.map(s => h`<li>${s.label}${s.member ? ` (${s.member})` : ''} · ${tag(s.state)}${s.note ? h`<p class="muted">${s.note}</p>` : ''}</li>`)}</ol>
${r.mayDecide ? h`${form('change.decide', `/app/changes/${r.id}`, [hidden('request', r.id), hidden('state', r.state), select('Decision', 'decision', [{ value: 'approve', label: 'Approve' }, { value: 'return', label: 'Send back to the requester' }, { value: 'decline', label: 'Decline' }]), area('Comment (required to send back)', 'comment', '', false)], 'Record decision')}` : ''}</section>
${r.mayEdit ? h`<section class="card"><h2>${r.status === 'returned' ? 'Revise and resubmit' : 'Edit request'}</h2><p>Editing restarts the approval chain from its first step.</p>${form('change.edit', `/app/changes/${r.id}`, [hidden('request', r.id), hidden('state', r.state), requestFields(actor, await options(env), { ...r.fields, employmentType: r.employmentType, effectiveFrom: r.effectiveFrom, reason: r.reason, payIncreasePercent: (r.changes.find(c => c.field === 'Pay') as { percent?: string } | undefined)?.percent })], 'Resubmit', { multipart: true })}</section>` : ''}
<section class="card"><h2>History</h2><ul>${r.history.map(e => h`<li>${when(e.at, zone)} · revision ${e.revision}${e.step ? ` · step ${e.step}` : ''} · ${e.kind} by ${e.by}${e.comment ? h`: “${e.comment}”` : ''}</li>`)}</ul></section>`
  return page('Change request', actor, body, { current: '/app/changes', url })
}
