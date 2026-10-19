import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, auditRead, insist } from '../core'
import { effectiveField, fieldSchemas, type EffectiveField } from './store'
import type { FieldClassification, FieldValueRevision, FieldValueRow } from './types'
import { isISODate } from './validate'

export type ReadableDefinition = { classification: FieldClassification; employeeRead: boolean; managerRead: boolean }

/** Existing current-or-first-upcoming reports and current flags confer general-field access. */
export function readsCustomField(actor: Actor, personId: string, definition: ReadableDefinition): boolean {
  if (actor.owner) return true
  if (definition.classification === 'hr') return can(actor, 'people.private')
  if (definition.classification === 'payroll') return can(actor, 'pay.read')
  return can(actor, 'people.manage') || (actor.personId === personId && definition.employeeRead) ||
    (actor.reports.has(personId) && definition.managerRead)
}

export function valueFromRow(row: FieldValueRow): FieldValueRevision {
  return { id: row.id, personId: row.person_id, fieldId: row.field_id, definitionVersionId: row.definition_version_id,
    effectiveFrom: row.effective_from, sequence: row.sequence, value: JSON.parse(row.value_json), correctsId: row.corrects_id,
    origin: row.origin, revision: row.revision, recordedAt: row.recorded_at, recordedBy: row.recorded_by }
}

/** Shared person projection for HTML, agents, previews, reports and exports. No directory use. */
export async function personCustomFields(env: Bindings, actor: Actor, personId: string, asOf = actor.today,
  allow?: (definition: EffectiveField) => boolean) {
  insist(isISODate(asOf), 'invalid_asOf')
  const schemas = await fieldSchemas(env, asOf)
  const readable = schemas.flatMap(schema => {
    const selected = effectiveField(schema)
    const current = schema.versions.find(version => version.effectiveFrom <= actor.today)
    // No future visibility flag grants early access to a newly scheduled field.
    const policy = current ? effectiveField(schema, current)! : selected ? { ...selected, employeeRead: false, managerRead: false } : null
    return selected && policy && readsCustomField(actor, personId, policy) && (!allow || allow(policy)) ? [{ schema, selected, policy }] : []
  })
  // Filter identities before constructing any SQL that selects value_json. Bound chunks stay within D1's parameter limit.
  const chunks = Array.from({ length: Math.ceil(readable.length / 50) }, (_, index) => readable.slice(index * 50, (index + 1) * 50))
  const rows = (await Promise.all(chunks.map(chunk => all<FieldValueRow>(env,
    `SELECT * FROM wl_custom_field_values WHERE person_id = ? AND field_id IN (${chunk.map(() => '?').join(',')}) ORDER BY effective_from DESC, sequence DESC`,
    personId, ...chunk.map(field => field.schema.id))))).flat()
  if (readable.some(field => field.schema.classification !== 'general')) {
    await auditRead(env, actor.id, 'customField.private.read', personId, { asOf, fields: readable.filter(field => field.schema.classification !== 'general').map(field => field.schema.id) })
  }
  return { asOf, fields: readable.map(({ schema, selected, policy }) => {
    const history = rows.filter(row => row.field_id === schema.id).map(valueFromRow)
    const revision = history.find(row => row.effectiveFrom <= asOf)
    return { id: schema.id, key: schema.key, classification: schema.classification, definition: selected,
      currentDefinition: policy, value: revision?.value ?? null, valueRevisionId: revision?.id ?? null,
      definitions: schema.versions, history }
  }) }
}

export type PersonCustomFields = Awaited<ReturnType<typeof personCustomFields>>
