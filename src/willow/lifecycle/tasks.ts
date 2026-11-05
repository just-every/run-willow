// Task assignment is shared by the case, work queue, notices and write doors.
import type { Bindings } from '../../auth.server'
import { can, canAbout, type Actor, type Permission } from '../actor'
import type { Row } from '../core'
import { currentTerms } from '../people'

export const ASSIGNEES = ['hr', 'manager', 'it', 'payroll', 'employee'] as const
export type Assignee = typeof ASSIGNEES[number]
export const ASSIGNEE_PERMISSION: Partial<Record<Assignee, Permission>> = { hr: 'people.manage', it: 'it.tasks', payroll: 'payroll.handoff' }

/** Only unfinished joiner work follows a manager change; completed evidence keeps its assignment. */
export async function taskAssignments(env: Bindings, tasks: Row[], date: string, caseRow?: Row): Promise<Row[]> {
  const follows = (task: Row) => task.assignee === 'manager' && task.status === 'open' && !task.superseded_at
    && (caseRow?.kind ?? task.kind) === 'joiner' && (caseRow?.status ?? task.case_status) === 'open'
  if (!tasks.some(follows)) return tasks
  const terms = await currentTerms(env, date)
  return tasks.map(task => follows(task) ? { ...task, assignee_person_id: terms.get(caseRow?.person_id ?? task.person_id)?.manager_person_id ?? null } : task)
}

/** The owner can take over manager work; employee work stays with the employee. */
export function answersFor(actor: Actor, task: Row, caseRow: Row): boolean {
  if (task.assignee === 'employee') return actor.personId === caseRow.person_id
  if (task.assignee === 'manager') return actor.owner || (task.assignee_person_id ? task.assignee_person_id === actor.personId : canAbout(actor, 'people.manage', caseRow.person_id))
  const permission = ASSIGNEE_PERMISSION[task.assignee as Assignee]!
  return permission === 'people.manage' ? canAbout(actor, permission, caseRow.person_id) : can(actor, permission)
}
