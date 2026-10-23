import { selfChanges } from './self-service/view'
// DATA-001: current native review authority, then selected-person/date filtering.
import type { Bindings } from '../auth.server'
import { type Actor } from './actor'
import { all, insist, type Row } from './core'
import { today } from './dates'
import { performanceDetail, performanceHome } from './performance/views'

export async function exportReviewHistory(env: Bindings, actor: Actor, asOf: string, zone: string) {
  const before = (at: number) => today(zone, at) <= asOf
  const requests=(await selfChanges(env,actor)).filter(row=>row.kind==='review'&&before(row.requestedAt)).map(row=>({...row,...row.decision&&!before(row.decision.at)?{status:'pending',decision:null}:{}}))
  const cycles: Omit<Awaited<ReturnType<typeof performanceDetail>>, 'members' | 'mayManage' | 'reviewActions'>[] = []
  for (const summary of (await performanceHome(env, actor)).cycles) {
    const view = await performanceDetail(env, actor, summary.id)
    if (!before(view.cycle.created_at)) continue
    // Assignment and close timestamps are in the same audited transaction as
    // their native write; never invent historical timing from a due date.
    const events = await all(env, `SELECT action, subject, at FROM wl_audit
      WHERE (action='performance.input.request' AND subject IN (SELECT id FROM wl_review_assignments WHERE cycle_id=?))
      OR (action='performance.cycle.close' AND subject=?)`, summary.id, summary.id)
    const assignments = view.assignments.filter(assignment => {
      const event = events.find(event => event.action === 'performance.input.request' && event.subject === assignment.id)
      insist(event, 'review_history_incomplete', 409)
      return before(event.at)
    })
    const closed = events.find(event => event.action === 'performance.cycle.close')
    cycles.push({
      cycle: { ...view.cycle, status: closed && before(closed.at) ? 'closed' : 'open' },
      assignments,
      inputs: view.inputs.filter(input => before(input.created_at) && assignments.some(assignment => assignment.id === input.assignment_id)),
      notes: view.notes.filter(note => before(note.created_at)),
      summaries: view.summaries.filter(summary => before(summary.created_at)),
      appeals: view.appeals.filter(appeal => before(appeal.created_at)),
      acknowledgments: view.acknowledgments.filter(ack => before(ack.created_at)),
      withholdings: view.withholdings.filter(item => before(item.created_at)),
      recipients: view.recipients.filter(item => before(item.created_at)),
      subjects: view.subjects,
    })
  }
  return (person: string) => cycles.flatMap(view => {
    const assignments = view.assignments.filter(row => row.person_id === person)
    const summaries = view.summaries.filter(row => row.person_id === person)
    const summaryIds = new Set(summaries.map(row => row.id))
    const selected = (rows: Row[]) => rows.filter(row => summaryIds.has(row.summary_id))
    const notes = view.notes.filter(row => row.person_id === person)
    if (!assignments.length && !summaries.length && !notes.length && !view.subjects.some(row => row.person_id === person)) return []
    return [{ cycle: view.cycle, assignments, corrections:requests.filter(row=>row.personId===person&&summaryIds.has(row.after.review)),
      inputs: view.inputs.filter(row => row.person_id === person), notes, summaries,
      appeals: selected(view.appeals), acknowledgments: selected(view.acknowledgments),
      withholdings: selected(view.withholdings), recipients: selected(view.recipients) }]
  })
}
