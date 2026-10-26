import { signatureRequests } from '../sign/requests'
import { excludesText } from '../retention/excluded'
import { readsCustomField } from '../custom-fields/read'
// REPORT-001: saved definitions, authorized results and versioned delivery schedules.
import { isReporter, selectedReport } from '../levels/reports'
import type { Bindings } from '../../auth.server'
import { can, employerZone, type Actor } from '../actor'
import { effectiveFieldDefinitions, type EffectiveField } from '../custom-fields/store'
import { formatDate } from '../dates'
import { savedReport, savedReports, STANDARD_COLUMNS, type ReportDefinition } from '../reporting/definitions'
import { runReport, type ReportResult } from '../reporting/execute'
import { scheduleStatus } from '../reporting/schedule'
import { workMembers } from '../work-sources'
import { checks, field, form, h, hidden, page, raw, select, table, tag, when } from './html'

const route = '/app/reports/custom'
const breakable=(value:string)=>h`${Array.from(value).reduce<string[]>((parts,char,index)=>{if(index%16===0)parts.push('');parts[parts.length-1]+=char;return parts},[]).map((part,index)=>h`${index?h`<wbr>`:''}${part}`)}`
const number = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US', { maximumFractionDigits: 3 })

function relatedReports(actor: Actor) {
  return h`<p class="record-links">${actor.personId ? h`<a href="/app/eeo/self">Voluntary self-identification</a>` : ''}${can(actor, 'eeo.read') && can(actor, 'reports.read') ? h`${actor.personId ? ' · ' : ''}<a href="/app/eeo/report">Diversity report</a>` : ''}</p>`
}

async function visibleDefinitions(env:Bindings,actor:Actor,date:string) { const [dated,current]=await Promise.all([effectiveFieldDefinitions(env,date),effectiveFieldDefinitions(env,actor.today)]);return dated.filter(f=>{const c=current.find(c=>c.fieldId===f.fieldId);return c&&[actor.personId??'',...actor.reports].some(id=>readsCustomField(actor,id,c))}) }

function definitionFields(definition: ReportDefinition, custom: EffectiveField[], signatures: Awaited<ReturnType<typeof signatureRequests>>) {
  const standard = Object.entries(STANDARD_COLUMNS).map(([value, label]) => ({ value, label }))
  const customChoices = custom.filter(item => !item.retired || definition.columns.includes(`custom.${item.key}`)).map(item => ({ value: `custom.${item.key}`, label: `${item.label} (custom)` }))
  // Keep selected historical fields visible when their definition is absent on this date.
  const missing = definition.columns.filter(key => !standard.some(item => item.value === key) && !customChoices.some(item => item.value === key)).map(value => ({ value, label: value }))
  return [field('Report name', 'name', { value: definition.name }),
    checks('Columns', 'columns', [...standard, ...customChoices, ...missing], definition.columns),
    field('Record as of', 'asOf', { value: definition.asOf, hint: 'Use YYYY-MM-DD for a fixed date, or today to use the date the report runs.' }),
    field('Turnover from', 'from', { type: 'date', value: definition.from }), field('Turnover through', 'to', { type: 'date', value: definition.to }),
    field('Department', 'department', { required: false, value: definition.department, hint: 'Exact department name. Leave blank for all permitted departments.' }),
    field('Location', 'location', { required: false, value: definition.location, hint: 'Exact location name. Leave blank for all permitted locations.' }),
    select('Signature template','signatureTemplate',[...new Map(signatures.map(s=>[s.template,{value:s.template,label:s.title}])).values()],definition.signatureTemplate??'',{required:false,blank:'All permitted templates'}),select('Signature cohort','signatureCohort',[...new Map(signatures.map(s=>[s.cohort,{value:s.cohort,label:s.title+' · '+new Date(s.createdAt).toISOString().slice(0,10)}])).values()],definition.signatureCohort??'',{required:false,blank:'All permitted cohorts'}),select('Signature state','signatureState',[{value:'',label:'All observed states'},...['sent','viewed','signed','declined','expired','voided','withdrawn','unknown'].map(value=>({value,label:value}))],definition.signatureState??''),
    select('People to include', 'status', [{ value: 'active', label: 'Active people' }, { value: 'all', label: 'All permitted people' }], definition.status)]
}

export async function customReportsPage(env: Bindings, actor: Actor, url: URL) {
  const [reports, custom, zone, signatures] = await Promise.all([savedReports(env, actor), visibleDefinitions(env, actor, actor.today), employerZone(env),signatureRequests(env,actor)])
  const definition: ReportDefinition = { name: '', columns: ['name', 'jobTitle', 'department', 'location', 'fte'], asOf: actor.today, from: `${actor.today.slice(0, 7)}-01`, to: actor.today, department: '', location: '', status: 'active' }
  return page('Custom reports', actor, h`${isReporter(actor)?h`<p class="back"><a href="/app/reports">← Reports</a></p>`:''}<h1>Custom reports</h1><p>Save the columns, dates and filters you need. Each run uses your current access to people and fields.</p>${relatedReports(actor)}
<section class="card"><h2>Saved reports</h2>${reports.length ? table(['Report', 'Version', 'Record as of', 'Created'], reports.map(report => [h`<a href="${route}/${report.id}">${report.definition.name}</a>`, report.version, report.definition.asOf === 'today' ? 'Today, when run' : formatDate(report.definition.asOf), when(report.createdAt, zone)])) : h`<p class="muted">No saved reports in your scope.</p>`}</section>
${isReporter(actor)?h`<section class="card"><h2>Create a report</h2><p>Organization reporting requires reports access. Managers see their current direct team. Restricted values stay withheld even when a saved report includes their columns.</p>${form('report.save', `${route}/{id}`, definitionFields(definition, custom, signatures), 'Save report')}</section>`:''}`,  { current: isReporter(actor)?'/app/reports':'/app/reports/custom', url, signing:true })
}

function resultRows(result: ReportResult) {
  return result.rows.length ? table([...result.columns.map(column => column.label), 'Sources'], result.rows.map(row => [
    ...result.columns.map(column => row.withheld.includes(column.key) ? h`<strong>Withheld</strong>` : row.cells[column.key] === null ? h`<span class="muted">Unknown / not recorded</span>` : breakable(row.cells[column.key]!)),
    h`<a href="${row.source}" data-report-source>${row.name}: person record</a>${row.signatureSources.length ? h`<ul>${row.signatureSources.map(source=>h`<li><a href="${source.source}">${source.title}: ${source.state}</a></li>`)}</ul>` : ''}${row.exceptionSources.length ? h`<ul>${row.exceptionSources.map(source=>h`<li><a href="${source.path}">${source.kind}</a></li>`)}</ul>` : ''}${row.overdueSources.length ? h`<ul>${row.overdueSources.map(source=>h`<li><a href="${source.path}">Overdue ${source.kind.replaceAll('-',' ')}</a></li>`)}</ul>` : ''}${row.workSources.length ? h`<ul>${row.workSources.map(work => h`<li><a href="/app/cases/${work.caseId}">Case work due ${formatDate(work.dueDate)}</a></li>`)}</ul>` : ''}`,
  ])) : h`<p class="muted">No permitted people match this report.</p>`
}

function totals(result: ReportResult) {
  const t = result.totals
  const knownTenure = result.rows.filter(row => row.measures.tenureDays !== null).length
  const unknownLeave = result.rows.filter(row => row.measures.leaveMinutes === null).length
  return h`<section class="card" id="calculations"><h2>Totals and calculations</h2>${result.excludesErased ? h`<p role="status">${excludesText(result.excludesErased)}</p>` : ''}
${table(['Measure', 'Result', 'Calculation and coverage'], [
    ['Headcount', number(t.headcount), 'People active on the record date, including start and end dates.'],
    ['FTE', number(t.fte), `Active people’s scheduled weekly minutes ÷ 2,400 (40 hours), rounded to three decimals per person before summing. ${t.unknownFte} active people have unknown or withheld schedules; they do not add to the total.`],
    ['Total tenure (days)', number(t.tenureDays), `${knownTenure} people with known tenure; ${result.rows.length - knownTenure} unknown or withheld. Elapsed calendar days from start to the earlier of end date and record date.`],
    ['Average tenure (days)', number(t.averageTenureDays), `Total known tenure ÷ ${knownTenure} people with known tenure.`],
    ['Leave balance (hours)', number(t.leaveHours), `Sum of readable leave ledger balances ÷ 60 minutes. ${unknownLeave} people have unknown or withheld balances.`],
    ['Leave liability', t.liability.length ? t.liability.map(item => `${item.currency} ${(item.cents / 100).toFixed(2)}`).join('; ') : 'Unknown', `${t.unknownLiability} people have unknown or withheld liability. Balance minutes × hourly amount ÷ 60, or balance minutes × annual salary ÷ (scheduled weekly minutes × 52). Rounded half up to cents per person; currencies remain separate.`],
    ['Open exceptions', number(t.openExceptions), 'Readable pending leave and profile decisions, plus approved profile changes awaiting reconciliation, as recorded by the record date.'],
    ['Overdue work', number(t.overdueWork), result.workCoverage.basis + '. Unassigned current overdue work: ' + (result.workCoverage.unassignedOverdue??'unknown')],
    ['Leavers in range', number(t.turnover.leavers), `Employment periods ending from ${formatDate(result.definition.from)} through ${formatDate(result.definition.to)}, inclusive.`],
    ['Turnover denominator', number(t.turnover.denominator), 'Average of scoped headcounts active at the beginning and end of the turnover range.'],
    ['Turnover rate', t.turnover.rate === null ? 'Unknown: zero denominator' : `${number(t.turnover.rate * 100)}%`, `${t.turnover.leavers} leavers ÷ ${number(t.turnover.denominator)} average headcount × 100.`],
  ])}<details><summary>Turnover source records</summary><h3>Leavers</h3>${t.turnover.sources.length?h`<ul>${t.turnover.sources.map(s=>h`<li><a href="${s.source}">Person ending ${formatDate(s.endDate)}</a></li>`)}</ul>`:h`<p>No leavers in this range.</p>`}${t.turnover.denominatorSources.map(s=>h`<h3>Headcount at ${formatDate(s.date)}: ${s.people.length}</h3><ul>${s.people.map(p=>h`<li><a href="${p.source}">Person record</a></li>`)}</ul>`)}</details><p>${result.workCoverage.unknownHistoricalWork?'Other historical work sources are unknown and excluded from the known total; the report does not treat them as zero.':''}</p><p>Totals use the people in your current reporting scope. Unknown and withheld values do not become zero-valued observations. Dates are inclusive in the employer’s time zone.</p></section>`
}

type ScheduleData = Awaited<ReturnType<typeof scheduleStatus>>
function schedulePanel(actor: Actor, report: Awaited<ReturnType<typeof savedReport>>, data: ScheduleData, members: Actor[], zone: string) {
  if(!isReporter(actor))return ''
  const editable = isReporter(actor)&&(actor.owner || actor.id === report.createdBy)
  const schedule = data.schedule
  const names = new Map(members.map(member => [member.id, member.name]))
  return h`<section class="card"><h2>Scheduled delivery</h2><p>Recipients receive a sign-in link to this report. Their current access applies when they open it.</p>
${schedule ? h`<dl class="facts"><dt>Status</dt><dd>${tag(schedule.enabled ? 'active' : 'off')}</dd><dt>First date</dt><dd>${formatDate(schedule.firstDate)}</dd><dt>Repeat</dt><dd>Every ${schedule.cadenceDays} days</dd><dt>Recipients</dt><dd>${schedule.recipients.map(id => names.get(id) ?? id).join(', ')}</dd></dl>${schedule.versionId !== report.versionId ? h`<p>Delivery is paused because the report has a newer version. ${editable ? `Save the schedule below to select version ${report.version}.` : 'The report creator or owner must review the schedule.'}</p>` : h`<p>Scheduled version: ${report.version}.</p>`}` : h`<p class="muted">No schedule saved.</p>`}
${editable ? form('report.schedule', `${route}/${report.id}`, [hidden('report', report.id), hidden('version', report.versionId),
    field('First delivery date', 'firstDate', { type: 'date', value: schedule?.firstDate ?? actor.today }),
    h`<div class="field"><label for="report-cadence">Repeat every (days)</label><input id="report-cadence" name="cadenceDays" type="number" min="1" max="366" step="1" required value="${schedule?.cadenceDays ?? 7}"></div>`,
    checks('Recipients', 'recipients', members.filter(member => can(member, 'reports.read') || member.reports.size > 0 || selectedReport(member,report.id)).map(member => ({ value: member.id, label: member.name })), schedule?.recipients ?? []),
    h`<label class="check"><input type="checkbox" name="enabled" value="yes"${!schedule || schedule.enabled ? raw(' checked') : ''}> Enable delivery</label>`,
  ], 'Save schedule') : ''}
<h3>Delivery history</h3>${data.deliveries.length ? table(['Occurrence', 'Recipient', 'Status', 'Failure', 'Recorded'], data.deliveries.map(delivery => [delivery.occurrence, names.get(delivery.recipient) ?? delivery.recipient, tag(delivery.status), delivery.failure?.replaceAll('_',' ') || '—', when(delivery.createdAt, zone)])) : h`<p class="muted">No deliveries recorded.</p>`}</section>`
}

export async function customReportPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const report = await savedReport(env, actor, id)
  const [result, scheduled, members, custom, zone, signatures] = await Promise.all([runReport(env, actor, report.definition,report.id), scheduleStatus(env, actor, id), workMembers(env), visibleDefinitions(env, actor, report.definition.asOf === 'today' ? actor.today : report.definition.asOf), employerZone(env),signatureRequests(env,actor)])
  return page(report.definition.name, actor, h`<p class="back"><a href="${route}">← Custom reports</a></p><header class="page-head"><h1>${report.definition.name}</h1><p>Version ${report.version} · ${result.scope} · record as of ${formatDate(result.asOf)}</p></header>${relatedReports(actor)}
<p class="actions"><a class="button secondary" href="${route}/${id}.csv">Download CSV</a><a class="button secondary" href="${route}/${id}.xlsx">Download XLSX</a><a href="#calculations">Calculations and unknown values</a></p>
<section class="card"><h2>Report results</h2><dl class="facts"><dt>Generated</dt><dd>${when(result.generatedAt, zone)}</dd><dt>Latest business event</dt><dd>${when(result.sourceFreshness.recordedThrough, zone)}</dd><dt>Department</dt><dd>${report.definition.department || 'All permitted departments'}</dd><dt>Location</dt><dd>${report.definition.location || 'All permitted locations'}</dd><dt>People included</dt><dd>${report.definition.status === 'active' ? 'Active people' : 'All permitted people'}</dd></dl><p>Withheld means your current access does not permit the value. Unknown / not recorded means no value is available in the readable record.</p>${resultRows(result)}</section>
${totals(result)}${result.signatureTotals?h`<section class="card"><h2>Signature totals</h2><p>${result.signatureCoverage?.basis}</p><p>Observed through ${when(result.signatureCoverage?.observedThrough,zone)}. ${result.signatureTotals.withheldPeople} people have withheld signature status.</p>${table(['State','Requests'],[['Pending',result.signatureTotals.signaturePending],['Signed',result.signatureTotals.signatureSigned],['Declined',result.signatureTotals.signatureDeclined],['Expired',result.signatureTotals.signatureExpired],['Voided',result.signatureTotals.signatureVoided],['Withdrawn',result.signatureTotals.signatureWithdrawn],['Unknown',result.signatureTotals.signatureUnknown]])}</section>`:''}
${isReporter(actor)&&(actor.owner || actor.id === report.createdBy) ? h`<section class="card"><details><summary>Save a new report version</summary>${form('report.save', `${route}/${id}`, [hidden('report', id), ...definitionFields(report.definition, custom, signatures)], 'Save new version')}</details></section>` : ''}
${schedulePanel(actor, report, scheduled, members, zone)}`, { current: isReporter(actor)?'/app/reports':'/app/reports/custom', url, signing:true })
}
