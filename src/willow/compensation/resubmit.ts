// Typed forms append a FLOW-004 revision; they never replace it with a job plan.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { insist, json, one } from '../core'
import { Input } from '../input'
import { editChange, type Plan } from '../change-requests/requests'
import { readCompensationRecord } from './records'
import { readCompensationDefinition } from './definitions'

async function target(env: Bindings, actor: Actor, input: Input) {
 const request = input.text('request', { max: 100 })
 const row = await one(env, 'SELECT person_id,requested_by,plan_json FROM wl_change_requests WHERE id=?', request)
 insist(row, 'not_found', 404)
 insist(row.requested_by === actor.id, 'forbidden', 403)
 insist(!input.has('person') || input.text('person') === row.person_id, 'compensation_request_person_mismatch')
 return { request, person: row.person_id, state: input.text('state', { max: 100 }), reason: input.text('reason', { max: 300 }), plan: json<Plan>(row.plan_json, {} as Plan) }
}

export async function resubmitCompensationRecord(env: Bindings, actor: Actor, input: Input) {
 input.only(['request', 'state', 'person', 'reason', 'kind', 'record', 'revision', 'effectiveDate', 'amount', 'currency', 'units', 'security', 'note', 'returnTo'])
 const source = await target(env, actor, input), record = readCompensationRecord(input)
 insist(source.plan.compensationRecord?.kind === record.kind, 'compensation_request_kind_mismatch')
 return editChange(env, actor, Input.of({ request: source.request, state: source.state, person: source.person, reason: source.reason, effectiveFrom: record.effectiveDate, compensationRecord: record }))
}

export async function resubmitCompensationDefinition(env: Bindings, actor: Actor, input: Input) {
 const kind = input.text('definitionKind')
 insist(kind === 'bands' || kind === 'cycles', 'invalid_compensation_definition_kind')
 input.only(['request', 'state', 'person', 'reason', 'definitionKind', 'effectiveFrom', 'returnTo', ...(kind === 'bands' ? ['jobTitle', 'level', 'location', 'basis', 'minimum', 'maximum'] : ['name', 'kind', 'budget'])])
 const source = await target(env, actor, input)
 insist(source.plan.compensationDefinition?.kind === kind, 'compensation_request_kind_mismatch')
 const definition = readCompensationDefinition(kind, input)
 return editChange(env, actor, Input.of({ request: source.request, state: source.state, person: source.person, reason: source.reason, effectiveFrom: definition.values.effectiveFrom, compensationDefinition: { ...definition, person: source.person } }))
}
