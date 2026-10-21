import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'

// DATA-001: real two-person cycle; each export must keep the native boundary.
export async function bundleReviews(h, api, s) {
  const cycle = await api('performance.cycle', { name: 'Service delivery review', dueDate: day(14), people: [s.employee.person, s.managerb.person],
    questions: { self: ['Which outcome did you deliver?'], peer: ['Which collaboration helped?'], manager: ['Which development step is next?'] } })
  const assign = (person, member, role) => api('performance.assign', { cycle: cycle.id, person, member, role, dueDate: day(14) })
  const self = await assign(s.employee.person, s.employee.member, 'self')
  const peer = await assign(s.employee.person, s.managerb.member, 'peer')
  const manager = await assign(s.employee.person, s.managera.member, 'manager')
  const other = await assign(s.managerb.person, s.employee.member, 'peer')
  for (const [cookie, assignment, answers] of [
    [s.employee.cookie, self, ['Delivered the warehouse handover']],
    [s.employee.cookie, self, ['Delivered and documented the warehouse handover']],
    [s.managerb.cookie, peer, ['PEER-CONFIDENTIAL shared the receiving checklist']],
    [s.managera.cookie, manager, ['MANAGER-CONFIDENTIAL coach the safety induction']],
    [s.employee.cookie, other, ['OTHER-PERSON-REVIEW authored by the selected employee']],
  ]) await h.api('performance.respond', cookie, { assignment: assignment.id, answers })
  await api('performance.note', { cycle: cycle.id, person: s.employee.person, note: 'HR-CONFIDENTIAL calibration evidence', rating: 'Meets outcomes' })
  const release = await api('performance.release', { cycle: cycle.id, person: s.employee.person, summary: 'Agreed handover and safety development', rating: 'Meets outcomes' })
  await h.api('performance.ack', s.employee.cookie, { summary: release.id })
  await h.api('performance.appeal', s.employee.cookie, { summary: release.id, reason: 'Include the receiving checklist in the next review' })
  await api('performance.release', { cycle: cycle.id, person: s.managerb.person, summary: 'OTHER-PERSON-RELEASE', rating: 'Meets outcomes' })
  const withheld = await api('performance.release', { cycle: cycle.id, person: s.employee.person, summary: 'WITHHELD-SUCCESSION release awaiting discussion', rating: 'Exceeds outcomes' })
  await api('performance.withhold', { summary: withheld.id, manager: s.managerb.member, reason: 'HR-CONFIDENTIAL discuss before successor release' })

  async function assertNative(record, cookie) {
    const native = await h.api(`performance/${cycle.id}`, cookie)
    const review = record.reviews.find(row => row.cycle.id === cycle.id)
    assert.ok(review, 'DATA-001 exports the currently permitted review cycle')
    assert.deepEqual(review.cycle, native.cycle)
    for (const key of ['assignments', 'inputs', 'notes', 'summaries']) assert.deepEqual(review[key], native[key].filter(row => row.person_id === s.employee.person))
    const summaries = new Set(review.summaries.map(row => row.id))
    for (const key of ['appeals', 'acknowledgments', 'recipients', 'withholdings']) assert.deepEqual(review[key], native[key].filter(row => summaries.has(row.summary_id)))
    assert.ok(!JSON.stringify(record.reviews).includes('OTHER-PERSON-'), 'Authored input about another selected-out person stays out too')
    return review
  }
  return { cycle: cycle.id, release: release.id, assertNative }
}
