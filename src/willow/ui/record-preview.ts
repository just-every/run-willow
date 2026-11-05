// Presentation of the already access-intersected person projection. This renderer
// performs no reads and never turns record identifiers into visible values.
import { formatDate, formatInstant, hours, isDate } from '../dates'
import { PRIVATE_LABELS } from '../people'
import { formatMoney, formatPay } from '../money'
import { h, table, type Html } from './html'
import { KIND_LABELS, TYPE_LABELS } from './labels'

const LABELS: Record<string, string> = {
  name: 'Name', legalName: 'Legal name', preferredName: 'Preferred name', workEmail: 'Work email', employeeNumber: 'Employee number',
  asOf: 'Record as of', status: 'Status', current: 'Current role', jobTitle: 'Job title', department: 'Department', division: 'Division',
  location: 'Location', manager: 'Manager', schedule: 'Working schedule', weeklyMinutes: 'Scheduled hours per week', fte: 'Full-time equivalent',
  private: 'Private details', ...PRIVATE_LABELS, employment: 'Employment periods', startDate: 'Start date', endDate: 'End date',
  employmentType: 'Employment type', legalEntity: 'Legal entity', payrollId: 'Payroll identifier', endReason: 'End reason',
  terms: 'Employment terms', effectiveFrom: 'Effective from', reason: 'Reason', inForce: 'In force', recordedAt: 'Recorded',
  pay: 'Pay', compensation: 'Compensation', salary: 'Salary', bonus: 'Bonus', bonuses: 'Bonuses', equity: 'Equity',
  payHistory: 'Pay history', salaryHistory: 'Salary history', bonusHistory: 'Bonus history', equityHistory: 'Equity history',
  payRecords: 'Pay records', compensationRecords: 'Compensation records', bands: 'Pay bands', cycles: 'Compensation reviews',
  leave: 'Leave', accounts: 'Leave accounts', policy: 'Leave policy', version: 'Version', openingStatus: 'Opening balance',
  cutoverDate: 'Opening balance date', openingMinutes: 'Opening hours', accruedThrough: 'Accrued through', balanceMinutes: 'Balance in hours',
  ledger: 'Leave ledger', kind: 'Entry', minutes: 'Hours', effectiveDate: 'Effective date', note: 'Note',
  requests: 'Leave requests', requestedAt: 'Requested', decidedAt: 'Decided', decisionNote: 'Decision note', cancelNote: 'Cancellation note',
  hours: 'Hours', calendar: 'Absence calendar', withheld: 'Withheld information',
  cases: 'Lifecycle cases', anchorDate: 'Case date', openTasks: 'Open tasks', documents: 'Documents', title: 'Title',
  category: 'Category', versions: 'Versions', number: 'Version', filename: 'File name', acknowledgedAt: 'Receipt acknowledged',
  acknowledgementRequested: 'Receipt requested', uploadedAt: 'Uploaded', createdAt: 'Created',
  customFields: 'Custom fields', fields: 'Fields', label: 'Label', value: 'Value', values: 'Values', history: 'History',
  effectiveTo: 'Effective through', recordedOn: 'Recorded on', retired: 'Retired', required: 'Required',
  recordTables: 'Records', tables: 'Tables', rows: 'Current entries', formerRows: 'Earlier entries', columns: 'Columns', removed: 'Removed',
  classification: 'Visibility', type: 'Type', general: 'General', currentDefinition: 'Field definition',
  basis: 'Pay basis', amountCents: 'Amount', currency: 'Currency', amount: 'Amount', units: 'Units', grantDate: 'Grant date', vestDate: 'Vesting date',
  effective_from: 'Effective from', amount_cents: 'Amount', previous_cents: 'Previous amount', job_title: 'Job title', level: 'Job level',
}
const VALUES: Record<string, string> = {
  ...TYPE_LABELS, ...KIND_LABELS, hr: 'HR', it: 'IT', payroll: 'Payroll', employee: 'Employee', manager: 'Manager',
  approved: 'Approved', proposed: 'Awaiting sign-off', active: 'Active', pending: 'Awaiting a decision', cancelled: 'Canceled',
  full: 'Full access', read: 'View', none: 'No access', view: 'View', approval: 'HR approval required', edit: 'Edit',
  unknown: 'Not recorded', pay: 'Pay', history: 'Compensation history', bands: 'Pay bands', cycles: 'Compensation reviews', bonus: 'Bonuses', equity: 'Equity', salary: 'Salary per year', hourly: 'Hourly rate', end_access: 'End Willow access',
  opening: 'Opening balance', accrual: 'Accrual', use: 'Leave taken', reversal: 'Leave cancellation', reservation: 'Reserved leave', release: 'Released reservation',
}

export function readableNote(note: string, signedOff = false) {
  const text = signedOff ? note.replace(/ \(proposed; needs sign-off\)/g, '') : note
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, date => isDate(date) ? formatDate(date) : date)
}

function valueText(value: unknown, key: string, zone: string): string {
  if (value === null || value === undefined || value === '') return 'Not recorded'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number' && /At$/.test(key)) return formatInstant(value, zone)
  if (typeof value === 'number' && /Minutes$|^minutes$/.test(key)) return hours(value)
  const text = String(value)
  if (isDate(text)) return formatDate(text)
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(Date.parse(text))) return formatInstant(Date.parse(text), zone)
  return VALUES[text] ?? (key === 'note' ? readableNote(text) : text)
}

function record(value: unknown, zone: string, key = ''): Html | string {
  if (Array.isArray(value)) return value.length ? h`<ul>${value.map(item => h`<li>${record(item, zone, key)}</li>`)}</ul>` : 'None recorded'
  if (!value || typeof value !== 'object') return valueText(value, key, zone)
  const data = value as Record<string, any>
  if ('basis' in data && 'amountCents' in data && data.currency) return formatPay(data.basis, data.amountCents, data.currency)
  if (data.columns && data.rows) {
    const columns = data.columns as { key: string; label: string; type: string; validation?: any }[]
    const cell = (column: typeof columns[number], value: unknown) => column.type === 'select'
      ? column.validation?.options?.find((option: any) => option.value === value)?.label ?? valueText(value, column.key, zone)
      : valueText(value, column.key, zone)
    return h`<h4>${data.label}</h4>${table(['Effective from', ...columns.map(column => column.label)], [...data.rows, ...(data.formerRows ?? [])].flatMap((row: any) => row.history?.length ? row.history.map((version: any) => [formatDate(version.effectiveFrom), ...columns.map(column => version.removed ? 'Removed' : cell(column, version.values[column.key]))]) : [[formatDate(row.effectiveFrom), ...columns.map(column => cell(column, row.values[column.key]))]]))}`
  }
  if (data.definition && Object.hasOwn(data, 'value')) {
    const text = (value: unknown) => data.definition.type === 'select'
      ? data.definition.validation.options.find((option: any) => option.value === value)?.label ?? valueText(value, '', zone)
      : valueText(value, '', zone)
    return h`<h4>${data.definition.label}</h4><p>${text(data.value)}</p>${data.history?.length ? table(['Effective from', 'Value'], data.history.map((entry: any) => [formatDate(entry.effectiveFrom), text(entry.value)])) : ''}`
  }
  // Name-only references (manager, department, location, schedule) have no
  // technical metadata in the readable record.
  const keys = Object.keys(LABELS).filter(name => Object.hasOwn(data, name))
  if (keys.length === 1 && keys[0] === 'name') return String(data.name)
  return h`<dl class="preview-facts">${keys.map(name => h`<dt>${LABELS[name]}</dt><dd>${data.currency && /Cents$|_cents$/.test(name) && data[name] !== null ? formatMoney(data[name], data.currency) : record(name === 'note' && typeof data[name] === 'string' ? readableNote(data[name], data.kind === 'opening') : data[name], zone, name)}</dd>`)}</dl>`
}

export function recordPreview(view: unknown, zone: string) {
  const data = { ...(view as Record<string, any>) }
  if (data.compensationFields && !Object.values(data.compensationFields).some(Boolean)) { delete data.compensation; delete data.compensationRecords }
  if (!data.customFields?.fields?.length) delete data.customFields
  return h`<details><summary>Readable record (your access applies)</summary><p>These are the details visible under both your access and the selected member’s access. Technical identifiers are omitted.</p>${record(data, zone)}</details>`
}
