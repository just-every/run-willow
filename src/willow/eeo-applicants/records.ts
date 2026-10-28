// Individually read only after explicit closure, by explicit compliance members outside the team.
import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, commit, guard, insist } from '../core'
import { answers } from './answers'
import { application, APPLICATION_JOIN, identity } from './store'
import type { ApplicantRecord, ApplicationOutcome, ApplicationRow } from './types'

const COMPLIANCE = `EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators p ON p.id=m.operator_id
  WHERE m.id=? AND m.status='active' AND p.status='active'
  AND EXISTS(SELECT 1 FROM wl_effective_permissions WHERE member_id=m.id AND permission='eeo.individual'))`

function recordGuard(env: Bindings, actor: Actor, app: ApplicationRow) {
  return guard(env, 'applicant_record_unavailable', `${COMPLIANCE}
    AND EXISTS(SELECT 1 FROM ${APPLICATION_JOIN} WHERE a.id=? AND a.revision=? AND o.revision=? AND c.outcome=? AND c.closed_at=?
      AND NOT EXISTS(SELECT 1 FROM wl_hiring_team t WHERE t.opening_id=a.opening_id AND t.member_id=?))`,
    actor.id, app.id, app.revision, app.opening_revision, app.outcome, app.closed_at, actor.id)
}

export async function applicantRecord(env: Bindings, actor: Actor, applicationId: string): Promise<ApplicantRecord> {
  requirePermission(actor, 'eeo.individual')
  const app = await application(env, applicationId)
  insist(app.outcome && app.closed_at !== null, 'applicant_record_unavailable', 404)
  // Authorize before reading answers, then recheck current closure, admission and team atomically with the read audit.
  await commit(env, [recordGuard(env, actor, app)], { actor: actor.id, action: 'eeo.applicant.authorize', subject: app.id })
  const history = await answers(env, app.id)
  await commit(env, [recordGuard(env, actor, app)], { actor: actor.id, action: 'eeo.applicant.individual.read', subject: app.id })
  return { application: identity(app), closed: { outcome: app.outcome, closedAt: app.closed_at }, current: history[0] ?? null, history }
}

/** A closed-record picker, never an opening aggregate, count of answers, or selection-progress signal. */
export async function applicantRecordsList(env: Bindings, actor: Actor) {
  requirePermission(actor, 'eeo.individual')
  const rows = await all<{ id: string; name: string; opening: string; outcome: ApplicationOutcome; closedAt: number }>(env,
    `SELECT a.id,a.name,o.name AS opening,c.outcome,c.closed_at AS closedAt FROM ${APPLICATION_JOIN}
    WHERE c.application_id IS NOT NULL AND ${COMPLIANCE}
    AND NOT EXISTS(SELECT 1 FROM wl_hiring_team t WHERE t.opening_id=a.opening_id AND t.member_id=?)
    ORDER BY c.closed_at DESC,a.id`, actor.id, actor.id)
  // Fence all returned rows in one statement, including a team change during the read.
  await commit(env, [guard(env, 'applicant_record_unavailable', `${COMPLIANCE}
    AND NOT EXISTS(SELECT 1 FROM json_each(?) picked WHERE NOT EXISTS(
      SELECT 1 FROM ${APPLICATION_JOIN} WHERE a.id=picked.value AND c.application_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM wl_hiring_team WHERE opening_id=a.opening_id AND member_id=?)))`,
    actor.id, JSON.stringify(rows.map(row => row.id)), actor.id),
  ], { actor: actor.id, action: 'eeo.applicant.list.read', subject: 'applications' })
  return rows
}
