import { insist } from './core'
import type { Input } from './input'
import { EMPLOYMENT_TYPES } from './people'

export interface TaskConditions {
  jobTitle?: string
  workState?: string
  employmentType?: string
  /** Immutable location ID, rather than its display name. */
  location?: string
}

export interface TaskRule {
  conditions: TaskConditions
  /** One-based positions in the complete template, before conditions filter it. */
  dependencies: number[]
}

/** Employment and terms in force on the case's anchor date. Missing facts do not match. */
export interface RuleContext {
  jobTitle?: string | null
  workState?: string | null
  employmentType?: string | null
  location?: string | null
}

const CONDITION_LIMITS = { jobTitle: 120, workState: 2, employmentType: 20, location: 100 } as const
type ConditionField = keyof TaskConditions

function record(value: unknown, code: string): Record<string, unknown> {
  insist(value && typeof value === 'object' && !Array.isArray(value), code)
  return value as Record<string, unknown>
}

/** Empty editor fields mean no condition; unknown fields and malformed values are refused. */
export function validateTaskConditions(value: unknown): TaskConditions {
  if (value === undefined) return {}
  const source = record(value, 'invalid_taskConditions')
  insist(Object.keys(source).every(key => Object.hasOwn(CONDITION_LIMITS, key)), 'invalid_taskConditions')
  const conditions: TaskConditions = {}
  for (const field of Object.keys(source) as ConditionField[]) {
    const raw = source[field]
    insist(typeof raw === 'string', `invalid_taskCondition_${field}`)
    let text = raw.trim()
    if (!text) continue
    insist(text.length <= CONDITION_LIMITS[field], `invalid_taskCondition_${field}`)
    if (field === 'workState') {
      text = text.toUpperCase()
      insist(/^[A-Z]{2}$/.test(text), 'invalid_taskCondition_workState')
    }
    if (field === 'employmentType') {
      text = text.toLowerCase()
      insist((EMPLOYMENT_TYPES as readonly string[]).includes(text), 'invalid_taskCondition_employmentType')
    }
    conditions[field] = text
  }
  return conditions
}

/** Earlier positions make every dependency graph acyclic without a second graph format. */
export function validateTaskDependencies(value: unknown, position: number): number[] {
  insist(Number.isSafeInteger(position) && position >= 1 && position <= 40, 'invalid_taskPosition')
  if (value === undefined) return []
  insist(Array.isArray(value) && value.length < position, 'invalid_taskDependencies')
  const dependencies: number[] = []
  for (const dependency of value) {
    insist(typeof dependency === 'number' && Number.isSafeInteger(dependency)
      && dependency >= 1 && dependency < position && !dependencies.includes(dependency), 'invalid_taskDependencies')
    dependencies.push(dependency)
  }
  return dependencies.sort((a, b) => a - b)
}

export function validateTaskRule(value: unknown, position: number): TaskRule {
  const source = record(value, 'invalid_taskRules')
  insist(Object.keys(source).every(key => key === 'conditions' || key === 'dependencies'), 'invalid_taskRules')
  return {
    conditions: validateTaskConditions(source.conditions),
    dependencies: validateTaskDependencies(source.dependencies, position),
  }
}

/** Omitted rules preserve existing templates; supplied rules must cover every task position. */
export function validateTaskRules(value: unknown, taskCount: number): TaskRule[] {
  insist(Number.isSafeInteger(taskCount) && taskCount >= 1 && taskCount <= 40, 'invalid_taskCount')
  if (value === undefined) return Array.from({ length: taskCount }, () => ({ conditions: {}, dependencies: [] }))
  insist(Array.isArray(value) && value.length === taskCount, 'invalid_taskRules')
  return Array.from(value, (rule, index) => validateTaskRule(rule, index + 1))
}

/** JSON API array or a JSON-encoded form field, in the same order as nonempty task titles. */
export function parseTaskRules(input: Input, taskCount: number): TaskRule[] {
  return validateTaskRules(input.has('taskRules') ? input.json('taskRules') : undefined, taskCount)
}

/** The editor keeps visible task numbers even when a row is left blank. */
export function editorTaskRules(input: Input, sourcePositions: number[]): TaskRule[] {
  const names = ['taskJobTitle', 'taskWorkState', 'taskEmploymentType', 'taskLocation', 'taskDependencies']
  const values = Object.fromEntries(names.map(name => [name, input.list(name, { keepEmpty: true })]))
  const positions = new Map(sourcePositions.map((position, index) => [position + 1, index + 1]))
  return validateTaskRules(sourcePositions.map(position => ({
    conditions: { jobTitle: values.taskJobTitle[position] ?? '', workState: values.taskWorkState[position] ?? '', employmentType: values.taskEmploymentType[position] ?? '', location: values.taskLocation[position] ?? '' },
    dependencies: (values.taskDependencies[position] ?? '').split(',').filter(v => v.trim()).map(value => {
      const number = Number(value.trim())
      insist(positions.has(number), 'dependency_task_missing')
      return positions.get(number)!
    }),
  })), sourcePositions.length)
}

/** AND of exact matches: title ignores case, state/type use canonical codes, location uses its ID.
 * Dependency readiness is evaluated separately against selected case tasks; an omitted task is skipped.
 */
export function ruleMatches(rule: TaskRule, context: RuleContext): boolean {
  const conditions = rule.conditions
  return (!conditions.jobTitle || conditions.jobTitle.toLowerCase() === context.jobTitle?.trim().toLowerCase())
    && (!conditions.workState || conditions.workState === context.workState?.trim().toUpperCase())
    && (!conditions.employmentType || conditions.employmentType === context.employmentType?.trim().toLowerCase())
    && (!conditions.location || conditions.location === context.location)
}
