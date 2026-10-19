import { selfChangesPanel } from './self-service'
// Home (my tasks, approvals, my leave), the task inbox and a lifecycle case.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { formatDate, formatDay, hours } from '../dates'
import { employer } from '../employer'
import { one } from '../core'
import { approvals, leaveFor } from '../leave'
import { caseDetail, myTasks, templates } from '../lifecycle'
import { workflowReviewPanel } from './workflow-review'
import { followupPanel } from './work-followup'
import { area, avatar, field, form, h, hidden, page, person, select, table, tag } from './html'
import { ASSET_CONDITIONS } from './record-tables'
import { KIND_LABELS, assignee } from './labels'

function taskList(tasks: Awaited<ReturnType<typeof myTasks>>, today: string) {
  return tasks.length ? table(['Due', 'Task', 'Person', ''], tasks.map(task => [h`${formatDay(task.dueDate, today)}${task.overdue ? h` ${tag('overdue')}` : ''}`, h`${task.title}${task.failure ? h`<br><strong>Failed; still open:</strong> ${task.failure}` : ''}${task.blockedBy.length ? h`<br><span class="muted">Blocked by: ${task.blockedBy.map(t => t.title).join(', ')}</span>` : ''}${task.system ? h` <span class="muted">(${task.system})</span>` : ''}`, person(task.person), h`<a class="chip-link" href="/app/cases/${task.case}">Open ${task.kind} case</a>`])) : h`<p class="muted">Nothing waiting for you.</p>`
}

export async function homePage(env: Bindings, actor: Actor, url: URL) {
  const [company, tasks, waiting] = await Promise.all([employer(env), myTasks(env, actor), approvals(env, actor)])
  const leave = actor.personId ? await leaveFor(env, actor, actor.personId) : null
  const gettingStarted = can(actor, 'people.manage') && !await one(env, 'SELECT 1 FROM wl_people LIMIT 1')
  const body = h`<h1>${company?.name ?? 'Willow'}</h1><p class="muted">Signed in as ${actor.name}. Today is ${formatDate(actor.today)} (${company?.timezone}).</p>
<div class="grid home-grid">
${await selfChangesPanel(env,actor)}
<section class="card your-tasks"><h2><a href="/app/tasks">Your tasks</a></h2>${taskList(tasks, actor.today)}</section>
<section class="card to-decide"><h2>Leave to decide</h2>${waiting.length ? h`<ul class="people-list">${waiting.map(request => h`<li>${avatar(request.name)}<a href="/app/leave/${request.id}">${request.name}: ${formatDate(request.startDate)} – ${formatDate(request.endDate)} (${request.hours} h)</a></li>`)}</ul>` : h`<p class="muted">No requests waiting for you.</p>`}</section>
<section class="card your-leave"><h2>Your leave</h2>${leave?.accounts.length ? h`<ul class="plain">${leave.accounts.map(account => h`<li>${account.policy.name}: ${hours(account.balanceMinutes)} hours${account.openingStatus === 'proposed' ? ' (opening balance awaiting sign-off)' : ''}</li>`)}</ul>` : h`<p class="muted">${actor.personId ? 'No leave accounts yet.' : 'Your sign-in is not linked to a person record.'}</p>`}
${leave?.accounts.length || actor.personId ? h`<p class="actions">${leave?.accounts.length ? h`<a class="button" href="/app/leave">Request leave</a>` : ''}${actor.personId ? h`<a class="button secondary" href="/app/people/${actor.personId}">Your record</a>` : ''}</p>` : ''}</section>
${gettingStarted ? h`<section class="card get-started"><h2>Get started</h2><ol class="steps"><li><span><a href="/app/settings">Add locations, departments, schedules, document categories, templates and leave policies</a></span></li><li><span><a href="/app/import">Move in from BambooHR</a> or <a href="/app/people">start a joiner</a></span></li><li><span><a href="/app/access">Give people access and preview what each person sees</a></span></li></ol></section>` : ''}
</div>`
  return page('Home', actor, body, { current: '/app', url })
}

export async function tasksPage(env: Bindings, actor: Actor, url: URL) {
  return page('Tasks', actor, h`<h1>Your tasks</h1><section class="card">${taskList(await myTasks(env, actor), actor.today)}</section>${await followupPanel(env, actor)}`, { current: '/app', url })
}

export async function casePage(env: Bindings, actor: Actor, id: string, url: URL) {
  const item = await caseDetail(env, actor, id)
  const upgrades = can(actor, 'people.manage') && item.status === 'open' ? (await templates(env)).filter(t => t.family === item.template.family && t.status === 'active' && t.id !== item.template.id) : []
  const body = h`${await workflowReviewPanel(env, actor, url)}<p class="back"><a href="/app/people/${item.person.id}">← ${item.person.name}</a></p><h1>${KIND_LABELS[item.kind] ?? item.kind}: ${item.person.name}</h1>
<p>${item.template.name} (template v${item.template.version}) · from ${formatDate(item.anchorDate)} · ${tag(item.status)}</p>
${item.missing.length ? h`<section class="card"><h2>Information still needed</h2><ul>${item.missing.map(field => h`<li>${field.replace(/_/g, ' ')}</li>`)}</ul><p class="muted">Add it on <a href="/app/people/${item.person.id}">the person’s record</a>.</p></section>` : ''}
<section class="card"><h2>Tasks</h2>${table(['Due', 'Task', 'Who', 'Status', '', ''], item.tasks.map(task => [formatDate(task.dueDate), h`${task.title}${task.failure ? h`<br><strong>Failed; still open:</strong> ${task.failure}` : ''}${task.blockedBy.length ? h`<br><span class="muted">Blocked by: ${task.blockedBy.map(t => t.title).join(', ')}</span>` : ''}${task.system ? h`<br><span class="muted">System: ${task.system} — completed only with evidence; Willow does not act on it</span>` : ''}`, assignee(task.assignee), task.status === 'done' ? h`${tag('done')}${task.evidence ? h`<br><span class="muted">${task.evidence}</span>` : ''}` : tag('open'),
    task.status === 'open' && task.mine && !task.blockedBy.length ? form('task.complete', `/app/cases/${id}`, [hidden('task', task.id), ...(task.action === 'asset_return' ? [field('Returned on', 'returnedOn', { type: 'date', value: actor.today }), select('Condition on return', 'condition', ASSET_CONDITIONS)] : []), area(task.evidenceRequired ? 'Evidence (required)' : 'Note', 'evidence', '', task.evidenceRequired)], task.action === 'end_access' ? 'End access and mark done' : task.action === 'asset_return' ? 'Record return and mark done' : 'Mark done', { secondary: true }) : '', task.status === 'open' && task.mine ? h`<details><summary>Record failed work</summary>${form('task.fail', `/app/cases/${id}`, [hidden('task', task.id), area('Failure and next action', 'failure')], 'Keep task open', { secondary: true })}</details>` : '']))}</section>
${upgrades.length ? h`<section class="card"><h2>Upgrade this case</h2>${form('case.upgrade.preview', `/app/cases/${id}?review={id}`, [hidden('case', id), select('Published version', 'template', upgrades.map(t => ({ value: t.id, label: `${t.name} v${t.version}` })))], 'Review case upgrade')}</section>` : ''}
${item.upgrades.length ? h`<section class="card"><h2>Upgrade history</h2><ul>${item.upgrades.map(u => h`<li>${new Date(u.at).toISOString()} — completed work and superseded tasks retained</li>`)}</ul></section>` : ''}
${item.status === 'open' && can(actor, 'people.manage') ? h`<section class="card">${form('case.complete', `/app/cases/${id}`, [hidden('case', id)], 'Complete case')}<p class="muted">A case completes only when every task is done.</p></section>` : ''}`
  return page('Case', actor, body, { current: '/app/people', url })
}
