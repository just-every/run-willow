import { sendFixedNotice } from '../locale/notices'
// PEOPLE-004 date alerts. HR (people.manage) names a date source, lead times
// in days, recipients by role (HR = people.manage holders, the person's
// manager in force on the day it fires, the employee, or a named member) and
// channels (in-app, and email under WIL-18). On each scheduler tick in the
// employer's time zone, an alert fires for a date once the day reaches
// date minus a lead time and the date is today or later; only the smallest
// lead time already reached fires, once per alert, person, item, date and lead
// time, so restarts never repeat it and a moved date starts afresh. Each
// recipient is rechecked against the field's visibility when it fires; email
// carries fixed text and a link, never the field, person or date. Retired
// alerts and people without current or upcoming employment fire nothing.
// Slack/Teams delivery is COMMS-001's to add before it ships.
import type { Bindings } from '../../auth.server'
import { operatorMail } from '../../mail.server.mjs'
import { can, employerZone, requirePermission, type Actor } from '../actor'
import { connectionSettings } from '../connections'
import { all, commit, insist, json, newId, now, one, stmt, type Row } from '../core'
import { addDays, today } from '../dates'
import type { Input } from '../input'
import { esc } from '../ui/html'
import { workMembers } from '../work-sources'
import { dateSource, managerMember, type DueDate } from './sources'

export const CHANNELS = ['in_app', 'email'] as const
export const ROLE_LABELS: Record<string, string> = { hr: 'HR', manager: 'Manager', employee: 'Employee' }

export async function defineAlert(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const source = input.text('source', { max: 200 })
  const info = await dateSource(env, source, actor.today)
  const leads = [...new Set(input.list('leadDays').flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean).map(Number))].sort((a, b) => b - a)
  insist(leads.length >= 1 && leads.length <= 6 && leads.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 365), 'invalid_leadDays')
  const recipients = [...new Set(input.list('recipients'))]
  insist(recipients.length >= 1 && recipients.length <= 6, 'invalid_recipients')
  for (const r of recipients) {
    if (r.startsWith('member:')) insist(await one(env, 'SELECT 1 FROM wl_members WHERE id = ?', r.slice(7)), 'member_not_found', 404)
    else insist(r in ROLE_LABELS, 'invalid_recipients')
  }
  const channels = [...new Set(input.list('channels'))]
  insist(channels.length >= 1 && channels.every(c => (CHANNELS as readonly string[]).includes(c)), 'invalid_channels')
  const taskTitle = input.text('taskTitle', { optional: true, max: 160 }) || null
  const taskAssignee = taskTitle ? input.text('taskAssignee', { max: 10 }) : null
  insist(!taskTitle || taskAssignee === 'hr' || taskAssignee === 'manager', 'invalid_taskAssignee')
  const id = newId()
  await commit(env, [stmt(env, "INSERT INTO wl_date_alerts (id, label, source, leads_json, recipients_json, channels_json, task_title, task_assignee, status, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
    id, input.text('label', { optional: true, max: 120 }) || info.label, source, JSON.stringify(leads), JSON.stringify(recipients), JSON.stringify(channels), taskTitle, taskAssignee, actor.id, now())],
    { actor: actor.id, action: 'dateAlert.define', subject: id, detail: { source, leads, recipients, channels, task: !!taskTitle } })
  return { id }
}

export async function retireAlert(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const id = input.text('alert', { max: 100 })
  insist(await one(env, "SELECT 1 FROM wl_date_alerts WHERE id = ? AND status = 'active'", id), 'not_found', 404)
  await commit(env, [stmt(env, "UPDATE wl_date_alerts SET status = 'retired', retired_by = ?, retired_at = ? WHERE id = ? AND status = 'active'", actor.id, now(), id),
    stmt(env, "UPDATE wl_date_alert_tasks SET status = 'cancelled', closed_at = ? WHERE alert_id = ? AND status = 'open'", now(), id)], { actor: actor.id, action: 'dateAlert.retire', subject: id })
  return { id, status: 'retired' }
}

export async function activeAlerts(env: Bindings) {
  return await all(env, "SELECT * FROM wl_date_alerts WHERE status = 'active' ORDER BY recorded_at")
}

/** Recipients holding the role who may read the field for that person now. */
async function recipientsFor(env: Bindings, alert: Row, due: DueDate, members: Actor[], reads: (a: Actor, p: string) => boolean, date: string, roles = json<string[]>(alert.recipients_json, [])) {
  const manager = roles.includes('manager') ? await managerMember(env, due.personId, date) : null
  return members.filter(a => roles.some(r => r === 'hr' ? can(a, 'people.manage') : r === 'manager' ? a.id === manager : r === 'employee' ? a.personId === due.personId : r === `member:${a.id}`)
    && reads(a, due.personId))
}

/** The smallest lead time already reached for a date, if the date has not passed. */
export const reachedLead = (leads: number[], due: string, date: string) => due >= date ? leads.filter(lead => addDays(due, -lead) <= date).sort((a, b) => a - b)[0] : undefined

export async function runDateAlerts(env: Bindings, instant = now()) {
  const date = today(await employerZone(env), instant), members = await workMembers(env)
  let fired = 0
  const current = new Set<string>()
  for (const alert of await activeAlerts(env)) {
    const source = await dateSource(env, alert.source, date).catch(() => null)
    if (!source) continue
    const leads = json<number[]>(alert.leads_json, [])
    for (const due of await source.dates(date)) {
      current.add(`${alert.id}|${due.personId}|${due.item}|${due.date}`)
      const lead = reachedLead(leads, due.date, date)
      if (lead === undefined) continue
      const fireId = newId()
      const claim = await stmt(env, 'INSERT OR IGNORE INTO wl_date_alert_fires (id, alert_id, person_id, item, date, lead_days, fired_at) VALUES (?, ?, ?, ?, ?, ?, ?)', fireId, alert.id, due.personId, due.item, due.date, lead, instant).run()
      if (!claim.meta.changes) continue
      fired++
      const recipients = await recipientsFor(env, alert, due, members, source.reads, date)
      const channels = json<string[]>(alert.channels_json, [])
      const statements = recipients.flatMap(a => channels.map(channel => stmt(env, 'INSERT INTO wl_date_alert_deliveries (id, fire_id, member_id, channel, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), fireId, a.id, channel, channel === 'in_app' ? 'delivered' : 'claimed', instant)))
      if (alert.task_title) statements.push(stmt(env, "INSERT OR IGNORE INTO wl_date_alert_tasks (id, alert_id, person_id, item, date, title, assignee, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)", newId(), alert.id, due.personId, due.item, due.date, alert.task_title, alert.task_assignee, instant))
      await commit(env, statements, { actor: 'scheduler', action: 'dateAlert.fire', subject: alert.id, detail: { fire: fireId, lead, recipients: recipients.map(a => a.id) } })
      if (channels.includes('email')) for (const a of recipients) await email(env, fireId, a)
    }
  }
  // A moved date, a retired alert or a person who left no longer has open review work.
  for (const task of await all(env, "SELECT id, alert_id, person_id, item, date FROM wl_date_alert_tasks WHERE status = 'open'"))
    if (!current.has(`${task.alert_id}|${task.person_id}|${task.item}|${task.date}`)) await stmt(env, "UPDATE wl_date_alert_tasks SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'", instant, task.id).run()
  return { fired }
}

async function email(env: Bindings, fireId: string, member: Actor) {
  let status = 'disabled', failure: string | null = 'notices_disabled'
  if ((await connectionSettings(env))?.notices) {
    const sender = operatorMail(env)
    if (!sender || !env.MAIL_FROM) { status = 'failed'; failure = 'mail_unavailable' }
    else try {
      // Fixed content and authenticated link only; never the field, its value, the person or the date.
      const path = env.AUTH_ORIGIN + '/app/dates'
      const result = await sendFixedNotice(env,'member',member.id,sender,{ deliveryId: `${fireId}:${member.id}`, from: env.MAIL_FROM, to: [member.email], subject: 'Willow: an employee date needs attention', html: `<p>An employee date you follow is coming up in Willow.</p><p><a href="${esc(path)}">Sign in to Willow</a></p>`, text: `An employee date you follow is coming up in Willow.\n\nSign in to Willow: ${path}\n`, headers: { 'Auto-Submitted': 'auto-generated' } })
      if (result?.status === 'accepted' || (result?.status === 'development' && env.AUTH_LOCAL === 'true')) { status = result.status; failure = null }
      else if (result?.status === 'uncertain') { status = 'uncertain'; failure = 'mail_outcome_uncertain' }
      else { status = 'refused'; failure = 'mail_refused' }
    } catch { status = 'uncertain'; failure = 'mail_outcome_uncertain' }
  }
  await stmt(env, "UPDATE wl_date_alert_deliveries SET status = ?, failure = ? WHERE fire_id = ? AND member_id = ? AND channel = 'email'", status, failure, fireId, member.id).run()
}

/** Who answers for a review task: its role holder who may read the date now. */
export async function answersTask(env: Bindings, actor: Actor, task: Row) {
  const alert = (await one(env, 'SELECT * FROM wl_date_alerts WHERE id = ?', task.alert_id))!
  const source = await dateSource(env, alert.source, actor.today).catch(() => null)
  if (!source || actor.personId === task.person_id || !source.reads(actor, task.person_id)) return false
  return task.assignee === 'hr' ? can(actor, 'people.manage') : actor.id === await managerMember(env, task.person_id, actor.today)
}

export async function completeAlertTask(env: Bindings, actor: Actor, input: Input) {
  const task = await one(env, "SELECT * FROM wl_date_alert_tasks WHERE id = ?", input.text('task', { max: 100 }))
  insist(task && await answersTask(env, actor, task), 'not_found', 404)
  insist(task.status === 'open', 'task_closed', 409)
  const evidence = input.text('evidence', { max: 1000 })
  await commit(env, [stmt(env, "UPDATE wl_date_alert_tasks SET status = 'done', closed_by = ?, closed_at = ?, evidence = ? WHERE id = ? AND status = 'open'", actor.id, now(), evidence, task.id)], { actor: actor.id, action: 'dateAlert.task.complete', subject: task.id })
  return { id: task.id, status: 'done' }
}

