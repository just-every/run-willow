// One condition/dependency interpretation for previews, new cases and upgrades.
import type { Bindings } from '../auth.server'
import { all, json, one, type Row } from './core'
import { addDays } from './dates'
import { ruleMatches, type TaskRule } from './workflow-rules'

interface TemplateTask extends Row { position: number; title: string; assignee: string; due_offset_days: number; evidence_required: number; system: string | null; action: string | null; rule: string }

export interface WorkflowContext { jobTitle: string; employmentType: string; location: string; workState: string }

export async function workflowContext(env: Bindings, terms: Row, employmentType: string): Promise<WorkflowContext> {
  const location = terms.locationId ?? terms.location_id ?? ''
  return { jobTitle: terms.jobTitle ?? terms.job_title ?? '', employmentType, location,
    workState: location ? (await one(env, 'SELECT work_state FROM wl_locations WHERE id=?', location))?.work_state ?? '' : '' }
}

export async function plannedTasks(env: Bindings, template: string, context: WorkflowContext, anchor: string, manager: string | null) {
  const rows = await all<TemplateTask>(env, 'SELECT * FROM wl_template_tasks WHERE template_id=? ORDER BY position', template)
  return rows.filter(row => ruleMatches(json<TaskRule>(row.rule, { conditions: {}, dependencies: [] }), context)).map(row => {
    const rule = json<TaskRule>(row.rule, { conditions: {}, dependencies: [] })
    return { ...row, action: rule.signature ? 'signature' : row.action, signature: rule.signature, dueDate: addDays(anchor, row.due_offset_days), manager: row.assignee === 'manager' ? manager : null,
      dependencies: rule.dependencies,
      // Changing a task's meaning cannot inherit an old completion.
      key: JSON.stringify([row.title, row.assignee, row.due_offset_days, row.evidence_required, row.system, row.action, rule]) }
  })
}

export async function blockedBy(env: Bindings, task: Row) {
  const dependencies = json<string[]>(task.dependencies, [])
  if (!dependencies.length) return []
  return await all(env, `SELECT id,title FROM wl_case_tasks WHERE case_id=? AND id IN (${dependencies.map(() => '?').join(',')}) AND status<>'done' AND superseded_at IS NULL`, task.case_id, ...dependencies)
}
