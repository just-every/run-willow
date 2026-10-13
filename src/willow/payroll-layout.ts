// ADP RUN Time Sheet Import, payroll-assigned identifier layout, guide pp 4–7.
// This hours-only format cannot represent employment changes or reversals.
import type { Bindings } from '../auth.server'
import { requireOwner, requirePermission, type Actor } from './actor'
import { commit, guard, insist, json, WillowError, newId, one, stmt } from './core'
import type { Input } from './input'
import { guardPayrollSources, decodePayrollSources, payrollSources } from './payroll-sources'
import { batchCsv, CSV_COLUMNS, type Line } from './payroll'

export const ADP_GUIDE = 'https://support.adp.com/adp_payroll/content/hybrid/@runcomplete/doc/pdf/GTS_payroll_guide.pdf'
export const ADP_COLUMNS = ['IID','Pay Frequency','Pay Period Start Date','Pay Period End Date','Employee ID','Earnings Code','Pay Hours','Dollars','Separate Check','Worked In Dept','Rate Code']
export const payrollLayout = (env: Bindings) => one(env, 'SELECT * FROM wl_payroll_layout WHERE singleton=1')

export async function layoutView(env: Bindings, actor: Actor) {
  requirePermission(actor, 'payroll.handoff', 'pay.read')
  const row = await payrollLayout(env)
  return row ? { format: row.format as string, revision: row.revision as string, mapping: JSON.parse(row.mapping) } : null
}

export async function configureLayout(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  const format = input.text('format')
  insist(['generic','adp-run'].includes(format), 'invalid_layout')
  let mapping: any = { employeeIdentifier: 'employment.payrollId', units: 'hours' }
  if (format === 'generic') {
    const columns = (input.has('columns') ? input.json('columns') : input.list('columnSource').map((source,index) => ({ source, heading: input.list('columnHeading', {keepEmpty:true})[index], order: Number(input.list('columnOrder', {keepEmpty:true})[index]) })).sort((a,b) => a.order-b.order)) as {source:string;heading:string}[]
    insist(Array.isArray(columns) && columns.length === CSV_COLUMNS.length && new Set(columns.map(c => c?.source)).size === CSV_COLUMNS.length && new Set(columns.map(c => c?.heading)).size === CSV_COLUMNS.length && columns.every(c => c && CSV_COLUMNS.includes(c.source) && typeof c.heading === 'string' && /^[A-Za-z][A-Za-z0-9 _-]{0,59}$/.test(c.heading)), 'complete_column_mapping_required')
    mapping = { ...mapping, columns: columns.map(c => ({source:c.source,heading:c.heading})) }
  }
  if (format === 'adp-run') {
    const company = input.text('company', { max: 10 }), frequency = input.text('frequency', { max: 1 })
    const rateCode = input.text('rateCode', { max: 10 }), department = input.text('department', { max: 6, optional: true })
    const earnings = input.has('earnings') ? input.json('earnings') : Object.fromEntries(input.list('policy').map((policy,index) => [policy,input.list('earning',{keepEmpty:true})[index]]).filter(([,code]) => code))
    const separateCheck = input.integer('separateCheck', { min: 0, max: 9 })
    insist(/^[a-zA-Z0-9]+$/.test(company) && ['B','W','S','M','Q'].includes(frequency), 'invalid_company_or_frequency')
    insist(['BASE','RATE_2','RATE_3','RATE_4','RATE_5','HRLY4SLRY1'].includes(rateCode), 'invalid_rate_code')
    insist(!department || /^\d{1,6}$/.test(department), 'invalid_department')
    insist(earnings && typeof earnings === 'object' && !Array.isArray(earnings) && Object.keys(earnings).length <= 100 && Object.entries(earnings).every(([key,value]) => /^[\w-]{1,100}$/.test(key) && typeof value === 'string' && /^[a-zA-Z0-9_]{1,10}$/.test(value)), 'invalid_earnings_mapping')
    mapping = { ...mapping, company, frequency, rateCode, department, separateCheck, earnings }
  }
  const revision = newId()
  await commit(env, [stmt(env, 'INSERT INTO wl_payroll_layout(singleton,format,mapping,revision) VALUES(1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET format=excluded.format,mapping=excluded.mapping,revision=excluded.revision', format, JSON.stringify(mapping), revision)], { actor: actor.id, action: 'payroll.layout', subject: 'layout', detail: { format } })
  return { format, mapping, revision }
}
const adpDate = (date: string) => `${date.slice(5,7)}/${date.slice(8,10)}/${date.slice(0,4)}`

function renderAdp(lines: Line[], mapping: any, start: string, end: string, sources: string) {
  const errors: { key: string; reason: string }[] = []
  const periods = decodePayrollSources(sources).wl_periods
  for (const line of lines) {
    const period = periods.find(p => p.id === line.periodId)
    if (!period || period.start_date > end || period.end_date && period.end_date < start) errors.push({key:line.key,reason:'Employee is not active within this pay period.'})
    if (line.kind !== 'leave') errors.push({ key: line.key, reason: `ADP Time Sheet Import cannot represent ${line.kind}; use the generic changes layout.` })
    else if (line.unit !== 'hours' || !line.units || !/^\d{1,9}(\.\d{1,2})?$/.test(line.units) || Number(line.units) <= 0) errors.push({ key: line.key, reason: 'Positive hours with at most two decimals required.' })
    else if (line.effectiveDate < start || !line.endDate || line.endDate > end) errors.push({ key: line.key, reason: 'Leave must fall wholly within the pay period; reconcile a different period.' })
    if (!line.payrollId || !/^[a-zA-Z0-9_-]{1,15}$/.test(line.payrollId)) errors.push({ key: line.key, reason: 'A payroll-assigned Employee ID of at most 15 characters is required.' })
    if (line.kind === 'leave' && (!line.policyId || !mapping.earnings[line.policyId])) errors.push({ key: line.key, reason: 'Map this leave policy to an earnings code from the ADP Earnings Codes report.' })
  }
  insist(!errors.length, 'payroll_layout_exceptions', 409, { exceptions: errors })
  const rows = lines.map(line => [mapping.company,mapping.frequency,adpDate(start),adpDate(end),line.payrollId,mapping.earnings[line.policyId!],Number(line.units).toFixed(2),'',mapping.separateCheck,mapping.department,mapping.rateCode])
  return '##GENERIC## V1.0\r\n' + [ADP_COLUMNS,...rows].map(row => row.join(',')).join('\r\n') + '\r\n'
}

export async function previewPayroll(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'payroll.handoff', 'pay.read')
  const batch = await one(env, 'SELECT * FROM wl_payroll_batches WHERE id=?', input.text('batch'))
  insist(batch?.status === 'draft', 'batch_not_draft', 409)
  const layout = await payrollLayout(env)
  insist(layout, 'payroll_layout_required', 409)
  const data = json<{lines: Line[]; sources?: string; calculatedFromSources?: boolean}>(batch.lines, { lines: [] })
  insist(data.sources && data.calculatedFromSources, 'stale', 409)
  insist(json<any[]>(batch.exceptions, []).length === 0, 'payroll_source_exceptions', 409)
  const file = layout.format === 'generic' ? batchCsv(data.lines, JSON.parse(layout.mapping).columns) : renderAdp(data.lines, JSON.parse(layout.mapping), batch.period_start, batch.period_end, data.sources)
  const previewRevision = newId()
  await commit(env, [guardPayrollSources(env, data.sources), guard(env, 'stale', 'EXISTS(SELECT 1 FROM wl_payroll_layout WHERE singleton=1 AND revision=?)', layout.revision), guard(env, 'stale', "EXISTS(SELECT 1 FROM wl_payroll_batches WHERE id=? AND status='draft' AND revision=?)", batch.id, batch.revision), stmt(env, 'UPDATE wl_payroll_batches SET file_preview=?,layout_revision=?,layout_format=?,revision=? WHERE id=?', file, layout.revision, layout.format, previewRevision, batch.id)], { actor: actor.id, action: 'payroll.preview', subject: batch.id, detail: { format: layout.format } })
  return { id: batch.id, format: layout.format, file, previewRevision }
}

/** The page explains every current blocker before the owner attempts export. */
export async function payrollPreviewStatus(env: Bindings, batch: import('./core').Row) {
  if (batch.status !== 'draft') return { issues: [] as string[], stale: false }
  const layout = await payrollLayout(env), data = json<{lines:Line[];sources?:string}>(batch.lines,{lines:[]})
  const issues: string[] = []
  if (!layout) issues.push('The owner must select and map an export layout on Payroll.')
  const exceptions = json<{name:string;reason:string}[]>(batch.exceptions,[])
  issues.push(...exceptions.map(e=>`${e.name}: ${e.reason}. Correct the source and create a fresh batch.`))
  if (layout?.format === 'adp-run' && data.sources) {
    try { renderAdp(data.lines,JSON.parse(layout.mapping),batch.period_start,batch.period_end,data.sources) }
    catch (error) { if (error instanceof WillowError && error.code === 'payroll_layout_exceptions') issues.push(...(error.detail as {exceptions:{reason:string}[]}).exceptions.map(e=>e.reason)); else throw error }
  }
  const stale = !!batch.file_preview && (batch.layout_revision !== layout?.revision || data.sources !== await payrollSources(env))
  if (stale) issues.push('The source or layout changed after this preview. Changed sources require a fresh batch; changed mappings require another preview.')
  return {issues:[...new Set(issues)],stale}
}
