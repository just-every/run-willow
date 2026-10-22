import assert from 'node:assert/strict'

// Public detail pages need real retained records and explicit compliance authority.
// Being the owner never substitutes for the separate EEO grant or team exclusion.
export async function openComplianceFixtures(api, { owner, employees, today, acceptInvitation }) {
  await api('eeo.grant', { member: owner.id, enabled: true })
  const packet = await api('preboarding.send', { name: 'synthetic-willow-1', email: 'preboarding@example.com' })
  const interviewer = await api('access.give', { person: employees[1].person })
  await acceptInvitation(interviewer.email)
  const opening = await api('hiring.opening', { name: 'Service coordinator', stages: ['New', 'Offer', 'Rejected'], members: [interviewer.id] })
  const applicant = await api('hiring.candidate', { opening: opening.id, name: 'synthetic-willow-2', contactEmail: 'applicant@example.com', source: 'Careers enquiry' })
  await api('hiring.close', { application: applicant.id, revision: applicant.revision, openingRevision: opening.revision, outcome: 'rejected' })
  const year = Number(today.slice(0, 4)) - (today.slice(5, 7) < '10' ? 1 : 0)
  const run = await api('eeo.run', { from: `${year}-10-01`, to: year === Number(today.slice(0, 4)) ? today : `${year}-12-31` })
  const report = await api(`eeo/runs/${run.id}`)
  assert.equal(report.roster, employees.length, 'The frozen snapshot contains the public journey workforce')
  assert.equal(report.reconciles, true, 'The snapshot counts reconcile before its pages open')

  // A separate withdrawn packet produces a real receipt without erasing a worker
  // or the packet whose compliance detail the page crawl still needs to open.
  const withdrawn = await api('preboarding.send', { name: 'synthetic-willow-3', email: 'withdrawn@example.com' })
  await api('preboarding.withdraw', { packet: withdrawn.id })
  await api('retention.adopt', { version: (await api('retention')).tableVersion })
  await api('erasure.request', { preboarding: withdrawn.id, source: 'own_request', receivedOn: today })
  const preview = await api(`erasure/preview?preboarding=${withdrawn.id}`)
  assert.equal(preview.confirmable, true, 'The withdrawn packet is eligible for reviewed erasure')
  const erased = await api('erasure.confirm', { preboarding: withdrawn.id, digest: preview.digest })
  return {
    eeoPreboarding: `/app/eeo/preboarding/${packet.id}`, eeoApplicant: `/app/eeo/applicants/${applicant.id}`,
    hiringOpening: `/app/hiring/openings/${opening.id}`, hiringApplication: `/app/hiring/applications/${applicant.id}`,
    eeoPerson: `/app/eeo/person/${employees[0].person}`,
    eeoRun: `/app/eeo/runs/${run.id}`, eeoRunPeople: `/app/eeo/runs/${run.id}/people`, eeoRunAggregate: `/app/eeo/runs/${run.id}/aggregate`,
    erasure: `/app/retention/erasure?preboarding=${packet.id}`,
    erasureReceipt: `/app/retention/receipts/${erased.receipt}`,
  }
}
