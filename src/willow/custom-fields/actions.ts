import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { commit, guard, insist, newId, now, one, stmt } from '../core'
import type { Input } from '../input'
import { customValueStatements, customValuesInput, fieldSchemas } from './store'
import { validateCustomField, validateFieldDefinition } from './validate'

/** Native HTML and JSON actions converge before the shared strict validator. */
function definitionInput(input: Input): Record<string, unknown> {
  if (input.has('definition')) {
    const value = input.json('definition')
    insist(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid_field_definition')
    return value as Record<string, unknown>
  }
  const type = input.text('type'), validation: Record<string, unknown> = {}
  if (type === 'text') {
    validation.maxLength = input.integer('maxLength', { min: 1, max: 10000 })
    const min = input.integer('minLength', { optional: true, min: 0, max: 10000 })
    if (min !== null) validation.minLength = min
  } else if (type === 'number' || type === 'date') {
    for (const key of ['min', 'max']) { const bound=input.text(key,{optional:true,max:1024}); if(bound) validation[key]=bound }
  } else if (type === 'select') {
    validation.options = input.text('options', { max: 40000 }).split(/\r?\n/).filter(line => line.trim()).map(line => {
      const [value, ...label] = line.split('|')
      return { value: value.trim(), label: (label.length ? label.join('|') : value).trim() }
    })
  }
  return { ...(input.has('id') ? { id: input.text('id') } : {}), key: input.text('key'), classification: input.text('classification'),
    effectiveFrom: input.text('effectiveFrom'), label: input.text('label'), type, required: input.flag('required'),
    employeeRead: input.flag('employeeRead'), managerRead: input.flag('managerRead'), retired: input.flag('retired'), validation }
}

export async function defineField(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const raw = definitionInput(input)
  const { id: suppliedId, key, classification, ...definitionRaw } = raw
  insist(suppliedId === undefined || (typeof suppliedId === 'string' && suppliedId.length > 0 && suppliedId.length <= 200), 'invalid_field_id')
  const identity = validateCustomField({ key, classification }), definition = validateFieldDefinition(definitionRaw)
  insist(identity.classification === 'general' || (!definition.employeeRead && !definition.managerRead), 'restricted_field_visibility')
  const schemas = await fieldSchemas(env, definition.effectiveFrom), existing = suppliedId ? schemas.find(field => field.id === suppliedId) : null
  insist(!suppliedId || existing, 'not_found', 404)
  insist(!existing || (existing.key === identity.key && existing.classification === identity.classification), 'field_identity_is_immutable')
  insist(existing || !schemas.some(field => field.key === identity.key), 'duplicate_field_key')
  const id = existing?.id ?? newId(), versionId = newId(), at = now(), version = existing ? Math.max(...existing.versions.map(item => item.version)) + 1 : 1
  const statements = [guard(env, 'custom_definition_changed', '(SELECT COUNT(*) FROM wl_custom_field_versions) = ? AND (SELECT COUNT(*) FROM wl_custom_fields) = ?', schemas.reduce((sum, field) => sum + field.versions.length, 0), schemas.length)]
  if (!existing) statements.push(stmt(env, 'INSERT INTO wl_custom_fields (id, key, classification, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?)', id, identity.key, identity.classification, at, actor.id))
  statements.push(stmt(env, `INSERT INTO wl_custom_field_versions (id, field_id, version, effective_from, label, type, required, employee_read, manager_read, validation_json, retired, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    versionId, id, version, definition.effectiveFrom, definition.label, definition.type, +definition.required, +definition.employeeRead, +definition.managerRead, JSON.stringify(definition.validation), +definition.retired, at, actor.id))
  await commit(env, statements, { actor: actor.id, action: 'customField.define', subject: id, detail: { version, definitionVersionId: versionId } })
  return { id, versionId, version }
}

export async function writeFieldValues(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const person = input.text('person'), effectiveFrom = input.text('effectiveFrom')
  const native = await one(env, 'SELECT id FROM wl_people WHERE id = ?', person)
  insist(native, 'not_found', 404)
  const change = await customValueStatements(env, actor, person, customValuesInput(input), effectiveFrom, { requireAll: true })
  await commit(env, [...change.guards, guard(env, 'person_changed', 'EXISTS (SELECT 1 FROM wl_people WHERE id = ?)', person), ...change.statements],
    { actor: actor.id, action: 'customField.write', subject: person, detail: { effectiveFrom, fields: Object.keys(change.values) } })
  return { id: person, effectiveFrom, values: change.values }
}
