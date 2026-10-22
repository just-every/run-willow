import type { JobField } from './levels/job'
// DATA-001: exports consume the same permission projection as a person's page.
import type { Bindings } from '../auth.server'
import { hasScopedGrant, scopedPeople, type Actor } from './actor'
import { seesEveryone, type Facet } from './access'
import { auditRead, insist } from './core'
import { directoryFilters, filterDirectory } from './organization'
import { directory, personView } from './profile'
import { readsCustomField } from './custom-fields/read'
import { effectiveField, effectiveFieldDefinitions, fieldSchemas, type EffectiveField } from './custom-fields/store'
import { employeeCsv, employeeXlsx } from './export-formats'

type Person = Record<string, any>
type Column = { job?: JobField; personal?: string; label: string; facet?: Facet; value: (person: Person) => unknown }
const period = (person: Person) => person.employment?.find((row: Person) => row.id === person.selectedPeriod)
const term = (person: Person) => period(person)?.terms.find((row: Person) => row.inForce)
export const EMPLOYEE_EXPORT_FIELDS: Record<string, Column> = {
  name: { label: 'Name', value: p => p.name },
  legalName: { label: 'Legal name', value: p => p.legalName },
  preferredName: { label: 'Preferred name', value: p => p.preferredName },
  workEmail: { label: 'Work email', value: p => p.workEmail },
  status: { label: 'Employment status', value: p => p.status },
  jobTitle: { label: 'Job title', value: p => p.current?.jobTitle },
  department: { label: 'Department', value: p => p.current?.department?.name },
  location: { label: 'Location', value: p => p.current?.location?.name },
  manager: { label: 'Manager', value: p => p.current?.manager?.name },
  employeeNumber: { label: 'Employee number', facet: 'employment', value: p => p.employeeNumber },
  employmentType: { job: 'employmentType', label: 'Employment type', facet: 'employment', value: p => period(p)?.employmentType },
  startDate: { job: 'startDate', label: 'Employment start', facet: 'employment', value: p => period(p)?.startDate },
  endDate: { job: 'endDate', label: 'Employment end', facet: 'employment', value: p => period(p)?.endDate },
  schedule: { job: 'scheduleId', label: 'Working schedule', facet: 'employment', value: p => p.current?.schedule?.name },
  fte: { job:'fte', label:'FTE', facet:'employment', value:p=>p.current?.fte },
  payrollId: { label: 'Payroll identifier', facet: 'payroll', value: p => period(p)?.payrollId },
  payBasis: { label: 'Pay basis', facet: 'pay', value: p => term(p)?.pay?.basis },
  payAmount: { label: 'Pay amount', facet: 'pay', value: p => term(p)?.pay?.amountCents == null ? '' : (term(p).pay.amountCents / 100).toFixed(2) },
  payCurrency: { label: 'Pay currency', facet: 'pay', value: p => term(p)?.pay?.currency },
  personalEmail: { personal: 'personal_email', label: 'Personal email', facet: 'private', value: p => p.private?.personal_email },
  phone: { personal: 'phone', label: 'Phone', facet: 'private', value: p => p.private?.phone },
  address: { personal: 'address', label: 'Home address', facet: 'private', value: p => p.private?.address },
  dateOfBirth: { personal: 'date_of_birth', label: 'Date of birth', facet: 'private', value: p => p.private?.date_of_birth },
  emergencyContact: { personal: 'emergency_contact', label: 'Emergency contact', facet: 'private', value: p => p.private?.emergency_contact },
}

// A scoped holder's organization export is exactly the people their scoped levels reach.
const EXPORT_RIGHTS = ['people.manage', 'reports.read', 'leave.manage'] as const
export const organizationExport = (actor: Actor) => seesEveryone(actor) || hasScopedGrant(actor, ...EXPORT_RIGHTS)
const exportPeople = (actor: Actor) => seesEveryone(actor) ? null : scopedPeople(actor, ...EXPORT_RIGHTS)
export const DEFAULT_EXPORT_FIELDS = ['name', 'workEmail', 'jobTitle', 'department', 'location', 'manager', 'status']

/** Display choices use current visibility even when the export date is historic. */
export async function employeeCustomColumns(env: Bindings, actor: Actor, asOf = actor.today) {
  return (await fieldSchemas(env, asOf)).flatMap(schema => {
    const definition = effectiveField(schema), current = schema.versions.find(version => version.effectiveFrom <= actor.today)
    const policy = current ? effectiveField(schema, current) : definition ? { ...definition, employeeRead: false, managerRead: false } : null
    const visible = policy && [actor.personId ?? '', ...actor.reports, ...scopedPeople(actor, ...EXPORT_RIGHTS)].some(personId => readsCustomField(actor, personId, policy))
    return definition && visible ? [{ key: `custom.${schema.key}`, label: definition.label, definition }] : []
  })
}

export function selectedCustomFields(url: URL): string[] {
  return url.searchParams.getAll('fields').flatMap(value => value.split(',')).filter(key => key.startsWith('custom.')).map(key => key.slice(7))
}


export async function employeeExportData(env: Bindings, actor: Actor, url: URL) {
  const scope = url.searchParams.get('scope')
  insist(['self', 'team', 'organization'].includes(scope ?? ''), 'export_scope_required')
  insist(scope !== 'organization' || organizationExport(actor), 'forbidden', 403)
  insist(scope !== 'team' || actor.reports.size > 0, 'forbidden', 403)
  insist(scope !== 'self' || actor.personId, 'forbidden', 403)
  const filters = directoryFilters(url.searchParams, actor.today)
  const customDefinitions = await effectiveFieldDefinitions(env, filters.date)
  const columns: Record<string, Column> = { ...EMPLOYEE_EXPORT_FIELDS, ...Object.fromEntries(customDefinitions.map(definition => [
    `custom.${definition.key}`, { label: definition.label, value: (person: Person) => person.customFields?.fields.find((item: EffectiveField) => item.key === definition.key)?.value },
  ])) }
  const fields = url.searchParams.getAll('fields').flatMap(value => value.split(','))
  insist(fields.length > 0 && fields.length <= Object.keys(columns).length
    && new Set(fields).size === fields.length && fields.every(key => Object.hasOwn(columns, key)), 'invalid_export_fields')
  const customKeys = new Set(selectedCustomFields(url))
  const limit = exportPeople(actor)
  const scoped = (await directory(env, actor, filters.date)).filter(person =>
    scope === 'organization' ? !limit || limit.has(person.id) : (scope === 'self' ? person.id === actor.personId : actor.reports.has(person.id)))
  const selected = url.searchParams.getAll('person')
  insist(selected.every(id => scoped.some(person => person.id === id)), 'export_person_out_of_scope', 403)
  const people = filterDirectory(scoped, filters).filter(person => !selected.length || selected.includes(person.id))
  const rows: string[][] = [['person_id', 'as_of', 'scope', 'withheld_fields', ...fields]]
  const records: Person[] = []
  for (const person of people) {
    const view = await personView(env, actor, person.id, { asOf: filters.date, customFields: definition => customKeys.has(definition.key) }) as Person
    records.push(view)
    const withheld = fields.filter(key => key.startsWith('custom.') ? !view.customFields.fields.some((item: EffectiveField) => `custom.${item.key}` === key) : columns[key].job ? !view.jobFields?.[columns[key].job!] : columns[key].personal ? !Object.hasOwn(view.private ?? {},columns[key].personal!) : columns[key].facet === 'pay' ? !term(view)?.pay : columns[key].facet && !view.facets.includes(columns[key].facet!))
    rows.push([person.id, filters.date, scope!, withheld.join(';'), ...fields.map(key => withheld.includes(key) ? '' : String(columns[key].value(view) ?? ''))])
  }
  return { scope: scope!, asOf: filters.date, fields, rows, records }
}

export async function employeeExport(env: Bindings, actor: Actor, url: URL, format: 'csv' | 'xlsx') {
  const { scope, asOf, fields, rows, records } = await employeeExportData(env, actor, url)
  await auditRead(env, actor.id, 'employee.export', scope, { asOf, fields, people: records.length, format })
  const body = format === 'csv' ? employeeCsv(rows) : employeeXlsx(rows)
  return new Response(body as BodyInit, { headers: {
    'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'content-disposition': `attachment; filename="willow-employees-${asOf}.${format}"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } })
}
