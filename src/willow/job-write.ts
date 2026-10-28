import { credentialContext, credentialPersonAllowed } from './api-credentials/principal'
import { currentCredentialPrincipal, credentialFence } from './api-credentials/authenticate'
// One exact field per native edit. No synthetic actor or broad permission grant.
import type { Bindings } from '../auth.server'
import { actorFor, canAbout, type Actor } from './actor'
import { commit, guard, insist, one } from './core'
import { selectedPeriods } from './employment'
import { Input } from './input'
import { prepareJobChange } from './job-values'
import { canRequestCompensation } from './levels/compensation'
import { JOB_FIELDS, canEditJobField, canRequestJobField, type JobField } from './levels/job'

export const jobField = (value: string): JobField => {
 insist((JOB_FIELDS as readonly string[]).includes(value), 'invalid_job_field')
 return value as JobField
}

/** Rebuild live authority and fence all subsequent writes against concurrent grants or movers. */
export async function liveJobActor(env: Bindings, actor: Pick<Actor, 'id' | 'sessionId'>) {
 if(actor.id.startsWith('credential:')) {
  const current=await currentCredentialPrincipal(env,actor.id.slice(11))
  return {actor:current,fence:credentialFence(env,current)}
 }
 const snapshot = (await one<{ seq: number }>(env, 'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const member = await one(env, 'SELECT m.*, o.role FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=?', actor.id)
 insist(member, 'forbidden', 403)
 const current = await actorFor(env, { id: member.id, email: member.email, name: member.name, owner: member.role === 'owner', personId: member.person_id, sessionId: actor.sessionId })
 return { actor: current, fence: guard(env, 'access_changed', '(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?', snapshot) }
}

/** The existing manager/HR path may request pay; fine job rights never confer that path. */
export function requireJobRequest(actor: Actor, person: string, fields: JobField[], pay: boolean, payField:'pay'|'history'='pay') {
 insist(actor.personId !== person, 'own_terms', 403)
 const credential=credentialContext(actor)
 if(credential) {
  insist(credentialPersonAllowed(actor,person),'not_found',404)
  insist((!fields.length||credential.writeScopes.includes('job.approval'))&&(!pay||credential.writeScopes.includes('compensation.approval')),'credential_read_only',403)
  insist(fields.every(field=>canRequestJobField(actor,person,field))&&(!pay||canRequestCompensation(actor,person,payField)),'forbidden',403)
  return
 }
 const native = canAbout(actor, 'people.manage', person) || actor.reports.has(person)
 insist(native || ((pay||fields.length>0) && (!pay||canRequestCompensation(actor,person,payField)) && fields.every(field => canRequestJobField(actor, person, field))), 'forbidden', 403)
}

export async function editJobField(env: Bindings, actor: Actor, input: Input) {
 input.only(['person', 'period', 'revision', 'field', 'value', 'effectiveFrom', 'reason', 'returnTo'])
 const person = input.text('person', { max: 100 }), field = jobField(input.text('field'))
 const live = await liveJobActor(env, actor)
 insist(canEditJobField(live.actor, person, field), 'job_field_forbidden', 403)
 insist(await one(env, 'SELECT 1 FROM wl_people WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)', person), 'not_found', 404)
 const period = input.has('period') ? await one(env, 'SELECT * FROM wl_periods WHERE id=? AND person_id=?', input.text('period'), person) : (await selectedPeriods(env, actor.today)).get(person)
 insist(period, 'period_not_found', 404)
 const revision = input.text('revision', { max: 100 })
 insist(period.revision === revision, 'stale', 409)
 const value = input.text('value', { optional: !['jobTitle', 'employmentType', 'employmentStatus', 'startDate'].includes(field), max: 120 })
 const execution = { period: period.id, effectiveFrom: input.text('effectiveFrom', { max: 10 }), reason: input.text('reason', { max: 300 }), template: '', [field]: value }
 const prepared = await prepareJobChange(env, live.actor, period.id, execution, field === 'employmentType' ? value : null)
 await commit(env, [live.fence, guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_periods WHERE id=? AND revision=?)', period.id, revision), ...prepared.statements],
  [...[prepared.audit].flat(), { actor: actor.id, action: 'job.field', subject: person, detail: { field, period: period.id, effectiveFrom: execution.effectiveFrom } }])
 return { ...prepared.result, revision: (await one(env, 'SELECT revision FROM wl_periods WHERE id=?', prepared.result.period))!.revision }
}
