// ROLE-002: scoped HR decisions and work apply only to people inside the level's scope.
import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'
import { publishTemplate } from './publish-template.mjs'

export async function decisionProof(h, owner, ctx) {
 const { ten, make, api, hills } = ctx
 const as = (who, path, body, status) => h.api(path, who.cookie, body, status)
 const mover = await publishTemplate(h, owner, { name: 'Scope follow-up', kind: 'mover', taskTitle: ['Confirm scope change'], taskAssignee: ['hr'], taskDueDays: ['0'] })
 await api('change.chain', { requestType: 'job', template: mover.id, stepRole: ['hr'] })
 const month = new Date(day(31)), effectiveFrom = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)).toISOString().slice(0, 10)
 const [requester, reviewer, selfReviewer, worker] = [ten[5], ten[4], ten[6], ten[7]]
 const near = await make('dn'), far = await make('dn2', { location: hills })

 // FLOW-004: a scoped HR member requests, reads and decides only for people in scope.
 await as(requester, 'change.request', { person: far.person, effectiveFrom, reason: 'Out of scope', jobTitle: 'Lead' }, 403)
 const requested = await as(requester, 'change.request', { person: near.person, effectiveFrom, reason: 'Scoped promotion', jobTitle: 'Scoped lead' })
 const outside = await api('change.request', { person: far.person, effectiveFrom, reason: 'Owner request outside', jobTitle: 'Outside lead' })
 const listed = await as(reviewer, 'change-requests')
 assert.deepEqual(listed.requests.map(item => item.id).sort(), [requested.id], 'The list holds only in-scope requests')
 assert.ok(listed.mayRequestFor.some(person => person.id === near.person) && !listed.mayRequestFor.some(person => person.id === far.person))
 await as(reviewer, `change-requests/${outside.id}`, undefined, 404)
 const outsideState = (await api(`change-requests/${outside.id}`)).state
 await as(reviewer, 'change.decide', { request: outside.id, state: outsideState, decision: 'approve' }, 403)
 const detail = await as(reviewer, `change-requests/${requested.id}`)
 assert.ok(detail.mayDecide)
 assert.ok((await as(reviewer, 'work')).items.some(item => item.path === `/app/changes/${requested.id}`), 'The in-scope step is the reviewer\'s work')
 assert.ok(!(await as(reviewer, 'work')).items.some(item => item.path === `/app/changes/${outside.id}`))
 await as(reviewer, 'change.decide', { request: requested.id, state: detail.state, decision: 'approve', comment: 'Within scope' })
 assert.equal((await api(`people/${near.person}`)).employment[0].terms.find(terms => terms.effectiveFrom === effectiveFrom)?.jobTitle, 'Scoped lead', 'The approved change executed')
 assert.equal((await api(`change-requests/${requested.id}`)).status, 'approved')

 // SELF-001 and its WIL-11 exception queue.
 const subjectNear = await make('sn', { member: true }), subjectFar = await make('sf', { location: hills, member: true })
 const askNear = await as(subjectNear, 'self.request', { kind: 'legalName', legalName: 'Scope Renamed Near' })
 const askFar = await as(subjectFar, 'self.request', { kind: 'legalName', legalName: 'Scope Renamed Far' })
 assert.deepEqual((await as(selfReviewer, 'self-changes')).map(change => change.id), [askNear.id], 'Only in-scope proposals are listed')
 await as(selfReviewer, `self-changes/${askFar.id}`, undefined, 404)
 await as(selfReviewer, 'self.decide', { change: askFar.id, decision: 'approve', comment: 'Out of scope' }, 403)
 await as(selfReviewer, 'self.decide', { change: askNear.id, decision: 'approve', comment: 'Within scope' })
 assert.equal((await api(`people/${subjectNear.person}`)).legalName, 'Scope Renamed Near')
 assert.equal((await api(`people/${subjectFar.person}`)).legalName, 'scsf', 'An out-of-scope proposal is untouched')
 await api('self.decide', { change: askFar.id, decision: 'approve', comment: 'Owner decides' })
 assert.deepEqual((await as(selfReviewer, 'self-exceptions')).map(item => item.id), [askNear.id], 'The exception queue holds only in-scope revisions')
 await as(selfReviewer, 'self.reconcile', { change: askFar.id, reference: 'REF-OUT' }, 403)
 await as(selfReviewer, 'self.reconcile', { change: askNear.id, reference: 'REF-IN' })
 assert.ok((await api('self-exceptions')).some(item => item.id === askFar.id && item.status === 'open'), 'The out-of-scope exception stays open')

 // Lifecycle tasks and cases of in-scope people only.
 const tasks = async (path, who) => (await as(who, path)).tasks
 await as(worker, `cases/${far.case}`, undefined, 404)
 const farTask = (await api(`cases/${far.case}`)).tasks[0].id
 await as(worker, 'task.complete', { task: farTask, evidence: 'Out of scope' }, 403)
 assert.ok((await as(worker, 'work')).items.some(item => item.path === `/app/cases/${near.case}`), 'In-scope lifecycle work is visible')
 assert.ok(!(await as(worker, 'work')).items.some(item => item.path === `/app/cases/${far.case}`))
 await as(worker, 'case.complete', { case: far.case }, 403)
 for (const task of await tasks(`cases/${near.case}`, worker)) if (task.status === 'open') await as(worker, 'task.complete', { task: task.id, evidence: 'Done in scope' })
 await as(worker, 'case.complete', { case: near.case })
 assert.equal((await api(`cases/${near.case}`)).status, 'completed')
}
