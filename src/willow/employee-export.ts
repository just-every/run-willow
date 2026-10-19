// DATA-001: exports consume the same permission projection as a person's page.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { seesEveryone, type Facet } from './access'
import { auditRead, insist } from './core'
import { directoryFilters, filterDirectory } from './organization'
import { directory, personView } from './profile'
import { employeeCsv, employeeXlsx } from './export-formats'

type Person = Record<string, any>
type Column = { label: string; facet?: Facet; value: (person: Person) => unknown }
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
  employmentType: { label: 'Employment type', facet: 'employment', value: p => period(p)?.employmentType },
  startDate: { label: 'Employment start', facet: 'employment', value: p => period(p)?.startDate },
  endDate: { label: 'Employment end', facet: 'employment', value: p => period(p)?.endDate },
  schedule: { label: 'Working schedule', facet: 'employment', value: p => p.current?.schedule?.name },
  payrollId: { label: 'Payroll identifier', facet: 'payroll', value: p => period(p)?.payrollId },
  payBasis: { label: 'Pay basis', facet: 'pay', value: p => term(p)?.pay?.basis },
  payAmount: { label: 'Pay amount', facet: 'pay', value: p => term(p)?.pay?.amountCents == null ? '' : (term(p).pay.amountCents / 100).toFixed(2) },
  payCurrency: { label: 'Pay currency', facet: 'pay', value: p => term(p)?.pay?.currency },
  personalEmail: { label: 'Personal email', facet: 'private', value: p => p.private?.personal_email },
  phone: { label: 'Phone', facet: 'private', value: p => p.private?.phone },
  address: { label: 'Home address', facet: 'private', value: p => p.private?.address },
  dateOfBirth: { label: 'Date of birth', facet: 'private', value: p => p.private?.date_of_birth },
  emergencyContact: { label: 'Emergency contact', facet: 'private', value: p => p.private?.emergency_contact },
}

export const organizationExport = (actor: Actor) => seesEveryone(actor)
export const DEFAULT_EXPORT_FIELDS = ['name', 'workEmail', 'jobTitle', 'department', 'location', 'manager', 'status']

export async function employeeExportData(env: Bindings, actor: Actor, url: URL) {
  const scope = url.searchParams.get('scope')
  insist(['self', 'team', 'organization'].includes(scope ?? ''), 'export_scope_required')
  insist(scope !== 'organization' || organizationExport(actor), 'forbidden', 403)
  insist(scope !== 'team' || actor.reports.size > 0, 'forbidden', 403)
  insist(scope !== 'self' || actor.personId, 'forbidden', 403)
  const fields = url.searchParams.getAll('fields').flatMap(value => value.split(','))
  insist(fields.length > 0 && fields.length <= Object.keys(EMPLOYEE_EXPORT_FIELDS).length
    && new Set(fields).size === fields.length && fields.every(key => Object.hasOwn(EMPLOYEE_EXPORT_FIELDS, key)), 'invalid_export_fields')
  const filters = directoryFilters(url.searchParams, actor.today)
  const scoped = (await directory(env, actor, filters.date)).filter(person =>
    scope === 'organization' || (scope === 'self' ? person.id === actor.personId : actor.reports.has(person.id)))
  const selected = url.searchParams.getAll('person')
  insist(selected.every(id => scoped.some(person => person.id === id)), 'export_person_out_of_scope', 403)
  const people = filterDirectory(scoped, filters).filter(person => !selected.length || selected.includes(person.id))
  const rows: string[][] = [['person_id', 'as_of', 'scope', 'withheld_fields', ...fields]]
  const records: Person[] = []
  for (const person of people) {
    const view = await personView(env, actor, person.id, { asOf: filters.date }) as Person
    records.push(view)
    const withheld = fields.filter(key => EMPLOYEE_EXPORT_FIELDS[key].facet && !view.facets.includes(EMPLOYEE_EXPORT_FIELDS[key].facet!))
    rows.push([person.id, filters.date, scope!, withheld.join(';'), ...fields.map(key => withheld.includes(key) ? '' : String(EMPLOYEE_EXPORT_FIELDS[key].value(view) ?? ''))])
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
