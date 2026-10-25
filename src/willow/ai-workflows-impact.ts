// Local-only projection. Neither the directory nor names of tasks or systems
// are part of the structural model context.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all } from './core'
import { addDays } from './dates'
import { directory } from './profile'
import { termsOn } from './people'
import { answersFor } from './lifecycle'
import { workMembers } from './work-sources'
import { workflowContext } from './workflow-plan'
import { ruleMatches, type TaskRule } from './workflow-rules'
import type { WorkflowEdit, WorkflowOutput } from './ai-workflows-types'
import type { WorkflowSource } from './ai-workflows-source'

export function workflowRecipe(source: WorkflowSource, output: WorkflowOutput, edits: WorkflowEdit[]) {
  return output.steps.map(step => {
    const task = source.tasks[step.position - 1], inherited = JSON.parse(task.rule) as TaskRule
    return { ...step, title: task.title, system: task.system, action: task.action,
      conditions: edits.some(edit => edit.position === step.position) ? step.requestedConditions : inherited.conditions }
  })
}

export function workflowGaps(source: WorkflowSource, output: WorkflowOutput) {
  const gaps: { code: string; position: number; detail: string }[] = []
  for (const step of output.steps) {
    const task = source.tasks[step.position - 1]
    if (task.system) {
      gaps.push({ code: 'connector_capabilities_unavailable', position: step.position, detail: 'Only the existing evidence-work system label is mapped. Provider capability, account mapping and scopes are unverified.' })
      gaps.push({ code: 'connected_system_simulation_unavailable', position: step.position, detail: 'No connected-system state or external writes were simulated. This step cannot be published by the assistant.' })
    }
  }
  return gaps
}

export async function workflowImpact(env: Bindings, actor: Actor, source: WorkflowSource, output: WorkflowOutput, edits: WorkflowEdit[], date: string) {
  const people = await directory(env, actor, date), members = await workMembers(env)
  const periods = await all(env, 'SELECT id,person_id,employment_type FROM wl_periods WHERE start_date<=? AND (end_date IS NULL OR end_date>=?) ORDER BY person_id,id', date, date)
  const recipe = workflowRecipe(source, output, edits), affected = []
  for (const person of people.filter(person => person.status === 'active')) {
    const period = periods.find(period => period.person_id === person.id)
    if (!period) continue
    const terms = await termsOn(env, period.id, date)
    if (!terms) continue
    const context = await workflowContext(env, terms, period.employment_type)
    const selected = recipe.filter(step => ruleMatches(step, context))
    affected.push({ person: person.id, name: person.name, tasks: selected.map(step => {
      const manager = step.assignee === 'manager' ? terms.manager_person_id : null
      return { position: step.position, title: step.title, assignee: step.assignee,
        recipients: members.filter(member => answersFor(member, { assignee: step.assignee, assignee_person_id: manager }, { person_id: person.id })).map(member => ({ id: member.id, name: member.name })),
        dueDate: addDays(date, step.dueOffsetDays), evidenceRequired: step.evidenceRequired, approvalGate: step.approvalGate,
        dependencies: step.dependencies.filter(position => selected.some(candidate => candidate.position === position)), system: step.system, action: step.action }
    }) })
  }
  return { asOf: date, affected, boundary: 'Willow-only projection for a new case on this date. Existing cases retain their version. No external write or employment change is executed.' }
}
