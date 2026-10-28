// Custom-field proposals use SELF-001 custody and the native dated value validator.
import { currentCredentialPrincipal, credentialFence } from '../api-credentials/authenticate'
import type { Bindings } from '../../auth.server'
import { actorFor, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { addDays } from '../dates'
import { Input } from '../input'
import { liveApprovalActor } from '../levels/approvals'
import { readsCustomField } from './read'
import { customValueStatements, effectiveField, fieldSchemas, writesCustomField } from './store'

export async function customProposalDefinition(env: Bindings, actor: Actor, field: string) {
 const schema = (await fieldSchemas(env, actor.today)).find(item => item.id === field)
 return schema ? effectiveField(schema) : null
}
export const customProposalImage = async (env: Bindings, person: string, field: string) => (await all<{ id: string; revision: string }>(env, 'SELECT id,revision FROM wl_custom_field_values WHERE person_id=? AND field_id=? ORDER BY id', person, field)).map(row => `${row.id}:${row.revision}`).join('|')
const imageGuard = (env: Bindings, row: Row) => guard(env, 'custom_values_changed', "(SELECT COALESCE(group_concat(image,'|'),'') FROM (SELECT id||':'||revision AS image FROM wl_custom_field_values WHERE person_id=? AND field_id=? ORDER BY id))=?", row.person_id, row.row_id, row.source_revision)

async function liveRequester(env: Bindings, actor: Pick<Actor, 'id' | 'sessionId'>) {
 if (actor.id.startsWith('credential:')) {
  const current = await currentCredentialPrincipal(env, actor.id.slice(11))
  return { actor: current, guards: [credentialFence(env, current)] }
 }
 return liveApprovalActor(env, actor)
}

export async function proposeCustomField(env: Bindings, actor: Actor, input: Input) {
 input.only(['person', 'field', 'effectiveFrom', 'value', 'fieldValue', 'returnTo'])
 actor = (await liveRequester(env, actor)).actor
 const person = input.text('person'), field = input.text('field'), effectiveFrom = input.text('effectiveFrom')
 const definition = await customProposalDefinition(env, actor, field)
 insist(definition && !definition.retired, 'field_not_found', 404)
 insist(writesCustomField(actor, definition, person) && readsCustomField(actor, person, definition), 'forbidden', 403)
 insist(await one(env, 'SELECT 1 FROM wl_people WHERE id=? AND NOT EXISTS(SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=wl_people.id AND r.receipt_id IS NOT NULL)', person), 'person_not_found', 404)
 insist(input.provided('value')||input.provided('fieldValue'), 'missing_value')
 const formValue=input.text('fieldValue',{optional:true,max:10000})
 const raw = input.provided('value')?input.json('value'):formValue===''?null:definition.type==='boolean'?(insist(formValue==='true'||formValue==='false','invalid_field_boolean'),formValue==='true'):formValue
 const prepared = await customValueStatements(env, actor, person, { [field]: raw }, effectiveFrom, { requireAll: false })
 const dated = prepared.definitions.find(item => item.id === field)!
 const before = await one(env, 'SELECT value_json FROM wl_custom_field_values WHERE person_id=? AND field_id=? AND effective_from<=? ORDER BY effective_from DESC,sequence DESC LIMIT 1', person, field, effectiveFrom)
 const value = prepared.values[dated.key], image = await customProposalImage(env, person, field)
 insist(JSON.stringify(before ? JSON.parse(before.value_json) : null) !== JSON.stringify(value), 'nothing_to_change')
 const live = await liveRequester(env, actor), current = await customProposalDefinition(env, live.actor, field)
 insist(current && !current.retired && writesCustomField(live.actor, current, person) && readsCustomField(live.actor, person, current), 'forbidden', 403)
 const id = newId()
 await commit(env, [...live.guards, ...prepared.guards, stmt(env, 'INSERT INTO wl_self_changes(id,person_id,kind,row_id,before_json,after_json,source_revision,table_version_id,requested_by,requested_at,due_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, person, 'customField', field, JSON.stringify({ value: before ? JSON.parse(before.value_json) : null }), JSON.stringify({ field, key: dated.key, label: dated.label, effectiveFrom, value }), image, dated.definitionVersionId, actor.id, now(), addDays(actor.today, 7))],
  { actor: actor.id, action: 'selfChange.request', subject: id, detail: { person, kind: 'customField', field } })
 return { id, status: 'pending' }
}

export async function approveCustomFieldStatements(env: Bindings, reviewer: Actor, row: Row) {
 const after = JSON.parse(row.after_json)
 const live = row.requested_by.startsWith('credential:') ? await liveRequester(env, { id: row.requested_by, sessionId: '' }) : null
 const member = live ? null : await one(env, 'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=?', row.requested_by)
 insist(live || member, 'custom_approval_unavailable', 403)
 const requester = live?.actor ?? await actorFor(env, { id: member!.id, email: member!.email, name: member!.name, personId: member!.person_id, owner: member!.role === 'owner', sessionId: '' })
 const current = await customProposalDefinition(env, requester, row.row_id)
 insist(current && !current.retired && writesCustomField(requester, current, row.person_id) && readsCustomField(requester, row.person_id, current), 'custom_approval_unavailable', 403)
 const prepared = await customValueStatements(env, reviewer, row.person_id, { [row.row_id]: after.value }, after.effectiveFrom, { requireAll: false, approvedFields: new Set([row.row_id]) })
 const definition = prepared.definitions.find(item => item.id === row.row_id)
 insist(definition?.definitionVersionId === row.table_version_id, 'custom_definition_changed', 409)
 return [...(live?.guards ?? []), imageGuard(env, row), ...prepared.guards, ...prepared.statements]
}
