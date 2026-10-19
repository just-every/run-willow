// Explicit GENERIC columns share native definitions and value validation. ADP
// never selects these sources. Frozen bytes are disclosed under current access.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { insist } from './core'
import { readsCustomField } from './custom-fields/read'
import { definitionFromRow, effectiveField, fieldSchemas } from './custom-fields/store'
import type { FieldDefinitionRow, FieldValueRow } from './custom-fields/types'
import { validateFieldValue } from './custom-fields/validate'
import type { Line } from './payroll-calculation'
import type { PayrollSourceRows } from './payroll-sources'

export interface PayrollColumn { source: string; heading: string }
export const customColumnSources = (columns: PayrollColumn[]) => columns.map(column => column.source).filter(source => source.startsWith('custom.'))

export async function payrollCustomColumnOptions(env: Bindings, actor: Actor) {
  return (await fieldSchemas(env, actor.today)).flatMap(schema => {
    const field = effectiveField(schema)
    return field && field.classification === 'general' && !field.retired ? [{ source: `custom.${field.key}`, label: field.label }] : []
  })
}

/** A frozen file cannot be filtered without changing the reviewed bytes. */
export async function requirePayrollCustomAccess(env: Bindings, actor: Actor, columns: string[], people: string[]) {
  if (!columns.length) return
  const schemas = await fieldSchemas(env, actor.today)
  for (const source of columns) {
    const schema = schemas.find(field => `custom.${field.key}` === source)
    const current = schema && effectiveField(schema)
    insist(current?.classification === 'general' && people.every(person => readsCustomField(actor, person, current)), 'forbidden', 403)
  }
}

/** Values are selected at period end, validated against their own recorded version. */
export function payrollCustomValues(sources: PayrollSourceRows, actor: Actor, columns: PayrollColumn[], lines: Line[], asOf: string) {
  const identities = sources.wl_custom_fields
  const versions = sources.wl_custom_field_versions as FieldDefinitionRow[]
  const revisions = sources.wl_custom_field_values as FieldValueRow[]
  const people = [...new Set(lines.map(line => line.person))]
  const values = new Map<string, Record<string, unknown>>(people.map(person => [person, {}]))
  for (const source of customColumnSources(columns)) {
    const field = identities.find(field => source === `custom.${field.key}` && field.classification === 'general')
    insist(field, 'stale', 409)
    const definitions = versions.filter(version => version.field_id === field.id)
      .sort((left, right) => right.effective_from.localeCompare(left.effective_from) || right.version - left.version)
    const current = definitions.find(version => version.effective_from <= actor.today)
    const selected = definitions.find(version => version.effective_from <= asOf)
    insist(current && selected, 'payroll_custom_definition_unavailable', 409)
    const policy = { ...definitionFromRow(current), classification: 'general' as const }
    for (const person of people) {
      insist(readsCustomField(actor, person, policy), 'forbidden', 403)
      const revision = revisions.filter(row => row.field_id === field.id && row.person_id === person && row.effective_from <= asOf)
        .sort((left, right) => right.effective_from.localeCompare(left.effective_from) || right.sequence - left.sequence)[0]
      if (!revision) {
        values.get(person)![source] = validateFieldValue(definitionFromRow(selected), null)
        continue
      }
      const recorded = definitions.find(definition => definition.id === revision.definition_version_id)
      insist(recorded, 'stale', 409)
      values.get(person)![source] = validateFieldValue(definitionFromRow(recorded), JSON.parse(revision.value_json))
    }
  }
  return values
}
