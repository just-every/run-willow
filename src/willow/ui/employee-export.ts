import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { EXPORT_SECTIONS } from '../employee-bundle'
import { DEFAULT_EXPORT_FIELDS, EMPLOYEE_EXPORT_FIELDS, employeeCustomColumns, organizationExport } from '../employee-export'
import type { DirectoryFilters } from '../organization'
import { field, h, hidden, raw, select } from './html'

export async function employeeExportSection(env: Bindings, actor: Actor, filters: DirectoryFilters) {
  const custom = await employeeCustomColumns(env, actor, filters.date)
  const scopes = [
    ...(organizationExport(actor) ? [{ value: 'organization', label: 'Organization' }] : []),
    ...(actor.reports.size ? [{ value: 'team', label: 'My direct reports' }] : []),
    ...(actor.personId ? [{ value: 'self', label: 'My record' }] : []),
  ]
  if (!scopes.length) return ''
  return h`<section class="card"><details id="employee-export"><summary>Export employee records</summary>
<p>Choose fields and scope. Your current permissions apply on every date. Unavailable values are blank and named in each row’s withheld_fields column.</p>
<form method="get" action="/app/exports/employees.csv">
${select('Export scope', 'scope', scopes, scopes[0].value)}${field('Export as of', 'asOf', { type: 'date', value: filters.date })}
${['q', 'name', 'location', 'department', 'role', 'status'].map(key => hidden(key, filters[key as keyof DirectoryFilters]))}
<p class="hint">The current directory search and filters also apply to the export.</p>
<fieldset><legend>Fields to include</legend><div class="columns">${[...Object.entries(EMPLOYEE_EXPORT_FIELDS), ...custom.map(column => [column.key, column] as const)].map(([key, column]) => h`<label><input type="checkbox" name="fields" value="${key}"${DEFAULT_EXPORT_FIELDS.includes(key) ? raw(' checked') : ''}> ${column.label}</label>`)}</div></fieldset>
<fieldset><legend>Include in a records bundle</legend>${Object.entries(EXPORT_SECTIONS).map(([key, label]) => h`<label><input type="checkbox" name="history" value="${key}" checked> ${label}</label>`)}</fieldset>
<button type="submit" formaction="/app/exports/employees.zip" class="secondary">Download records and files ZIP</button><p class="hint">The ZIP contains your selected fields, permitted histories and readable document bytes. It is a readable export; an owner uses rer archives to restore an installation.</p>
<button type="submit">Download employee CSV</button> <button type="submit" formaction="/app/exports/employees.xlsx" class="secondary">Download employee XLSX</button>
</form></details></section>`
}
