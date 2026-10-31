import { msg } from '../locale/runtime'
import { aiWorkflowSection } from './ai-workflows'
import { excludesText } from '../retention/excluded'
import { selfExceptions } from '../self-service/view'
import { modelDraftSection } from './model-drafts'
import { payrollLayoutSection } from './payroll-layout'
// Payroll handoff, summaries, agent proposals and the audit trail.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all } from '../core'
import { formatDate, formatInstant } from '../dates'
import { employer } from '../employer'
import { displayPayText, formatMoney } from '../money'
import { batchDetail, batches } from '../payroll'
import { proposalDetail, proposals } from '../proposals'
import { employeeCustomColumns } from '../employee-export'
import { summary } from '../reports'
import { directory } from '../profile'
import { tableReport } from '../record-tables/rows'
import { recordTables } from '../record-tables/schema'
import { audit } from '../views'
import { field, form, h, hidden, page, raw, table, tag } from './html'
import { KIND_LABELS, actionLabel, displayValue, sentence } from './labels'

export async function payrollPage(env: Bindings, actor: Actor, url: URL) {
  const list = await batches(env, actor)
  const mapping = await payrollLayoutSection(env, actor)
  const revisions = await selfExceptions(env, actor)
  const body = h`<h1>Payroll handoff</h1><p>Willow hands approved changes to your payroll provider; the provider calculates pay, tax and payments.</p>${mapping}
<section class="card"><h2>Approved profile revisions</h2><p>Private values remain with HR. Review each revision with HR and record the downstream handoff; this is not a provider confirmation.</p>${revisions.length ? table(['Person','Revision','Due','Outcome'],revisions.map(r=>[h`<a href="/app/people/${r.personId}">Person record</a>`,r.kind==='legalName'?'Legal name':'Dependent',formatDate(r.dueDate),r.status==='resolved'?h`${tag('resolved')} ${r.reference}`:form('self.reconcile','/app/payroll',[hidden('change',r.id),field('Handoff reference','reference')],'Record handoff',{secondary:true})])) : h`<p class="muted">No profile revisions.</p>`}</section>
<section class="card"><h2>New change batch</h2>${form('payroll.draft', '/app/payroll/{id}', [field('Pay period start', 'periodStart', { type: 'date' }), field('Pay period end', 'periodEnd', { type: 'date' })], 'Prepare draft', { layout: 'row-form' })}<p class="muted">A draft gathers every change effective by the period end that has not been handed off yet.</p></section>
<section class="card"><h2>Batches</h2>${list.length ? table(['Period', 'Status', 'Lines', 'Exceptions', 'Provider reference'], list.map(batch => [h`<a href="/app/payroll/${batch.id}">${formatDate(batch.periodStart)} – ${formatDate(batch.periodEnd)}</a>`, tag(batch.status), batch.lines, batch.exceptions, batch.providerReference ?? '—'])) : h`<p class="muted">No batches yet.</p>`}</section>`
  return page(msg('Payroll'), actor, body, { current: '/app/payroll', url })
}

export async function batchPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const batch = await batchDetail(env, actor, id)
  const body = h`<p class="back"><a href="/app/payroll">← Payroll</a></p><div class="title-row"><h1>Changes for ${formatDate(batch.periodStart)} – ${formatDate(batch.periodEnd)}</h1><p>${tag(batch.status)}${batch.providerReference ? ` · provider reference ${batch.providerReference}` : ''}</p></div>
<section class="card"><h2>Lines</h2>${batch.lines.length ? table(['Provider ID', 'Person', 'Change', 'Effective', 'Units', 'Detail'], batch.lines.map(line => [line.payrollId, line.name, tag(line.kind.replace('_', ' ')), h`${formatDate(line.effectiveDate)}${line.endDate ? h` – ${formatDate(line.endDate)}` : ''}`, line.units ? `${line.units} ${line.unit}` : '—', h`${displayPayText(line.note)}${line.changes?.length ? h`<ul>${line.changes.map(change => h`<li>${change.field}: ${displayPayText(change.from ?? '—')} → ${displayPayText(change.to ?? '—')}</li>`)}</ul>` : ''}`])) : h`<p class="muted">No changes to hand off.</p>`}</section>
<section class="card"><h2>Exceptions</h2>${batch.exceptions.length ? h`<ul>${batch.exceptions.map(exception => h`<li>${exception.name}: ${exception.reason} ${exception.resolved ? h`${tag('resolved in a later batch')}` : h`${tag('unresolved')} <a href="/app/people/${exception.person}">fix</a>`}</li>`)}</ul>` : h`<p class="muted">None.</p>`}</section>
${batch.previewStatus.issues.length ? h`<section class="card"><h2>Export blockers</h2><ul>${batch.previewStatus.issues.map(issue=>h`<li>${issue}</li>`)}</ul><p><a href="/app/payroll">Review layout mapping</a></p></section>` : ''}
${batch.filePreview ? h`<section class="card"><h2>Actual file preview · ${batch.layoutFormat}</h2><pre>${batch.filePreview}</pre><p>Export freezes these exact bytes. A changed source or mapping requires another preview.</p></section>` : ''}
<section class="card batch-actions">${batch.erasureReceipt ? h`<p>The original file was withdrawn by an approved erasure. The remaining workers' lines are preserved below.</p>` : batch.status === 'draft' ? h`${form('payroll.preview', `/app/payroll/${id}`, [hidden('batch', id)], 'Preview export file', { secondary: true })}${form('payroll.export', `/app/payroll/${id}`, [hidden('batch', id), hidden('previewRevision', batch.previewRevision)], 'Export this batch')}${form('payroll.discard', '/app/payroll', [hidden('batch', id)], 'Discard draft', { secondary: true })}` : h`<p><a class="button" href="/app/payroll/${id}.csv">Download CSV</a></p>`}
${batch.status === 'exported' ? form('payroll.acknowledge', `/app/payroll/${id}`, [hidden('batch', id), field('Provider reference', 'reference'), field('Note', 'note', { required: false })], 'Record provider acknowledgement', { secondary: true }) : ''}</section>`
  return page(msg('Payroll batch'), actor, body, { current: '/app/payroll', url })
}

export async function reportsPage(env: Bindings, actor: Actor, url: URL) {
  const report = await summary(env, actor, url) as any
  const customColumns = await employeeCustomColumns(env, actor, report.filters.asOf)
  const selected = new Set(url.searchParams.getAll('fields').flatMap(value => value.split(',')))
  const csvQuery = new URLSearchParams({ asOf: report.filters.asOf, from: report.filters.from, to: report.filters.to })
  for (const value of selected) csvQuery.append('fields', value)
  const people = await directory(env, actor, report.filters.asOf)
  const tables = (await Promise.all((await recordTables(env)).map(item => tableReport(env, actor, item.key, report.filters.asOf, people)))).filter(item => item.people > 0)
  const body = h`<h1>Reports</h1><p><a class="button" href="/app/reports/custom">Build and schedule a report</a></p><p>Scope: ${report.scope === 'organisation' ? 'organization' : report.scope}. As of ${formatDate(report.filters.asOf)}; range ${formatDate(report.filters.from)} – ${formatDate(report.filters.to)}.</p>
<form method="get" action="/app/reports" class="row-form">${field('As of', 'asOf', { type: 'date', value: report.filters.asOf })}${field('From', 'from', { type: 'date', value: report.filters.from })}${field('To', 'to', { type: 'date', value: report.filters.to })}${customColumns.length ? h`<fieldset><legend>Custom columns</legend>${customColumns.map(column => h`<label class="check"><input type="checkbox" name="fields" value="${column.key}"${selected.has(column.key) ? raw(' checked') : ''}> ${column.label}</label>`)}</fieldset>` : ''}<button type="submit" class="secondary">Update</button></form>
${report.excludesErased ? h`<p role="status">${excludesText(report.excludesErased)}</p>` : ''}<div class="grid"><section class="card"><h2>Headcount: ${report.headcount.total}</h2>${table(['Department', 'People'], report.headcount.byDepartment.map((row: any) => [row.group, row.people]))}${table(['Location', 'People'], report.headcount.byLocation.map((row: any) => [row.group, row.people]))}</section>
<section class="card"><h2>Movements</h2><p>${report.movements.starters} starter(s), ${report.movements.leavers} leaver(s) in the range.</p><h2>Leave taken</h2>${report.leaveTaken.length ? table(['Policy', 'Hours'], report.leaveTaken.map((row: any) => [row.policy, row.hours])) : h`<p class="muted">None.</p>`}<h2>Lifecycle work</h2><p>${report.lifecycleWork.openTasks} open task(s), ${report.lifecycleWork.overdue} overdue.</p></section>
${report.compensation ? h`<section class="card"><h2>Compensation</h2><p class="muted">${report.compensation.note}</p>${table(['Department', 'People', 'Annualized', 'Unknown pay'], report.compensation.byDepartment.map((row: any) => [row.group, row.people, formatMoney(Math.round(Number(row.annual) * 100), row.currency), row.unknownPay]))}</section>` : ''}</div>
${report.customFields ? h`<section class="card"><h2>Custom fields</h2>${table(['Person', ...report.customFields.columns.map((column: any) => column.label)], report.customFields.rows.map((row: any) => [h`<a href="/app/people/${row.personId}">${row.name}</a>`, ...report.customFields.columns.map((column: any) => row.withheldFields.includes(column.key) ? 'Withheld' : row.values[column.key] === null ? 'Not recorded' : String(row.values[column.key] ?? ''))]))}</section>` : ''}
${tables.length ? h`<section class="card"><h2>Record tables</h2>${table(['Table', 'People you may read', 'Rows in force', ''], tables.map(item => [item.table.label, item.people, item.rows.length, h`<a href="/app/reports/tables/${item.table.key}.csv?asOf=${report.filters.asOf}">Download CSV</a>`]))}</section>` : ''}
<p class="muted">${report.calculation}</p><p><a href="/app/reports.csv?${csvQuery.toString()}">Download as CSV</a></p>`
  return page(msg('Reports'), actor, body, { current: '/app/reports', url })
}

export async function proposalsPage(env: Bindings, actor: Actor, url: URL) {
  const list = await proposals(env, actor)
  const drafts = h`${await modelDraftSection(env, actor, url)}${await aiWorkflowSection(env,actor,url)}`
  const body = h`<h1>Proposals</h1><p>Your own agent (or a colleague) can prepare a joiner or a mover through Willow’s JSON API. Nothing changes until you approve the exact plan here; a plan whose records changed since must be prepared again.</p>${drafts}
<section class="card">${list.length ? table(['Proposed', 'Kind', 'Summary', 'By', 'Status'], list.map(item => [formatDate(new Date(item.proposedAt).toISOString().slice(0, 10)), KIND_LABELS[item.kind] ?? item.kind, h`<a href="/app/proposals/${item.id}">${item.summary}</a>`, item.agent, tag(item.status)])) : h`<p class="muted">No proposals yet.</p>`}</section>`
  return page(msg('Proposals'), actor, body, { current: '/app/proposals', url })
}

export async function proposalPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const item = await proposalDetail(env, actor, id)
  const body = h`<p class="back"><a href="/app/proposals">← Proposals</a></p><h1>${item.summary}</h1><p>${KIND_LABELS[item.kind] ?? item.kind} prepared by ${item.agent} · ${tag(item.status)}</p>
<section class="card"><h2>Exact changes</h2>${table(['Field', 'Now', 'Proposed'], item.changes.map(change => [change.field, displayValue(change.from, actor.today), displayValue(change.to, actor.today)]))}</section>
${item.missing.length ? h`<section class="card"><h2>Missing information</h2><ul>${item.missing.map(entry => h`<li>${entry.replace(/_/g, ' ')}</li>`)}</ul></section>` : ''}
${item.status === 'pending' ? h`<section class="card">${form('proposal.decide', `/app/proposals/${id}`, [hidden('proposal', id), hidden('decision', 'approve')], 'Approve and run this plan')}${form('proposal.decide', `/app/proposals/${id}`, [hidden('proposal', id), hidden('decision', 'decline')], 'Decline', { secondary: true })}</section>` : ''}
${item.receipt ? h`<section class="card"><h2>Receipt</h2><pre>${JSON.stringify(item.receipt, null, 2)}</pre></section>` : ''}`
  return page(msg('Proposal'), actor, body, { current: '/app/proposals', url })
}

const PERSON = 'coalesce(p.preferred_name, p.legal_name)'
// One query per kind of record (D1 caps how many SELECTs one compound query may join).
const AUDIT_SUBJECTS = [
  `SELECT p.id, ${PERSON} AS label FROM wl_people p`,
  `SELECT c.id, c.kind || ' case · ' || ${PERSON} AS label FROM wl_cases c JOIN wl_people p ON p.id = c.person_id`,
  `SELECT r.id, 'Leave request · ' || ${PERSON} AS label FROM wl_leave_requests r JOIN wl_people p ON p.id = r.person_id`,
  `SELECT e.id, 'Employment · ' || ${PERSON} AS label FROM wl_periods e JOIN wl_people p ON p.id = e.person_id`,
  `SELECT d.id, 'Document · ' || ${PERSON} AS label FROM wl_documents d JOIN wl_people p ON p.id = d.person_id`,
  `SELECT v.id, 'Document · ' || ${PERSON} AS label FROM wl_document_versions v JOIN wl_documents d ON d.id = v.document_id JOIN wl_people p ON p.id = d.person_id`,
  "SELECT id, 'Payroll batch' AS label FROM wl_payroll_batches",
  "SELECT id, 'Proposal' AS label FROM wl_proposals",
  "SELECT id, 'Template · ' || name AS label FROM wl_templates",
  `SELECT t.id, 'Task · ' || ${PERSON} AS label FROM wl_case_tasks t JOIN wl_cases c ON c.id = t.case_id JOIN wl_people p ON p.id = c.person_id`,
  `SELECT a.id, 'Leave account · ' || ${PERSON} AS label FROM wl_leave_accounts a JOIN wl_periods e ON e.id = a.period_id JOIN wl_people p ON p.id = e.person_id`,
  `SELECT t.id, 'Employment terms · ' || ${PERSON} AS label FROM wl_terms t JOIN wl_periods e ON e.id = t.period_id JOIN wl_people p ON p.id = e.person_id`,
  "SELECT v.id, 'Leave policy · ' || l.name || ' v' || v.version AS label FROM wl_policy_versions v JOIN wl_leave_policies l ON l.id = v.policy_id",
  "SELECT id, 'Leave policy · ' || name AS label FROM wl_leave_policies",
  "SELECT id, 'Department · ' || name AS label FROM wl_departments",
  "SELECT id, 'Location · ' || name AS label FROM wl_locations",
  "SELECT id, 'Schedule · ' || name AS label FROM wl_schedules",
  "SELECT id, 'Document category · ' || name AS label FROM wl_doc_categories",
  "SELECT revision AS id, 'Reminder policy' AS label FROM wl_work_policy",
]

export async function auditPage(env: Bindings, actor: Actor, url: URL) {
  const [events, company, members, subjects] = await Promise.all([audit(env, actor), employer(env), all(env, 'SELECT id, name FROM wl_members'), Promise.all(AUDIT_SUBJECTS.map(sql => all(env, sql))).then(sets => sets.flat())])
  // Who and Record in words: members by name, Willow's own work as Willow, and records by
  // kind and the person's directory name (never a title or field the reader may not see).
  const names = new Map(members.map(row => [row.id as string, row.name as string]))
  const records = new Map(subjects.map(row => [row.id as string, sentence(row.label as string)]))
  const who = (id: string) => names.get(id) ?? (id === 'scheduler' ? 'Willow (reminders)' : id === 'system' ? 'Willow' : 'Former member')
  const record = (subject: string) => subject === 'organisation' ? 'Organization' : records.get(subject) ?? subject.slice(0, 40)
  const body = h`<h1>Audit trail</h1><p class="muted">Every change, and every read of private details, pay, confidential reasons and documents. Newest first; the latest 500.</p><section class="card">${table(['When', 'Who', 'What', 'Record'], events.map(event => [formatInstant(event.at, company?.timezone ?? 'UTC'), event.agent_name || who(event.actor), h`<span title="${event.action}">${actionLabel(event.action)}</span>`, record(event.subject)]))}</section>`
  return page(msg('Audit'), actor, body, { current: '/app/audit', url })
}
