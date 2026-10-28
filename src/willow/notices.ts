// Fixed copy only. No person names, task titles, decisions, or evidence enter mail.
import type { Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'
import { actorFor, can, type Actor } from './actor'
import { all, newId, now, one, stmt, type Row } from './core'
import { answersFor } from './lifecycle'
import { esc } from './ui/html'
import { connectionSettings } from './connections'

const COPY: Record<string, string> = {
  assignment: 'There is assigned work to review in Willow.',
  completion: 'Assigned work has been completed in Willow.',
  leave: 'A leave decision is ready to review in Willow.',
  payroll: 'A payroll handoff is ready to review in Willow.',
}

async function deliver(env: Bindings, recipient: Actor, kind: string, subject: string, path: string, allowed: (actor: Actor) => boolean) {
  const id = newId()
  await stmt(env, "INSERT INTO wl_notices(id,kind,subject,recipient,status,created_at) VALUES(?,?,?,?,'pending',?)", id, kind, subject, recipient.id, now()).run()
  let status = 'failed', failure: string | null = 'mail_unavailable'
  try {
    // Recheck admission immediately before sending; never mail an ended member.
    const current = await one(env, 'SELECT o.role FROM oa_operators o JOIN wl_members m ON m.operator_id=o.id WHERE m.id=?', recipient.id)
    const fresh = await actorFor(env, { ...recipient, owner: current?.role === 'owner' })
    if (!allowed(fresh)) {
      await stmt(env, "UPDATE wl_notices SET status='refused', failure='recipient_access_changed' WHERE id=?", id).run()
      return {id,status:'refused',failure:'recipient_access_changed'}
    }
    const sender = operatorMail(env)
    if (sender && env.MAIL_FROM) {
      const result = await sender.send({ deliveryId: id, from: env.MAIL_FROM, to: [recipient.email], subject: 'Willow: an update is ready', html: `<p>${COPY[kind]}</p><p><a href="${esc(env.AUTH_ORIGIN + path)}">Sign in to Willow</a></p>`, text: `${COPY[kind]}\n\nSign in to view it: ${env.AUTH_ORIGIN}${path}\n`, headers: { 'Auto-Submitted': 'auto-generated' } })
      if (result?.status === 'accepted' || result?.status === 'development' && env.AUTH_LOCAL === 'true') { status = result.status; failure = null }
      else { status = 'refused'; failure = 'mail_refused' }
    }
  } catch { failure = 'mail_failed' }
  await stmt(env, 'UPDATE wl_notices SET status = ?, failure = ? WHERE id = ?', status, failure, id).run()
  return { id, status, failure }
}

/** Post-commit delivery failure never turns a successful business action into a failed action. */
export async function notifyAction(env: Bindings, action: string, result: any) {
  if (!['joiner.start', 'mover.schedule', 'leaver.start', 'task.complete', 'leave.decide', 'payroll.draft', 'proposal.decide'].includes(action)) return undefined
  try {
    if (!(await connectionSettings(env))?.notices) return undefined
    const members = await all(env, "SELECT m.id,m.email,m.name,m.person_id,o.role FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.status='active' AND o.status='active'")
    const recipients: Actor[] = []
    for (const m of members) recipients.push(await actorFor(env, { id: m.id, email: m.email, name: m.name, personId: m.person_id, owner: m.role === 'owner', sessionId: '' }))
    let kind = '', subject = '', path = '', allowed: (a: Actor) => boolean = () => false
    const caseId = result.case ?? result.receipt?.result?.case
    if (caseId) {
      const c = await one(env, 'SELECT * FROM wl_cases WHERE id=?', caseId)
      if (!c) return undefined
      const tasks = await all(env, 'SELECT * FROM wl_case_tasks WHERE case_id=? AND superseded_at IS NULL', caseId)
      kind = action === 'task.complete' ? 'completion' : 'assignment'
      subject = caseId; path = '/app/tasks'
      allowed = a => tasks.some(t => (kind === 'assignment' ? t.status === 'open' : t.id === result.id) && answersFor(a, t, c))
    } else if (action === 'leave.decide') {
      const r = await one(env, 'SELECT person_id FROM wl_leave_requests WHERE id=?', result.id)
      kind = 'leave'; subject = result.id; path = `/app/leave/${result.id}`
      allowed = a => a.personId === r?.person_id
    } else if (action === 'payroll.draft') {
      if (result.exceptions !== 0) return undefined
      kind = 'payroll'; subject = result.id; path = `/app/payroll/${result.id}`
      allowed = a => can(a, 'payroll.handoff') && can(a, 'pay.read')
    } else return undefined
    const delivery = []
    for (const recipient of recipients.filter(allowed)) delivery.push(await deliver(env, recipient, kind, subject, path, allowed))
    return { deliveries: delivery }
  } catch { return { failure: 'notice_delivery_failed', message: 'Saved. Notice delivery failed; continue the work in Willow.' } }
}
