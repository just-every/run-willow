// DATA-001: reuse native projections; an export never creates a new read grant.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { today } from './dates'
import { goalHome } from './performance/goals'
import { selfChanges } from './self-service/view'

export async function exportModuleHistory(env: Bindings, actor: Actor, sections: string[], asOf: string, zone: string) {
 const before = (at: number | null | undefined) => at != null && today(zone, at) <= asOf
 const changes = sections.includes('profileChanges') ? (await selfChanges(env, actor)).filter(row => before(row.requestedAt)).map(row => {
  if (!row.decision || !before(row.decision.at)) return { ...row, status: 'pending', decision: null, reconciliation: null }
  const reconciliation = row.reconciliation && !before(row.reconciliation.at)
   ? { ...row.reconciliation, status: 'open', reference: null, by: null, at: null } : row.reconciliation
  return { ...row, reconciliation }
 }) : []
 const goalData = sections.includes('goals') ? await goalHome(env, actor) : null
 const goals = (goalData?.goals ?? []).filter(goal => before(goal.createdAt)).map(goal => ({
  id: goal.id, personId: goal.personId, title: goal.title, milestones: goal.milestones, dueDate: goal.dueDate,
  development: goal.development, owner: goal.owner, ownerName: goal.ownerName, createdAt: goal.createdAt,
  checkins: goal.checkins.filter(checkin => before(checkin.createdAt)),
  completion: goal.completion && before(goal.completion.completedAt) ? goal.completion : null,
 }))
 return { changes, goals, goalPeople: new Set(goalData?.readablePeople.map(person => person.id) ?? []) }
}
