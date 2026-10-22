import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { commit, guard, insist, now, stmt } from '../core'
import type { Input } from '../input'
import { application, hrGuard } from './store'
import type { ApplicationOutcome } from './types'

/** An explicit closure, with no interpretation of the employer's custom stage names. */
export async function closeApplication(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['application', 'revision', 'openingRevision', 'outcome', 'returnTo'])
  const app = await application(env, input.text('application', { max: 64 }))
  const revision = input.integer('revision', { min: 1 }), openingRevision = input.integer('openingRevision', { min: 1 })
  const outcome = input.text('outcome', { max: 16 }) as ApplicationOutcome
  insist(['hired', 'rejected', 'withdrawn'].includes(outcome), 'invalid_outcome')
  insist(app.revision === revision && app.opening_revision === openingRevision, 'stale', 409)
  insist(!app.outcome, 'application_closed', 409)
  const at = now()
  await commit(env, [hrGuard(env, actor, app),
    guard(env, 'application_closed', 'NOT EXISTS(SELECT 1 FROM wl_hiring_closures WHERE application_id=?)', app.id),
    stmt(env, 'INSERT INTO wl_hiring_closures(application_id,outcome,closed_at,closed_by) VALUES (?,?,?,?)', app.id, outcome, at, actor.id),
    stmt(env, 'UPDATE wl_hiring_applications SET revision=revision+1 WHERE id=?', app.id),
    stmt(env, `UPDATE wl_applicant_eeo_invitations SET revoked_at=?,revoked_by=? WHERE application_id=? AND revoked_at IS NULL
      AND (?<>'hired' OR phase='pre-offer')`, at, actor.id, app.id, outcome),
  ], { actor: actor.id, action: 'hiring.close', subject: app.id, detail: { outcome } })
  return { id: app.id, outcome, closedAt: at, revision: app.revision + 1 }
}
