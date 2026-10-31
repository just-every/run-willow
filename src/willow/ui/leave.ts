import { msg } from '../locale/runtime'
import { accrualCalculations } from './accrual-calculations'
// Leave: your accounts, a calculated quote with coverage, requests and decisions.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { leaveOverrides } from '../protected-leave/overrides'
import { formatDate, hours } from '../dates'
import { Input } from '../input'
import { approvals, leaveDetail, leaveFor, quote } from '../leave'
import { area, avatar, field, form, h, hidden, page, select, table, tag } from './html'
import { sentence } from './labels'

export async function leavePage(env: Bindings, actor: Actor, url: URL) {
  const mine = actor.personId ? await leaveFor(env, actor, actor.personId) : null
  const usable = mine?.accounts.filter(account => account.openingStatus === 'approved') ?? []
  const params = url.searchParams
  const quoted = params.get('account') && params.get('startDate') && params.get('endDate') ? await quote(env, actor, Input.of(Object.fromEntries(params))) : null
  const waiting = await approvals(env, actor)
  const overrides=can(actor,'leave.manage')?await leaveOverrides(env,actor):[]
  const body = h`<h1>Leave</h1><p><a href="/app/policy-assistant">Ask about policy</a></p><p><a href="/app/protected-leave">Protected leave cases and absence dates</a></p><div class="leave-layout">
<section class="card balances"><h2>Your balances</h2>${mine?.accounts.length ? table(['Policy', 'Balance', 'Opening'], mine.accounts.map(account => [`${account.policy?.name??'Withheld'} (v${account.policy?.version??'—'})`, `${account.balanceMinutes===undefined?msg('Withheld'):hours(account.balanceMinutes)} h`, account.openingStatus === 'approved' ? `${hours(account.openingMinutes)} h at ${formatDate(account.cutoverDate)}` : msg('awaiting sign-off')])) : h`<p class="muted">No leave accounts.</p>`}</section>
${usable.length ? h`<section class="card request-leave"><h2>Request leave</h2><form method="get" action="/app/leave" class="row-form">${select('Leave type', 'account', usable.map(account => ({ value: account.id, label: account.policy?.name??'Leave account' })), params.get('account') ?? '')}${field('First day', 'startDate', { type: 'date', value: params.get('startDate') ?? '' })}${field('Last day', 'endDate', { type: 'date', value: params.get('endDate') ?? '' })}<button type="submit" class="secondary">Calculate</button></form>
${quoted ? h`<div class="quote"><h3>${quoted.minutes===undefined?msg('Withheld'):hours(quoted.minutes)} hours from your working schedule</h3>${table(['Day', 'Scheduled hours'], (quoted.days??[]).map(day => [formatDate(day.date), hours(day.minutes)]))}<p>Balance now ${quoted.balanceMinutes===undefined?msg('Withheld'):hours(quoted.balanceMinutes)} h; after this request ${quoted.afterMinutes===undefined?msg('Withheld'):hours(quoted.afterMinutes)} h.${quoted.allowed ? '' : h` <strong class="short">The balance does not cover this request.</strong>`}</p>
${quoted.coverage.length ? h`<p>Also away then:</p><ul>${quoted.coverage.map(item => h`<li>${item.name}: ${formatDate(item.startDate)} – ${formatDate(item.endDate)} (${item.status})</li>`)}</ul>` : h`<p class="muted">Nobody else in your team is away then.</p>`}
${quoted.allowed ? form('leave.request', '/app/leave/{id}', [hidden('account', params.get('account')), hidden('startDate', params.get('startDate')), hidden('endDate', params.get('endDate')), area('Reason (optional, confidential: your manager does not see it)', 'reason', '', false)], 'Submit request') : ''}</div>` : ''}</section>` : ''}
${mine?.requests.length ? h`<section class="card my-requests"><h2>Your requests</h2>${table(['Dates', 'Policy', 'Hours', 'Status'], mine.requests.map(request => [h`<a href="/app/leave/${request.id}">${formatDate(request.startDate)} – ${formatDate(request.endDate)}</a>`, request.policy, request.hours, tag(request.status)]))}</section>` : ''}
${mine?mine.accounts.map(a=>a.calculations?accrualCalculations(a.calculations,actor.personId!):''): ""}
<section class="card waiting"><h2>Waiting for your decision</h2>${waiting.length ? h`<ul class="people-list">${waiting.map(request => h`<li>${avatar(request.name)}<a href="/app/leave/${request.id}">${request.name}: ${formatDate(request.startDate)} – ${formatDate(request.endDate)} (${request.hours} h, ${request.policy})</a></li>`)}</ul>` : h`<p class="muted">Nothing waiting.</p>`}</section></div>${overrides.length?h`<section class="card" id="overrides"><h2>Balance override approvals</h2>${table(['Person','Effective date','Hours','Reason','Outcome'],overrides.map(o=>[h`<a href="/app/people/${o.person.id}">${o.person.name}</a>`,formatDate(o.effectiveDate),hours(o.minutes),o.note,o.decision??(actor.owner?h`${form('leave.override.decide','/app/leave',[hidden('override',o.id),hidden('decision','approve')],'Approve override')}${form('leave.override.decide','/app/leave',[hidden('override',o.id),hidden('decision','decline')],'Decline',{secondary:true})}`:msg('Awaiting owner approval'))]))}</section>`:''}`
  return page(msg('Leave'), actor, body, { current: '/app/leave', url })
}

export async function requestPage(env: Bindings, actor: Actor, id: string, url: URL) {
  const request = await leaveDetail(env, actor, id)
  const calculation = request.calculation as { days?: { date: string; minutes: number }[] }
  const body = h`<p class="back"><a href="/app/leave">← Leave</a></p><h1>${request.name}: ${request.policy??'Leave request'}</h1>
<section class="card"><dl class="facts"><dt>Dates</dt><dd>${formatDate(request.startDate)} – ${formatDate(request.endDate)}</dd><dt>Hours</dt><dd>${request.hours}</dd><dt>Status</dt><dd>${tag(request.status)}</dd>${request.corrects ? h`<dt>Corrects</dt><dd><a href="/app/leave/${request.corrects}">earlier request</a></dd>` : ''}${'reason' in request ? h`<dt>Reason (confidential)</dt><dd>${request.reason ?? '—'}</dd>` : ''}${request.decisionNote ? h`<dt>Decision note</dt><dd>${request.decisionNote}</dd>` : ''}${request.cancelNote ? h`<dt>Cancellation</dt><dd>${request.cancelNote}</dd>` : ''}${request.balanceMinutes === undefined ? '' : h`<dt>Balance now</dt><dd>${hours(request.balanceMinutes)} h</dd>`}</dl>
<details><summary>Calculation</summary>${table(['Day', 'Scheduled hours'], (calculation.days ?? []).map(day => [formatDate(day.date), hours(day.minutes)]))}</details>
<details><summary>Ledger entries</summary>${table(['Entry', 'Hours', 'Date'], request.ledger.map(entry => [sentence(String(entry.kind).replace(/_/g, ' ')), hours(entry.minutes), formatDate(entry.effective_date)]))}</details></section>
${request.coverage.length ? h`<section class="card"><h2>Also away</h2><ul>${request.coverage.map(item => h`<li>${item.name}: ${formatDate(item.startDate)} – ${formatDate(item.endDate)} (${item.status})</li>`)}</ul></section>` : ''}
${request.canDecide ? h`<section class="card"><h2>Decide</h2>${form('leave.decide', `/app/leave/${id}`, [hidden('request', id), hidden('decision', 'approve'), field('Note', 'note', { required: false })], 'Approve')}${form('leave.decide', `/app/leave/${id}`, [hidden('request', id), hidden('decision', 'decline'), field('Note', 'note', { required: false })], 'Decline', { secondary: true })}</section>` : ''}
${request.status === 'pending' && request.person === actor.personId ? h`<section class="card">${form('leave.withdraw', `/app/leave/${id}`, [hidden('request', id)], 'Withdraw request', { secondary: true })}</section>` : ''}
${request.canCancel ? h`<section class="card"><h2>Cancel approved leave</h2><p class="muted">Canceling writes a reversing ledger entry; the history stays.</p>${form('leave.cancel', `/app/leave/${id}`, [hidden('request', id), field('Why', 'note')], 'Cancel leave', { secondary: true })}</section>` : ''}
${request.canCorrect ? h`<section class="card"><h2>Correct the dates</h2>${form('leave.correct', '/app/leave/{id}', [hidden('request', id), field('First day', 'startDate', { type: 'date', value: request.startDate }), field('Last day', 'endDate', { type: 'date', value: request.endDate }), field('Why', 'note')], 'Correct leave', { secondary: true })}</section>` : ''}`
  return page(msg('Leave request'), actor, body, { current: '/app/leave', url })
}
