import { insist } from './core'
import { ASSIGNEES, type Assignee } from './lifecycle'
import { validateTaskConditions, validateTaskDependencies, type TaskConditions } from './workflow-rules'

export interface WorkflowEdit {
  position: number
  assignee: Assignee
  dueOffsetDays: number
  requestedConditions: TaskConditions
  dependencies: number[]
  approvalGate: boolean
  connectorSource: number | null
}

export interface WorkflowStep extends WorkflowEdit { evidenceRequired: boolean }
export interface WorkflowOutput {
  source: { id: string; version: number }
  connectionRevision: string | null
  steps: WorkflowStep[]
}

function object(value: unknown, keys: string[]): Record<string, any> {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'invalid_workflow_output')
  insist(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'invalid_workflow_output')
  return value as Record<string, any>
}

/** Canonicalize every property before comparing with the authorized request. */
export function validateWorkflowOutput(value: unknown, expected: WorkflowOutput): WorkflowOutput {
  const raw = object(value, ['source', 'connectionRevision', 'steps'])
  const source = object(raw.source, ['id', 'version'])
  insist(source.id === expected.source.id && source.version === expected.source.version && raw.connectionRevision === expected.connectionRevision, 'workflow_citation_required')
  insist(Array.isArray(raw.steps) && raw.steps.length === expected.steps.length, 'invalid_workflow_output')
  const steps = raw.steps.map((value: unknown, index: number): WorkflowStep => {
    const step = object(value, ['position', 'assignee', 'dueOffsetDays', 'requestedConditions', 'dependencies', 'approvalGate', 'connectorSource', 'evidenceRequired'])
    insist(step.position === index + 1 && (ASSIGNEES as readonly string[]).includes(step.assignee), 'invalid_workflow_output')
    insist(Number.isSafeInteger(step.dueOffsetDays) && Math.abs(step.dueOffsetDays) <= 999, 'invalid_workflow_output')
    insist(typeof step.approvalGate === 'boolean' && typeof step.evidenceRequired === 'boolean', 'invalid_workflow_output')
    insist(step.connectorSource === null || step.connectorSource === step.position, 'workflow_ambiguous_connector_mapping')
    const conditions = validateTaskConditions(step.requestedConditions)
    insist(!conditions.jobTitle && !conditions.location, 'invalid_workflow_output')
    return { position: step.position, assignee: step.assignee, dueOffsetDays: step.dueOffsetDays,
      requestedConditions: { ...(conditions.workState ? { workState: conditions.workState } : {}), ...(conditions.employmentType ? { employmentType: conditions.employmentType } : {}) }, dependencies: validateTaskDependencies(step.dependencies, step.position),
      approvalGate: step.approvalGate, connectorSource: step.connectorSource, evidenceRequired: step.evidenceRequired }
  })
  const output = { source: { id: source.id, version: source.version }, connectionRevision: raw.connectionRevision, steps }
  insist(JSON.stringify(output) === JSON.stringify(expected), 'workflow_request_mismatch')
  return output
}
