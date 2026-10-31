import { msg } from '../locale/runtime'
import { content,contentLabel } from './html'
import { holdsSetting } from '../levels/settings'
import { can, type Actor } from '../actor'
import { formatDate } from '../dates'
import type { PersonCustomFields } from '../custom-fields/read'
import { writesCustomField, type EffectiveField, type FieldSchema } from '../custom-fields/store'
import type { FieldDefinitionVersion, FieldValue } from '../custom-fields/types'
import { area, field, form, h, hidden, select, table, tag, type Html } from './html'

const classes = [{ value: 'general', label: 'General' }, { value: 'hr', label: 'Private / HR' }, { value: 'payroll', label: 'Payroll' }]
const types = ['text', 'number', 'date', 'boolean', 'select'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))
const check = (label: string, name: string, selected = false) => h`<label class="check"><input type="checkbox" name="${name}" value="yes"${selected ? h` checked` : ''}> ${label}</label>`

function definitionForm(actor: Actor, schema: FieldSchema | null, returnTo: string) {
  const latest = schema?.versions.reduce<FieldDefinitionVersion | null>((winner, version) => !winner || version.version > winner.version ? version : winner, null)
  const rules = latest?.validation as { minLength?: number; maxLength?: number; min?: string; max?: string; options?: { value: string; label: string }[] } | undefined
  return form('customField.define', returnTo, [
    schema ? h`${hidden('id', schema.id)}${hidden('key', schema.key)}${hidden('classification', schema.classification)}<p>${schema.key} · ${classes.find(item => item.value === schema.classification)?.label}</p>` : h`${field('Field key', 'key', { hint: 'Lowercase letters, numbers and underscores. The key and classification remain fixed.' })}${select('Classification', 'classification', classes)}`,
    field('Label', 'label', { value: latest?.label }), select('Type', 'type', types, latest?.type ?? 'text'),
    field('Effective from', 'effectiveFrom', { type: 'date', value: actor.today }),
    check('Required', 'required', latest?.required),
    h`<fieldset><legend>General fields only</legend>${check('The person may read this field', 'employeeRead', latest?.employeeRead)}${check('Their current direct manager may read this field', 'managerRead', latest?.managerRead)}</fieldset>`,
    h`<details><summary>Text limits</summary>${field('Maximum characters', 'maxLength', { value: rules?.maxLength ?? 200 })}${field('Minimum characters (optional)', 'minLength', { value: rules?.minLength ?? '', required: false })}</details>`,
    h`<details><summary>Number or date limits</summary>${field('Minimum (optional)', 'min', { value: rules?.min ?? '', required: false })}${field('Maximum (optional)', 'max', { value: rules?.max ?? '', required: false })}</details>`,
    h`<details><summary>Select choices</summary>${area('One choice per line; use value|label for a separate label', 'options', rules?.options?.map(option => `${option.value}|${option.label}`).join('\n') ?? '', false)}</details>`,
    check('Retire this field from this date', 'retired', latest?.retired),
  ], schema ? 'Save new version' : 'Create field')
}

function definitionHistory(definitions: FieldDefinitionVersion[]) {
  return table(['Version', 'Effective from', 'Label and type', 'Rules', 'Visibility', 'Recorded by'], definitions.map(definition => [
    `v${definition.version}`, formatDate(definition.effectiveFrom), `${definition.label} (${definition.type})`,
    `${definition.required ? 'Required' : 'Optional'}${definition.retired ? '; retired' : ''}; ${ruleDescription(definition)}`,
    [definition.employeeRead ? 'Person' : '', definition.managerRead ? 'Direct manager' : ''].filter(Boolean).join(', ') || 'Matching permission',
    `${definition.recordedBy} · ${new Date(definition.recordedAt).toISOString()}`,
  ]))
}

function ruleDescription(definition: FieldDefinitionVersion | EffectiveField): string {
  switch (definition.type) {
    case 'text': return `${definition.validation.minLength ?? 0}–${definition.validation.maxLength} characters`
    case 'number': case 'date': return `Minimum ${definition.validation.min ?? 'none'}; maximum ${definition.validation.max ?? 'none'}`
    case 'boolean': return 'Yes or no'
    case 'select': return definition.validation.options.map(option => `${option.label} (${option.value})`).join(', ')
  }
}

export function fieldDefinitionSection(definitions: FieldSchema[], actor: Actor, returnTo = '/app/custom-fields'): Html {
  if (!holdsSetting(actor, 'custom-fields')) return h``
  return h`<section class="card"><h2>Custom fields</h2><p>Each change saves a dated version. General fields may be shared with the person or their current direct manager. Private / HR fields require private access; payroll fields require compensation access. Current access rules also apply to history.</p>
${definitions.length ? definitions.map(schema => h`<h3>${schema.definition?.label ?? schema.versions[0]?.label ?? schema.key} ${tag(schema.definition?.retired ? 'retired' : schema.definition ? 'in force' : 'upcoming')}</h3><p>${schema.key} · ${classes.find(item => item.value === schema.classification)?.label}</p><details><summary>Definition history</summary>${definitionHistory(schema.versions)}</details><details><summary>Change or retire field</summary>${definitionForm(actor, schema, returnTo)}</details>`) : h`<p class="muted">No custom fields.</p>`}
<details><summary>Create a field</summary>${definitionForm(actor, null, returnTo)}</details></section>`
}

/** Reusable in native joiner, person edit and standalone field write forms. */
export function customValueInputs(definitions: EffectiveField[], values: Record<string, FieldValue> = {}): Html {
  return h`${definitions.filter(definition => !definition.retired).map(definition => {
    const name = `custom.${definition.key}`, value = values[definition.key] ?? ''
    const control = definition.type === 'boolean' ? h`${hidden('customBoolean', definition.key)}${select(contentLabel('customField',((definition as EffectiveField).definitionVersionId??definition.id),'label',definition.label), name, [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], typeof value === 'boolean' ? String(value) : '', { required: definition.required, blank: 'Not recorded' })}` :
      definition.type === 'select' ? select(contentLabel('customField',((definition as EffectiveField).definitionVersionId??definition.id),'label',definition.label), name, definition.validation.options.map(o=>({...o,label:contentLabel('customField',((definition as EffectiveField).definitionVersionId??definition.id),'option:'+o.value,o.label)})), String(value), { required: definition.required, blank: 'Not recorded' }) :
        field(contentLabel('customField',((definition as EffectiveField).definitionVersionId??definition.id),'label',definition.label), name, { type: definition.type === 'date' ? 'date' : 'text', value, required: definition.required, hint: ruleDescription(definition) })
    return h`${hidden('customField', definition.key)}${control}`
  })}`
}

export function customPersonSection(projected: PersonCustomFields, actor?: Actor, personId?: string): Html {
  if (!projected.fields.length) return h``
  const visible = projected.fields
  const editable = actor ? visible.filter(item => writesCustomField(actor, item.currentDefinition) && !item.currentDefinition.retired) : []
  const values = Object.fromEntries(visible.map(item => [item.key, item.value]))
  return h`<section class="card"><h2>Custom fields</h2>${table(['Field', 'Value', 'Definition'], visible.map(item => [content('customField',item.definition.definitionVersionId,'label',item.definition.label), displayValue(item.value, item.definition), `${item.key} · v${item.definition.version}${item.definition.retired ? ' (retired)' : ''}`]))}
${visible.map(item => h`<details><summary>${content('customField',item.definition.definitionVersionId,'label',item.definition.label)} history</summary>${definitionHistory(item.definitions)}${table(['Effective from', 'Value', 'Definition', 'Revision', 'Recorded by'], item.history.map(revision => {
    const definition = item.definitions.find(version => version.id === revision.definitionVersionId)
    return [formatDate(revision.effectiveFrom), displayValue(revision.value, definition), definition ? `${definition.label} · v${definition.version}` : revision.definitionVersionId,
      h`${revision.id}${revision.correctsId ? h`<br>Corrects ${revision.correctsId}` : ''}`, `${revision.recordedBy} · ${new Date(revision.recordedAt).toISOString()}`]
  }))}</details>`)}
${actor && personId && editable.length && projected.asOf === actor.today ? h`<details><summary>Update custom fields</summary>${form('customField.write', `/app/people/${personId}`, [hidden('person', personId), field('Effective from', 'effectiveFrom', { type: 'date', value: actor.today }), customValueInputs(editable.map(item => item.currentDefinition), values)], 'Save custom fields')}</details>` : ''}</section>`
}

function displayValue(value: FieldValue, definition?: FieldDefinitionVersion | EffectiveField): string {
  if (value === null) return msg('Not recorded')
  if (typeof value === 'boolean') return msg(value ? 'Yes' : 'No')
  if (definition?.type === 'select') return contentLabel('customField',((definition as EffectiveField).definitionVersionId??definition.id),'option:'+value,definition.validation.options.find(option => option.value === value)?.label ?? value)
  return value
}
