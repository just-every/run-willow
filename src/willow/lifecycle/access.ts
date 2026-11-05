// A reviewed template's local action authorizes only this case's access teardown.
// Native status/version triggers invalidate credentials; the task and teardown
// share one batch so a refused completion cannot partially end access.
import type { Bindings } from '../../auth.server'
import { actorFor, type Actor } from '../actor'
import { guard, insist, now, one, stmt, type Row } from '../core'
import { answersFor, taskAssignments } from './tasks'

export async function taskEndAccessStatements(env: Bindings, actor: Actor, task: Row, caseRow: Row): Promise<D1PreparedStatement[]> {
  insist(task.action === 'end_access' && task.status === 'open' && !task.superseded_at && caseRow.status === 'open', 'task_not_open', 409)
  const snapshot = (await one(env, 'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
  const member = await one(env, `SELECT m.*,o.id AS operator_id,o.role,o.version FROM wl_members m
    LEFT JOIN wl_agent_people b ON b.member_id=m.id
    JOIN oa_operators o ON o.id=b.operator_id OR (b.operator_id IS NULL AND lower(o.email)=m.email) WHERE m.id=?`, actor.id)
  insist(member, 'forbidden', 403)
  const current = await actorFor(env, { id: member.id, email: member.email, name: member.name, owner: member.role === 'owner', personId: member.person_id, sessionId: actor.sessionId })
  const [assigned] = await taskAssignments(env, [task], current.today, caseRow)
  insist(answersFor(current, assigned, caseRow), 'not_your_task', 403)
  const statements = [
    guard(env, 'access_changed', '(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?', snapshot),
    guard(env, 'access_changed', `EXISTS(SELECT 1 FROM wl_members m LEFT JOIN wl_agent_people b ON b.member_id=m.id
      JOIN oa_operators o ON o.id=b.operator_id OR (b.operator_id IS NULL AND lower(o.email)=m.email)
      WHERE o.id=? AND m.id=? AND m.status='active' AND o.status='active' AND o.version=? AND o.role=?)`, member.operator_id, actor.id, member.version, member.role),
    guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_case_tasks t JOIN wl_cases c ON c.id=t.case_id WHERE t.id=? AND t.action='end_access' AND t.status='open' AND t.superseded_at IS NULL AND c.id=? AND c.revision=? AND c.status='open')", task.id, caseRow.id, caseRow.revision),
  ]
  if (actor.sessionId) statements.push(guard(env, 'access_changed', "EXISTS(SELECT 1 FROM oa_sessions WHERE id=? AND operator_id=? AND operator_version=? AND revoked_at IS NULL AND expires_at>?)", actor.sessionId, member.operator_id, member.version, now()))
  const target = await one(env, `SELECT m.id,m.status,m.person_id,o.id AS operator_id,o.role,o.version FROM wl_members m
    LEFT JOIN wl_agent_people b ON b.member_id=m.id
    LEFT JOIN oa_operators o ON o.id=b.operator_id OR (b.operator_id IS NULL AND lower(o.email)=m.email) WHERE m.person_id=?`, caseRow.person_id)
  if (!target) return [...statements, guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM wl_members WHERE person_id=?)', caseRow.person_id)]
  insist(target.role !== 'owner', 'owner_access_fixed', 409)
  statements.push(guard(env, 'stale', `EXISTS(SELECT 1 FROM wl_members m LEFT JOIN wl_agent_people b ON b.member_id=m.id
    LEFT JOIN oa_operators o ON o.id=b.operator_id OR (b.operator_id IS NULL AND lower(o.email)=m.email)
    WHERE m.id=? AND m.person_id=? AND m.status=? AND o.id IS ?)`, target.id, caseRow.person_id, target.status, target.operator_id))
  if (target.operator_id) statements.push(
    guard(env, 'owner_access_fixed', "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role<>'owner')", target.operator_id, target.version),
    // The native oa_operator_version trigger invalidates every outstanding link and credential.
    stmt(env, "UPDATE oa_operators SET status='inactive' WHERE id=?", target.operator_id),
    stmt(env, 'UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?', now(), target.operator_id),
  )
  else statements.push(guard(env, 'stale', 'NOT EXISTS(SELECT 1 FROM oa_operators o JOIN wl_members m ON lower(o.email)=m.email WHERE m.id=?)', target.id))
  statements.push(
    stmt(env, 'DELETE FROM wl_hiring_team WHERE member_id=?', target.id),
    stmt(env, 'DELETE FROM wl_member_levels WHERE member_id=?', target.id),
    stmt(env, 'DELETE FROM wl_permissions WHERE member_id=?', target.id),
    stmt(env, "UPDATE wl_members SET status='ended' WHERE id=?", target.id),
  )
  return statements
}
