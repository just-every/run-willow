import type { Bindings } from '../auth.server'
import { actorFor, requirePermission, type Actor } from './actor'
import { all, guard, insist, one, WillowError, type Row } from './core'
import { connectionSettings } from './connections'
import { aiSettings } from './ai-provider'
import type { Assignee } from './lifecycle'
import { validateTaskRule } from './workflow-rules'

interface SourceTask extends Row {
  position: number; title: string; assignee: Assignee; due_offset_days: number
  evidence_required: number; system: string | null; action: string | null; rule: string
}
export interface WorkflowSource {
  template: { id: string; family_id: string; name: string; version: number; kind: string; required_fields: string }
  tasks: SourceTask[]
  connections: { revision: string | null; model: string | null; oidc: number; notices: number; aiRevision: string }
}

export async function workflowSource(env: Bindings, id: string): Promise<WorkflowSource> {
  const template = await one<WorkflowSource['template']>(env, "SELECT id,family_id,name,version,kind,required_fields FROM wl_templates WHERE id=? AND status='active' AND publication='published'", id)
  insist(template, 'workflow_source_stale', 409)
  const tasks = await all<SourceTask>(env, 'SELECT position,title,assignee,due_offset_days,evidence_required,system,action,rule FROM wl_template_tasks WHERE template_id=? ORDER BY position', id)
  insist(tasks.length > 0 && tasks.length <= 40, 'workflow_source_invalid')
  tasks.forEach((task, index) => {
    insist(task.position === index + 1, 'workflow_source_invalid')
    validateTaskRule(JSON.parse(task.rule), task.position)
  })
  const settings = await connectionSettings(env), ai = await aiSettings(env)
  return { template, tasks, connections: { revision: settings.revision ?? null, model: settings.model ?? null, oidc: settings.oidc, notices: settings.notices, aiRevision: ai.revision } }
}

export async function requireWorkflowSource(env: Bindings, source: WorkflowSource) {
  insist(JSON.stringify(await workflowSource(env, source.template.id)) === JSON.stringify(source), 'workflow_source_stale', 409)
}

export async function workflowSourceChanged(env: Bindings, source: WorkflowSource) {
  try { await requireWorkflowSource(env, source); return false }
  catch (error) { if (error instanceof WillowError && error.code === 'workflow_source_stale') return true; throw error }
}

/** Fresh employer-wide HR admission; a historical review never restores access. */
export async function workflowAuthority(env: Bindings, actor: Actor) {
  const row = await one(env, `SELECT m.id,m.email,m.name,m.person_id,o.role FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=?`, actor.id)
  insist(row, 'forbidden', 403)
  const current = await actorFor(env, { id: row.id, email: row.email, name: row.name, personId: row.person_id, owner: row.role === 'owner', sessionId: actor.sessionId })
  requirePermission(current, 'people.manage')
  return current
}

export function workflowAuthorityGuard(env: Bindings, actor: Actor) {
  return guard(env, 'workflow_authority_changed', `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.operator_id=o.id
    WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?
    AND (o.role='owner' OR EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission='people.manage')))`, actor.sessionId, actor.id, Date.now())
}
