import { liveSettingsActor } from '../levels/settings-authority'
import type { Bindings } from '../../auth.server'
import { can, requirePermission, type Actor } from '../actor'
import { all, auditRead, guard, insist, newId, now, one, stmt } from '../core'
import type { CustomField, FieldDefinitionRow, FieldDefinitionVersion, FieldValue, FieldValueRow } from './types'
import { isISODate, validateFieldValue } from './validate'

export type EffectiveField = CustomField & FieldDefinitionVersion & { definitionVersionId: string }
export interface FieldSchema extends CustomField { definition: FieldDefinitionVersion | null; versions: FieldDefinitionVersion[] }

export function definitionFromRow(row: FieldDefinitionRow): FieldDefinitionVersion {
  return { id: row.id, fieldId: row.field_id, version: row.version, effectiveFrom: row.effective_from,
    label: row.label, type: row.type, required: !!row.required, employeeRead: !!row.employee_read,
    managerRead: !!row.manager_read, validation: JSON.parse(row.validation_json), retired: !!row.retired,
    recordedAt: row.recorded_at, recordedBy: row.recorded_by } as FieldDefinitionVersion
}

/** Metadata only. Person values must always go through read.ts. */
export async function fieldSchemas(env: Bindings, asOf: string): Promise<FieldSchema[]> {
  insist(isISODate(asOf), 'invalid_asOf')
  const [identities, versions] = await Promise.all([
    all<{ id: string; key: string; classification: CustomField['classification']; recorded_at: number; recorded_by: string }>(env, 'SELECT * FROM wl_custom_fields ORDER BY key'),
    all<FieldDefinitionRow>(env, 'SELECT * FROM wl_custom_field_versions ORDER BY effective_from DESC, version DESC'),
  ])
  return identities.map(row => {
    const history = versions.filter(version => version.field_id === row.id).map(definitionFromRow)
    return { id: row.id, key: row.key, classification: row.classification, recordedAt: row.recorded_at,
      recordedBy: row.recorded_by, definition: history.find(version => version.effectiveFrom <= asOf) ?? null, versions: history }
  })
}

export function effectiveField(schema: FieldSchema, definition = schema.definition): EffectiveField | null {
  return definition ? { ...definition, id: schema.id, key: schema.key, classification: schema.classification, definitionVersionId: definition.id } : null
}

export async function effectiveFieldDefinitions(env: Bindings, asOf: string): Promise<EffectiveField[]> {
  return (await fieldSchemas(env, asOf)).flatMap(schema => { const field = effectiveField(schema); return field ? [field] : [] })
}

/** Schema management includes retired and scheduled versions. */
export async function listFieldDefinitions(env: Bindings, actor: Actor, asOf = actor.today) {
  await liveSettingsActor(env,actor,'custom-fields')
  return fieldSchemas(env, asOf)
}

export const writesCustomField = (actor: Actor, field: Pick<CustomField, 'classification'>) =>
  can(actor, 'people.manage') && (field.classification === 'general' || can(actor, field.classification === 'hr' ? 'people.private' : 'pay.read'))

/** HTML controls carry explicit keys, preserving optional clears and boolean false. */
export function customValuesInput(input: import('../input').Input): unknown {
  if (input.has('customValues')) return input.json('customValues')
  if (input.has('values')) return input.json('values')
  const keys = input.list('customField')
  insist(new Set(keys).size === keys.length && keys.every(key => /^[a-z][a-z0-9_]{0,63}$/.test(key)), 'invalid_field_key')
  return Object.fromEntries(keys.map(key => {
    const value = input.text(`custom.${key}`, { optional: true, max: 10000 })
    return [key, input.list('customBoolean').includes(key) ? (value === '' ? null : value === 'true' ? true : value === 'false' ? false : value) : value]
  }))
}

/** Guards are separate: callers put both arrays into the same business commit. No person lookup permits native creation earlier in that batch. */
export async function customValueStatements(env: Bindings, actor: Actor, personId: string, rawValues: unknown,
  effectiveFrom: string, { requireAll = true, approvedFields }: { requireAll?: boolean; approvedFields?: ReadonlySet<string> } = {}) {
  if (!approvedFields) requirePermission(actor, 'people.manage')
  const writable = (field: Pick<CustomField, 'id' | 'classification'>) => approvedFields ? approvedFields.has(field.id) : writesCustomField(actor, field)
  insist(isISODate(effectiveFrom), 'invalid_field_date')
  insist(rawValues !== null && typeof rawValues === 'object' && !Array.isArray(rawValues), 'invalid_field_values')
  const schemas = await fieldSchemas(env, effectiveFrom), submitted = rawValues as Record<string, unknown>
  const definitions = schemas.flatMap(schema => { const value = effectiveField(schema); return value ? [value] : [] })
  const supplied = new Map<string, unknown>()
  for (const [key, value] of Object.entries(submitted)) {
    const definition = definitions.find(field => field.key === key || field.id === key)
    insist(definition && !definition.retired, 'unknown_or_retired_field')
    insist(!supplied.has(definition.id), 'duplicate_field_value')
    insist(writable(definition), 'forbidden', 403)
    supplied.set(definition.id, value)
  }
  const needed = definitions.filter(field => !field.retired && (supplied.has(field.id) || (requireAll && field.required)))
  const relevant = needed.filter(field => writable(field))
  // Required restricted fields may already be populated. Check presence without selecting their values.
  const requiredGuards = await Promise.all(needed.filter(field => !writable(field)).map(async field => {
    const existing = await one<{ id: string; populated: number }>(env, `SELECT id, CASE WHEN json_type(value_json) <> 'null' AND NOT (json_type(value_json)='text' AND length(trim(json_extract(value_json,'$')))=0) THEN 1 ELSE 0 END AS populated FROM wl_custom_field_values WHERE person_id = ? AND field_id = ? AND effective_from <= ? ORDER BY effective_from DESC, sequence DESC LIMIT 1`, personId, field.id, effectiveFrom)
    insist(existing?.populated, 'required_field_value', 400, { key: field.key })
    return guard(env, 'custom_values_changed', `(SELECT id FROM wl_custom_field_values WHERE person_id = ? AND field_id = ? AND effective_from <= ? ORDER BY effective_from DESC, sequence DESC LIMIT 1) = ?`, personId, field.id, effectiveFrom, existing.id)
  }))
  const rows = (await Promise.all(relevant.map(field => all<FieldValueRow>(env,
    'SELECT * FROM wl_custom_field_values WHERE person_id = ? AND field_id = ? ORDER BY effective_from DESC, sequence DESC', personId, field.id)))).flat()
  const restricted = relevant.filter(field => field.classification !== 'general')
  if (restricted.some(field => rows.some(row => row.field_id === field.id))) {
    await auditRead(env, actor.id, 'customField.private.read', personId, { reason: 'write-validation', asOf: effectiveFrom, fields: restricted.map(field => field.id) })
  }
  const guards = [guard(env, 'custom_definition_changed', '(SELECT COUNT(*) FROM wl_custom_field_versions) = ? AND (SELECT COUNT(*) FROM wl_custom_fields) = ?', schemas.reduce((sum, field) => sum + field.versions.length, 0), schemas.length), ...requiredGuards]
  const statements: D1PreparedStatement[] = [], values: Record<string, FieldValue> = {}, at = now()
  for (const definition of relevant) {
    const history = rows.filter(row => row.field_id === definition.id)
    const effective = history.find(row => row.effective_from <= effectiveFrom)
    const image = history.map(row => `${row.id}:${row.revision}`).sort().join('|')
    guards.push(guard(env, 'custom_values_changed', `(SELECT COALESCE(group_concat(image, '|'), '') FROM (SELECT id || ':' || revision AS image FROM wl_custom_field_values WHERE person_id = ? AND field_id = ? ORDER BY id)) = ?`, personId, definition.id, image))
    const hasValue = supplied.has(definition.id)
    const value = validateFieldValue(definition, hasValue ? supplied.get(definition.id) : effective ? JSON.parse(effective.value_json) : null)
    values[definition.key] = value
    if (!hasValue) continue
    const id = newId(), sequence = Math.max(0, ...history.map(row => row.sequence)) + 1
    const corrects = history.find(row => row.effective_from === effectiveFrom)?.id ?? null
    statements.push(stmt(env, `INSERT INTO wl_custom_field_values (id, person_id, field_id, definition_version_id, effective_from, sequence, value_json, corrects_id, origin, revision, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'native', ?, ?, ?)`,
      id, personId, definition.id, definition.definitionVersionId, effectiveFrom, sequence, JSON.stringify(value), corrects, newId(), at, actor.id))
  }
  return { statements, guards, values, definitions }
}
