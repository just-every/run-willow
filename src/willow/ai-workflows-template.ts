// Prepare native template custody for the same transaction as its AI source
// linkage. A failed or stale draft must never leave an unlinked native recipe.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { guard, newId, now, one, stmt } from './core'
import { validateTaskRules } from './workflow-rules'
import { workflowRecipe } from './ai-workflows-impact'
import type { WorkflowSource } from './ai-workflows-source'
import type { WorkflowEdit, WorkflowOutput } from './ai-workflows-types'

export async function workflowTemplate(env: Bindings, actor: Actor, source: WorkflowSource, output: WorkflowOutput, edits: WorkflowEdit[]) {
  const tasks = workflowRecipe(source, output, edits), id = newId(), family = source.template.family_id
  const previous = (await one(env, 'SELECT COALESCE(MAX(version),0) AS version FROM wl_templates WHERE family_id=?', family))!.version
  const rules = validateTaskRules(tasks.map(task => ({ conditions: task.conditions, dependencies: task.dependencies })), tasks.length)
  return { id, family, version: previous + 1, statements: [
    guard(env, 'workflow_source_stale', '(SELECT COALESCE(MAX(version),0) FROM wl_templates WHERE family_id=?)=?', family, previous),
    stmt(env, `INSERT INTO wl_templates(id,family_id,version,kind,name,required_fields,status,publication,created_by,created_at) VALUES(?,?,?,?,?,?,'retired','draft',?,?)`, id, family, previous + 1, source.template.kind, source.template.name, source.template.required_fields, actor.id, now()),
    ...tasks.map((task, index) => stmt(env, 'INSERT INTO wl_template_tasks(id,template_id,position,title,assignee,due_offset_days,evidence_required,system,action,rule) VALUES(?,?,?,?,?,?,?,?,?,?)',
      newId(), id, task.position, task.title, task.assignee, task.dueOffsetDays, Number(task.evidenceRequired), task.system, task.action, JSON.stringify(rules[index]))),
  ] }
}
