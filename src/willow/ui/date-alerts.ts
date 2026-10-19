// PEOPLE-004 page: upcoming dates in the reader's scope, their own alerts and
// review tasks, and HR's alert settings.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all } from '../core'
import { formatDate } from '../dates'
import { CHANNELS, ROLE_LABELS } from '../date-alerts/alerts'
import { upcomingDates } from '../date-alerts/view'
import { area, checks, field, form, h, hidden, page, select, table, tag } from './html'

export async function datesPage(env: Bindings, actor: Actor, url: URL) {
  const data = await upcomingDates(env, actor)
  const members = data.settings ? await all(env, "SELECT id, name FROM wl_members WHERE status = 'active' ORDER BY name") : []
  const settings = data.settings ? h`<section class="card"><h2>Date alerts</h2><p>Each recipient is rechecked against the field’s visibility when an alert fires; email carries no field, person or date.</p>
${data.settings.alerts.length ? table(['Alert', 'Lead times', 'Recipients', 'Status', ''], data.settings.alerts.map(a => [h`${a.label}${a.task ? h`<p class="muted">Opens “${a.task.title}” for ${ROLE_LABELS[a.task.assignee]}</p>` : ''}`, a.leads.map(n => `${n} days`).join(', '), a.recipients.map(r => ROLE_LABELS[r] ?? members.find(m => `member:${m.id}` === r)?.name ?? 'Named member').join(', '), tag(a.status), a.status === 'active' ? form('dateAlert.retire', '/app/dates', [hidden('alert', a.id)], 'Retire', { secondary: true }) : ''])) : h`<p>No alerts yet.</p>`}
<details><summary>Add an alert</summary>${form('dateAlert.define', '/app/dates', [select('Date', 'source', data.settings.sources), field('Label', 'label', { required: false }), field('Lead times (days before, comma separated)', 'leadDays', { value: '30, 7' }),
  checks('Recipients', 'recipients', [...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })), ...members.map(m => ({ value: `member:${m.id}`, label: m.name }))], ['hr']),
  checks('Channels', 'channels', CHANNELS.map(c => ({ value: c, label: c === 'in_app' ? 'In Willow' : 'Email (when notices are on)' })), ['in_app']),
  field('Review task to open (optional)', 'taskTitle', { required: false }), select('Task owner', 'taskAssignee', [{ value: 'hr', label: 'HR' }, { value: 'manager', label: 'Manager' }], 'hr', { required: false })], 'Save alert')}</details></section>` : ''
  const body = h`<h1>Upcoming dates</h1><p>Dates with an alert, for the people and fields you may read.</p>
<section class="card"><h2>Coming up</h2>${data.upcoming.length ? table(['Date', 'What', 'Person', 'Owner'], data.upcoming.map(u => [formatDate(u.date), u.label, h`<a href="/app/people/${u.person.id}">${u.person.name}</a>`, u.owner])) : h`<p>Nothing coming up in your scope.</p>`}</section>
${data.tasks.length ? h`<section class="card"><h2>Review tasks</h2>${table(['Due', 'Task', 'Person', ''], data.tasks.map(t => [formatDate(t.dueDate), t.title, t.person.name, form('dateAlert.task', '/app/dates', [hidden('task', t.id), area('Outcome', 'evidence')], 'Mark done', { secondary: true })]))}</section>` : ''}
<section class="card"><h2>Your alerts</h2>${data.alerts.length ? h`<ul>${data.alerts.map(a => h`<li>${a.label} for ${a.person.name}: ${formatDate(a.date)} (${a.leadDays} days ahead)</li>`)}</ul>` : h`<p>No alerts for you yet.</p>`}</section>${settings}`
  return page('Upcoming dates', actor, body, { current: '/app/dates', url })
}
