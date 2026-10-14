import { modelDraftSection } from './model-drafts'
import { payrollLayoutSection } from './payroll-layout'
// Payroll handoff, summaries, agent proposals and the audit trail.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { formatDate, formatInstant } from '../dates'
import { employer } from '../employer'
import { displayPayText, formatMoney } from '../money'
import { batchDetail, batches } from '../payroll'
import { proposalDetail, proposals } from '../proposals'
import { summary } from '../reports'
import { audit } from '../views'
import { field, form, h, hidden, page, table, tag } from './html'

export async function payrollPage(env: Bindings, actor: Actor, url: URL) {
  const list = await batches(env, actor)
  const mapping = await payrollLayoutSection(env, actor)
  const body = h`<h1>Payroll handoff</h1><p>Willow hands approved changes to your payroll provider; the provider calculates pay, tax and payments.</p>${mapping}
<section class="card"><h2>New change batch</h2>${form('payroll.draft', '/app/payroll/{id}', [field('Pay period start', 'periodStart', { type: 'date' }), field('Pay period end', 'periodEnd', { type: 'date' })], 'Prepare draft', { layout: 'row-form' })}<p class="muted">A draft gathers every change effective by the period end that has not been handed off yet.</p></section>
<section class="card"><h2>Batches</h2>${list.length ? table(['Period', 'Status', 'Lines', 'Exceptions', 'Provider reference'], list.map(batch => [h`<a href="/app/payroll/${batch.id}">${formatDate(batch.periodStart)} – ${formatDate(batch.periodEnd)}</a>`, tag(batch.status), batch.lines, batch.exceptions, batch.providerReference ?? '—'])) : h`<p class="muted">No batches yet.</p>`}</section>`
  return page('Payroll', actor, body, { current: '/app/payroll', url })
}

export async function batchPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const batch = await batchDetail(env, actor, id)
  const body = h`<p class="back"><a href="/app/payroll">← Payroll</a></p><div class="title-row"><h1>Changes for ${formatDate(batch.periodStart)} – ${formatDate(batch.periodEnd)}</h1><p>${tag(batch.status)}${batch.providerReference ? ` · provider reference ${batch.providerReference}` : ''}</p></div>
<section class="card"><h2>Lines</h2>${batch.lines.length ? table(['Provider ID', 'Person', 'Change', 'Effective', 'Units', 'Detail'], batch.lines.map(line => [line.payrollId, line.name, tag(line.kind.replace('_', ' ')), h`${formatDate(line.effectiveDate)}${line.endDate ? h` – ${formatDate(line.endDate)}` : ''}`, line.units ? `${line.units} ${line.unit}` : '—', h`${displayPayText(line.note)}${line.changes?.length ? h`<ul>${line.changes.map(change => h`<li>${change.field}: ${displayPayText(change.from ?? '—')} → ${displayPayText(change.to ?? '—')}</li>`)}</ul>` : ''}`])) : h`<p class="muted">No changes to hand off.</p>`}</section>
<section class="card"><h2>Exceptions</h2>${batch.exceptions.length ? h`<ul>${batch.exceptions.map(exception => h`<li>${exception.name}: ${exception.reason} ${exception.resolved ? h`${tag('resolved in a later batch')}` : h`${tag('unresolved')} <a href="/app/people/${exception.person}">fix</a>`}</li>`)}</ul>` : h`<p class="muted">None.</p>`}</section>
${batch.previewStatus.issues.length ? h`<section class="card"><h2>Export blockers</h2><ul>${batch.previewStatus.issues.map(issue=>h`<li>${issue}</li>`)}</ul><p><a href="/app/payroll">Review layout mapping</a></p></section>` : ''}
${batch.filePreview ? h`<section class="card"><h2>Actual file preview · ${batch.layoutFormat}</h2><pre>${batch.filePreview}</pre><p>Export freezes these exact bytes. A changed source or mapping requires another preview.</p></section>` : ''}
<section class="card batch-actions">${batch.status === 'draft' ? h`${form('payroll.preview', `/app/payroll/${id}`, [hidden('batch', id)], 'Preview export file', { secondary: true })}${form('payroll.export', `/app/payroll/${id}`, [hidden('batch', id), hidden('previewRevision', batch.previewRevision)], 'Export this batch')}${form('payroll.discard', '/app/payroll', [hidden('batch', id)], 'Discard draft', { secondary: true })}` : h`<p><a class="button" href="/app/payroll/${id}.csv">Download CSV</a></p>`}
${batch.status === 'exported' ? form('payroll.acknowledge', `/app/payroll/${id}`, [hidden('batch', id), field('Provider reference', 'reference'), field('Note', 'note', { required: false })], 'Record provider acknowledgement', { secondary: true }) : ''}</section>`
  return page('Payroll batch', actor, body, { current: '/app/payroll', url })
}

export async function reportsPage(env: Bindings, actor: Actor, url: URL) {
  const report = await summary(env, actor, url) as any
  const body = h`<h1>Summaries</h1><p>Scope: ${report.scope}. As of ${formatDate(report.filters.asOf)}; range ${formatDate(report.filters.from)} – ${formatDate(report.filters.to)}.</p>
<form method="get" action="/app/reports" class="row-form">${field('As of', 'asOf', { type: 'date', value: report.filters.asOf })}${field('From', 'from', { type: 'date', value: report.filters.from })}${field('To', 'to', { type: 'date', value: report.filters.to })}<button type="submit" class="secondary">Update</button></form>
<div class="grid"><section class="card"><h2>Headcount: ${report.headcount.total}</h2>${table(['Department', 'People'], report.headcount.byDepartment.map((row: any) => [row.group, row.people]))}${table(['Location', 'People'], report.headcount.byLocation.map((row: any) => [row.group, row.people]))}</section>
<section class="card"><h2>Movements</h2><p>${report.movements.starters} starter(s), ${report.movements.leavers} leaver(s) in the range.</p><h2>Leave taken</h2>${report.leaveTaken.length ? table(['Policy', 'Hours'], report.leaveTaken.map((row: any) => [row.policy, row.hours])) : h`<p class="muted">None.</p>`}<h2>Lifecycle work</h2><p>${report.lifecycleWork.openTasks} open task(s), ${report.lifecycleWork.overdue} overdue.</p></section>
${report.compensation ? h`<section class="card"><h2>Compensation</h2><p class="muted">${report.compensation.note}</p>${table(['Department', 'People', 'Annualised', 'Unknown pay'], report.compensation.byDepartment.map((row: any) => [row.group, row.people, formatMoney(Math.round(Number(row.annual) * 100), row.currency), row.unknownPay]))}</section>` : ''}</div>
<p class="muted">${report.calculation}</p><p><a href="/app/reports.csv?asOf=${report.filters.asOf}&amp;from=${report.filters.from}&amp;to=${report.filters.to}">Download as CSV</a></p>`
  return page('Summaries', actor, body, { current: '/app/reports', url })
}

export async function proposalsPage(env: Bindings, actor: Actor, url: URL) {
  const list = await proposals(env, actor)
  const drafts = await modelDraftSection(env, actor, url)
  const body = h`<h1>Proposals</h1><p>Your own agent (or a colleague) can prepare a joiner or a mover through Willow’s JSON API. Nothing changes until you approve the exact plan here; a plan whose records changed since must be prepared again.</p>${drafts}
<section class="card">${list.length ? table(['Proposed', 'Kind', 'Summary', 'By', 'Status'], list.map(item => [formatDate(new Date(item.proposedAt).toISOString().slice(0, 10)), item.kind, h`<a href="/app/proposals/${item.id}">${item.summary}</a>`, item.agent, tag(item.status)])) : h`<p class="muted">No proposals yet.</p>`}</section>`
  return page('Proposals', actor, body, { current: '/app/proposals', url })
}

export async function proposalPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const item = await proposalDetail(env, actor, id)
  const body = h`<p class="back"><a href="/app/proposals">← Proposals</a></p><h1>${item.summary}</h1><p>${item.kind} prepared by ${item.agent} · ${tag(item.status)}</p>
<section class="card"><h2>Exact changes</h2>${table(['Field', 'Now', 'Proposed'], item.changes.map(change => [change.field, change.from ?? '—', change.to ?? '—']))}</section>
${item.missing.length ? h`<section class="card"><h2>Missing information</h2><ul>${item.missing.map(entry => h`<li>${entry.replace(/_/g, ' ')}</li>`)}</ul></section>` : ''}
${item.status === 'pending' ? h`<section class="card">${form('proposal.decide', `/app/proposals/${id}`, [hidden('proposal', id), hidden('decision', 'approve')], 'Approve and run this plan')}${form('proposal.decide', `/app/proposals/${id}`, [hidden('proposal', id), hidden('decision', 'decline')], 'Decline', { secondary: true })}</section>` : ''}
${item.receipt ? h`<section class="card"><h2>Receipt</h2><pre>${JSON.stringify(item.receipt, null, 2)}</pre></section>` : ''}`
  return page('Proposal', actor, body, { current: '/app/proposals', url })
}

export async function auditPage(env: Bindings, actor: Actor, url: URL) {
  const [events, company] = await Promise.all([audit(env, actor), employer(env)])
  const body = h`<h1>Audit trail</h1><p class="muted">Every change, and every read of private details, pay, confidential reasons and documents. Newest first; the latest 500.</p><section class="card">${table(['When', 'Who', 'What', 'Record'], events.map(event => [formatInstant(event.at, company?.timezone ?? 'UTC'), event.actor.slice(0, 8), event.action, event.subject.slice(0, 40)]))}</section>`
  return page('Audit', actor, body, { current: '/app/audit', url })
}
