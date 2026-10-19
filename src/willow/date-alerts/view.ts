// PEOPLE-004 reads: the scoped upcoming-dates list (each alerted date from
// today through the alert's longest lead time, for people whose date the
// reader may read now, with its owner and due date), the reader's own in-app
// alerts and review tasks, and HR's alert settings. Alerts never carry the
// date to anyone who cannot read the field today.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, json } from '../core'
import { addDays } from '../dates'
import { displayName } from '../people'
import { effectiveFieldDefinitions } from '../custom-fields/store'
import { recordTables } from '../record-tables/schema'
import { activeAlerts, answersTask, ROLE_LABELS } from './alerts'
import { dateSource, managerMember } from './sources'

async function names(env: Bindings) {
  return new Map((await all(env, 'SELECT id, legal_name, preferred_name FROM wl_people')).map(p => [p.id, displayName(p)]))
}

export async function upcomingDates(env: Bindings, actor: Actor) {
  const people = await names(env), members = new Map((await all(env, 'SELECT id, name FROM wl_members')).map(m => [m.id, m.name]))
  const upcoming = []
  for (const alert of await activeAlerts(env)) {
    const source = await dateSource(env, alert.source, actor.today).catch(() => null)
    if (!source) continue
    const until = addDays(actor.today, Math.max(...json<number[]>(alert.leads_json, [0])))
    const first = json<string[]>(alert.recipients_json, [])[0]
    for (const due of await source.dates(actor.today)) {
      if (due.date < actor.today || due.date > until || !source.reads(actor, due.personId)) continue
      const owner = first === 'manager' ? members.get(await managerMember(env, due.personId, actor.today) ?? '') ?? 'Manager (none assigned)' : first.startsWith('member:') ? members.get(first.slice(7)) ?? 'Named member' : ROLE_LABELS[first]
      upcoming.push({ alert: alert.id, label: alert.label, person: { id: due.personId, name: people.get(due.personId) }, date: due.date, dueDate: due.date, owner })
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date))
  const mine = await all(env, `SELECT d.channel, d.status, d.created_at, f.alert_id, f.person_id, f.date, f.lead_days, a.label, a.source FROM wl_date_alert_deliveries d JOIN wl_date_alert_fires f ON f.id = d.fire_id
    JOIN wl_date_alerts a ON a.id = f.alert_id WHERE d.member_id = ? AND d.channel = 'in_app' ORDER BY d.created_at DESC LIMIT 100`, actor.id)
  const alerts = []
  for (const row of mine) {
    // Current visibility governs re-reading an earlier alert too.
    const source = await dateSource(env, row.source, actor.today).catch(() => null)
    if (source?.reads(actor, row.person_id)) alerts.push({ label: row.label, person: { id: row.person_id, name: people.get(row.person_id) }, date: row.date, leadDays: row.lead_days, at: row.created_at })
  }
  const tasks = []
  for (const task of await all(env, "SELECT * FROM wl_date_alert_tasks WHERE status = 'open' ORDER BY date")) if (await answersTask(env, actor, task)) tasks.push({ id: task.id, title: task.title, person: { id: task.person_id, name: people.get(task.person_id) }, dueDate: task.date })
  return { upcoming, alerts, tasks, settings: can(actor, 'people.manage') ? await alertSettings(env, actor.today) : null }
}

async function alertSettings(env: Bindings, date: string) {
  const fields = (await effectiveFieldDefinitions(env, date)).filter(f => f.type === 'date').map(f => ({ value: `custom:${f.key}`, label: f.label }))
  const columns = (await recordTables(env)).filter(t => !t.current.retired).flatMap(t => t.current.columns.filter(c => c.type === 'date').map(c => ({ value: `table:${t.key}.${c.key}`, label: `${t.current.label}: ${c.label}` })))
  const alerts = (await all(env, 'SELECT * FROM wl_date_alerts ORDER BY recorded_at DESC')).map(a => ({ id: a.id, label: a.label, source: a.source, leads: json<number[]>(a.leads_json, []), recipients: json<string[]>(a.recipients_json, []), channels: json<string[]>(a.channels_json, []), task: a.task_title ? { title: a.task_title, assignee: a.task_assignee } : null, status: a.status }))
  return { sources: [{ value: 'start', label: 'Work anniversary' }, { value: 'end', label: 'Employment end date' }, ...fields, ...columns], alerts }
}
