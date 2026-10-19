// PEOPLE-003: record-table sections for a person's page and the table definitions page.
import { can, type Actor } from '../actor'
import { formatDate } from '../dates'
import type { FieldValue } from '../custom-fields/types'
import type { PersonRecordTables } from '../record-tables/rows'
import { writesTable, type Column, type RecordTable } from '../record-tables/schema'
import { area, field, form, h, hidden, select, table, tag, type Html } from './html'

export const ASSET_CONDITIONS = ['new', 'good', 'fair', 'damaged', 'lost'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))
const CLASSES: Record<string, string> = { contact: 'Private contact', general: 'General', hr: 'Private / HR', payroll: 'Payroll' }
const check = (label: string, name: string, selected = false) => h`<label class="check"><input type="checkbox" name="${name}" value="yes"${selected ? h` checked` : ''}> ${label}</label>`

function display(value: FieldValue | undefined, column: Column): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (column.type === 'date') return formatDate(value)
  if (column.type === 'select') return (column.validation.options as { value: string; label: string }[]).find(option => option.value === value)?.label ?? value
  return value
}

function inputs(columns: Column[], values: Record<string, FieldValue> = {}): Html[] {
  return columns.map(column => {
    const name = `col.${column.key}`, value = values[column.key]
    if (column.type === 'boolean') return select(column.label, name, [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], typeof value === 'boolean' ? String(value) : '', { required: column.required, blank: 'Not recorded' })
    if (column.type === 'select') return select(column.label, name, column.validation.options as { value: string; label: string }[], String(value ?? ''), { required: column.required, blank: 'Not recorded' })
    return field(column.label, name, { type: column.type === 'date' ? 'date' : 'text', value: value ?? '', required: column.required })
  })
}

export function recordTablesSection(projected: PersonRecordTables, actor: Actor | undefined, personId: string): Html {
  if (!projected.tables.length) return h``
  return h`<section class="card facet-records"><h2>Records</h2>${projected.tables.map(item => {
    const writable = actor && !item.retired && writesTable(actor, personId, item as unknown as RecordTable)
    const back = `/app/people/${personId}`
    return h`<h3>${item.label} ${tag(CLASSES[item.classification])}</h3>
${item.rows.length ? table(['From', ...item.columns.map(column => column.label)], item.rows.map(row => [formatDate(row.effectiveFrom!), ...item.columns.map(column => display(row.values![column.key], column))])) : h`<p class="muted">No rows in force on ${formatDate(projected.asOf)}.</p>`}
${writable ? item.rows.map(row => h`<details><summary>Change ${display(row.values![item.columns[0].key], item.columns[0])}</summary>${form('recordRow.write', back, [hidden('person', personId), hidden('table', item.id), hidden('row', row.id), field('Effective from', 'effectiveFrom', { type: 'date', value: actor!.today }), ...inputs(item.columns, row.values!)], 'Save new version', { secondary: true })}${form('recordRow.write', back, [hidden('person', personId), hidden('table', item.id), hidden('row', row.id), hidden('remove', 'yes'), field('Removed from', 'effectiveFrom', { type: 'date', value: actor!.today })], 'Remove row', { secondary: true })}</details>`) : ''}
${[...item.rows, ...item.formerRows].some(row => row.history.length > 1 || !row.values) ? h`<details><summary>${item.label} history</summary>${table(['Row', 'Effective from', 'Values', 'Recorded by'], [...item.rows, ...item.formerRows].flatMap(row => row.history.map(version => [row.id.slice(0, 8), formatDate(version.effectiveFrom),
  version.removed ? 'Removed' : item.columns.map(column => `${column.label}: ${display(version.values[column.key], column)}`).join('; '), `${version.recordedBy} · ${new Date(version.recordedAt).toISOString()}`])))}</details>` : ''}
${writable && projected.asOf === actor!.today ? h`<details><summary>Add to ${item.label.toLowerCase()}</summary>${form('recordRow.write', back, [hidden('person', personId), hidden('table', item.id), field('Effective from', 'effectiveFrom', { type: 'date', value: actor!.today }), ...inputs(item.columns)], 'Add row', { secondary: true })}</details>` : ''}`
  })}</section>`
}

function tableForm(definition: RecordTable | null): Html {
  return form('recordTable.define', '/app/custom-fields', [
    definition ? h`${hidden('table', definition.id)}<p>${definition.key} · ${CLASSES[definition.classification]}</p>` : h`${field('Table key', 'key', { hint: 'Lowercase letters, numbers and underscores. The key and classification remain fixed.' })}${select('Classification', 'classification', ['general', 'hr', 'payroll'].map(value => ({ value, label: CLASSES[value] })))}`,
    field('Label', 'label', { value: definition?.current.label }),
    ...(definition?.classification === 'contact' ? [] : [h`<fieldset><legend>General tables only</legend>${check('The person may read their rows', 'employeeRead', definition?.current.employeeRead)}${check('Their current direct manager may read their rows', 'managerRead', definition?.current.managerRead)}</fieldset>`]),
    ...(definition?.builtIn ? [] : [area('Columns (JSON list of key, label, type, required and validation, as for custom fields)', 'columnsJson', JSON.stringify(definition?.current.columns ?? [{ key: 'name', label: 'Name', type: 'text', required: true, validation: { maxLength: 200 } }], null, 1), true)]),
    check('Retire this table', 'retired', definition?.current.retired),
  ], definition ? 'Save new version' : 'Create table')
}

export function recordTableDefinitions(tables: RecordTable[], actor: Actor): Html {
  if (!can(actor, 'people.manage')) return h``
  return h`<section class="card"><h2>Record tables</h2><p>Each person can hold several dated rows per table. Built-in tables keep fixed columns. Emergency contacts follow the private-contact rule: the person and members with private access. General tables may be shared with the person or their current direct manager; Private / HR and payroll tables need the matching access, as for custom fields.</p>
${tables.map(item => h`<h3>${item.current.label} ${tag(item.builtIn ? 'built-in' : 'custom')} ${item.current.retired ? tag('retired') : ''}</h3><p>${item.key} · ${CLASSES[item.classification]} · v${item.current.version} · ${item.current.columns.map(column => `${column.label} (${column.type}${column.required ? ', required' : ''})`).join(', ')}</p><details><summary>Change ${item.current.label.toLowerCase()}</summary>${tableForm(item)}</details>`)}
<details><summary>Create a table</summary>${tableForm(null)}</details></section>`
}
