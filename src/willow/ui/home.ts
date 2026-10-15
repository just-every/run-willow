// Home (my tasks, approvals, my leave), the task inbox and a lifecycle case.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { formatDate, hours } from '../dates'
import { employer } from '../employer'
import { one } from '../core'
import { approvals, leaveFor } from '../leave'
import { caseDetail, myTasks } from '../lifecycle'
import { area, avatar, form, h, hidden, page, person, table, tag } from './html'

function taskList(tasks: Awaited<ReturnType<typeof myTasks>>) {
  return tasks.length ? table(['Due', 'Task', 'Person', ''], tasks.map(task => [h`${formatDate(task.dueDate)}${task.overdue ? h` ${tag('overdue')}` : ''}`, h`${task.title}${task.system ? h` <span class="muted">(${task.system})</span>` : ''}`, person(task.person), h`<a class="chip-link" href="/app/cases/${task.case}">Open ${task.kind} case</a>`])) : h`<p class="muted">Nothing waiting for you.</p>`
}

export async function homePage(env: Bindings, actor: Actor, url: URL) {
  const [company, tasks, waiting] = await Promise.all([employer(env), myTasks(env, actor), approvals(env, actor)])
  const leave = actor.personId ? await leaveFor(env, actor, actor.personId) : null
  const gettingStarted = can(actor, 'people.manage') && !await one(env, 'SELECT 1 FROM wl_people LIMIT 1')
  const body = h`<h1>${company?.name ?? 'Willow'}</h1><p class="muted">Signed in as ${actor.name}. Today is ${formatDate(actor.today)} (${company?.timezone}).</p>
<div class="grid home-grid">
<section class="card your-tasks"><h2>Your tasks</h2>${taskList(tasks)}</section>
<section class="card to-decide"><h2>Leave to decide</h2>${waiting.length ? h`<ul class="people-list">${waiting.map(request => h`<li>${avatar(request.name)}<a href="/app/leave/${request.id}">${request.name}: ${formatDate(request.startDate)} – ${formatDate(request.endDate)} (${request.hours} h)</a></li>`)}</ul>` : h`<p class="muted">No requests waiting for you.</p>`}</section>
<section class="card your-leave"><h2>Your leave</h2>${leave?.accounts.length ? h`<ul class="plain">${leave.accounts.map(account => h`<li>${account.policy.name}: ${hours(account.balanceMinutes)} hours${account.openingStatus === 'proposed' ? ' (opening balance awaiting sign-off)' : ''}</li>`)}</ul>` : h`<p class="muted">${actor.personId ? 'No leave accounts yet.' : 'Your sign-in is not linked to a person record.'}</p>`}
${leave?.accounts.length || actor.personId ? h`<p class="actions">${leave?.accounts.length ? h`<a class="button" href="/app/leave">Request leave</a>` : ''}${actor.personId ? h`<a class="button secondary" href="/app/people/${actor.personId}">Your record</a>` : ''}</p>` : ''}</section>
${gettingStarted ? h`<section class="card get-started"><h2>Get started</h2><ol class="steps"><li><span><a href="/app/settings">Add locations, departments, schedules, document categories, templates and leave policies</a></span></li><li><span><a href="/app/import">Move in from BambooHR</a> or <a href="/app/people">start a joiner</a></span></li><li><span><a href="/app/access">Give people access and preview what each person sees</a></span></li></ol></section>` : ''}
</div>`
  return page('Home', actor, body, { current: '/app', url, art: 'frond' })
}

export async function tasksPage(env: Bindings, actor: Actor, url: URL) {
  return page('Tasks', actor, h`<h1>Your tasks</h1><section class="card">${taskList(await myTasks(env, actor))}</section>`, { current: '/app', url })
}

export async function casePage(env: Bindings, actor: Actor, id: string, url: URL) {
  const item = await caseDetail(env, actor, id)
  const body = h`<p class="back"><a href="/app/people/${item.person.id}">← ${item.person.name}</a></p><h1>${item.kind[0].toUpperCase()}${item.kind.slice(1)}: ${item.person.name}</h1>
<p>${item.template.name} (template v${item.template.version}) · from ${formatDate(item.anchorDate)} · ${tag(item.status)}</p>
${item.missing.length ? h`<section class="card"><h2>Information still needed</h2><ul>${item.missing.map(field => h`<li>${field.replace(/_/g, ' ')}</li>`)}</ul><p class="muted">Add it on <a href="/app/people/${item.person.id}">the person’s record</a>.</p></section>` : ''}
<section class="card"><h2>Tasks</h2>${table(['Due', 'Task', 'Who', 'Status', ''], item.tasks.map(task => [formatDate(task.dueDate), h`${task.title}${task.system ? h`<br><span class="muted">System: ${task.system} — completed only with evidence; Willow does not act on it</span>` : ''}`, task.assignee, task.status === 'done' ? h`${tag('done')}${task.evidence ? h`<br><span class="muted">${task.evidence}</span>` : ''}` : tag('open'),
    task.status === 'open' && task.mine ? form('task.complete', `/app/cases/${id}`, [hidden('task', task.id), area(task.evidenceRequired ? 'Evidence (required)' : 'Note', 'evidence', '', task.evidenceRequired)], task.action === 'end_access' ? 'End access and mark done' : 'Mark done', { secondary: true }) : '']))}</section>
${item.status === 'open' && can(actor, 'people.manage') ? h`<section class="card">${form('case.complete', `/app/cases/${id}`, [hidden('case', id)], 'Complete case')}<p class="muted">A case completes only when every task is done.</p></section>` : ''}`
  return page('Case', actor, body, { current: '/app/people', url })
}
