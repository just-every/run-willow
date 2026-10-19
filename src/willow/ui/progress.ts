// In progress: people with an open change, whether payroll, records and access agree
// yet, and the selected change with its timeline and Willow's own follow-up.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { formatDay } from '../dates'
import { progress, type Cell, type CellState, type Step } from '../progress'
import { avatar, form, h, page, raw, tag } from './html'

type Board = Awaited<ReturnType<typeof progress>>
type Selected = NonNullable<Board['selected']>

// Status marks: a filled check when agreed, a clock while waiting, one orange dot for
// the exception, a quiet dash where a system does not apply.
const MARKS: Record<CellState, string> = {
  done: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="disc" cx="10" cy="10" r="9"/><path class="glyph" d="M6 10.3l2.6 2.5L14 7.6"/></svg>',
  wait: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="ring" cx="10" cy="10" r="8.2"/><path class="hands" d="M10 5.6V10l2.8 1.8"/></svg>',
  alert: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="disc" cx="10" cy="10" r="9"/><path class="glyph" d="M10 5.5v5.2M10 14v.3"/></svg>',
  none: '',
}
const mark = (state: CellState) => raw(`<span class="mark mark-${state}">${MARKS[state]}</span>`)

const cell = (value: Cell) => value.state === 'none'
  ? h`<span class="dash" title="${value.text}"><span aria-hidden="true">—</span><span class="sr">${value.text}</span></span>`
  : h`<span class="status status-${value.state}">${mark(value.state)}<span class="lines"><span>${value.text}</span>${value.detail ? h`<small>${value.detail}</small>` : ''}</span></span>`

const lines = (main: unknown, sub: unknown) => h`<span class="lines"><span>${main}</span>${sub ? h`<small>${sub}</small>` : ''}</span>`

function table(board: Board) {
  const selected = board.selected?.key
  return h`<section class="card changes" aria-labelledby="changes-title"><h2 id="changes-title" class="sr">Changes in progress</h2><div class="table-wrap"><table><thead><tr><th scope="col">Person</th><th scope="col">What</th><th scope="col">Effective</th><th scope="col">Payroll</th><th scope="col">Records</th><th scope="col">Access</th><th scope="col">Owner</th></tr></thead><tbody>
${board.rows.map(row => h`<tr${row.key === selected ? raw(' class="selected"') : ''}>
<td data-label="Person"><a class="who-cell" href="/app/progress?select=${row.key}"${row.key === selected ? raw(' aria-current="true"') : ''}>${avatar(row.person.name)}${lines(row.person.name, row.person.role)}</a></td>
<td data-label="What">${lines(row.what, row.detail)}</td>
<td data-label="Effective">${formatDay(row.effective, board.today)}${row.endDate && row.endDate !== row.effective ? h`<small class="until">to ${formatDay(row.endDate, board.today)}</small>` : ''}</td>
<td data-label="Payroll">${cell(row.payroll)}</td><td data-label="Records">${cell(row.records)}</td><td data-label="Access">${cell(row.access)}</td>
<td data-label="Owner">${row.owner ? h`<span class="owner">${avatar(row.owner.name)}${lines(h`<span aria-hidden="true">${row.owner.name.split(' ')[0]}</span><span class="sr">${row.owner.name}</span>`, row.owner.role)}</span>` : h`<span class="dash"><span aria-hidden="true">—</span><span class="sr">No open work</span></span>`}</td></tr>`)}
</tbody></table></div></section>`
}

const step = (item: Step) => h`<li class="step step-${item.state}">${item.state === 'none' ? raw('<span class="mark mark-next" aria-hidden="true"></span>') : mark(item.state)}<div><p>${item.title}</p><small>${item.detail}</small>${item.note ? h`<small class="note">${item.note}</small>` : ''}</div></li>`

function panel(item: Selected, today: string) {
  const kindPath = item.kind === 'leave' ? { label: 'Request', open: 'Open request' } : { label: 'Case', open: 'Open case' }
  const agent = item.agent
  return h`<aside class="card selected-change" aria-labelledby="selected-name">
<header class="panel-head">${avatar(item.person.name)}<div><h2 id="selected-name">${item.person.name}</h2><p>${item.person.role ?? 'No role recorded'}</p></div></header>
<nav class="tabs" aria-label="${item.person.name}"><a href="/app/progress?select=${item.key}" aria-current="page">Details</a><a href="${item.path}">${kindPath.label}</a><a href="/app/people/${item.person.id}">Record</a></nav>
<div class="case-box"><section class="change"><div class="change-title"><h3>${item.what}</h3><p>${item.detail}</p>${tag(item.status)}</div>
<dl><div><dt>Effective date</dt><dd>${formatDay(item.effective, today, { year: true })}</dd></div>${item.tasks ? h`<div><dt>Tasks done</dt><dd>${item.tasks.done} of ${item.tasks.total}</dd></div>` : item.endDate ? h`<div><dt>Last day</dt><dd>${formatDay(item.endDate, today, { year: true })}</dd></div>` : ''}</dl>
${item.template ? h`<p class="template">Template: ${item.template}</p>` : ''}</section>
${item.steps.length ? h`<section class="timeline"><h3>${item.kind === 'leave' ? 'Request timeline' : 'Tasks timeline'}</h3><ol>${item.steps.map(step)}</ol></section>` : ''}
${item.expected && item.observed ? h`<section class="compare"><h3>Expected vs observed</h3><div class="pair"><div><small>Expected</small><b>${item.expected.title}</b><span>${item.expected.detail}</span></div><div${item.exception ? raw(' class="off"') : ''}><small>Observed</small><b>${item.observed.title}</b><span>${item.observed.detail}</span></div></div></section>` : ''}</div>
${agent ? h`<section class="agent" aria-label="Willow"><img src="/brand/mark.svg" alt="" width="36" height="66"><div><h3>Willow</h3>${agent.said.map(sentence => h`<p>${sentence}</p>`)}</div></section>` : ''}
<div class="agent-actions">${agent?.canRun ? form('work.run', `/app/progress?select=${item.key}`, [], 'Check due work now') : ''}<a class="button${agent?.canRun ? ' secondary' : ''}" href="${item.path}">${kindPath.open}</a><a class="button secondary" href="/api/willow/context/${item.person.id}">Agent context</a></div>
</aside>`
}

export async function progressPage(env: Bindings, actor: Actor, url: URL) {
  const board = await progress(env, actor, url.searchParams.get('select') ?? '')
  const people = `${board.people} ${board.people === 1 ? 'person' : 'people'}`
  const body = h`<div class="progress"><header class="board-head"><h1>In progress</h1><p>${people}, ${board.needYou ? h`<strong>${board.needYou} ${board.needYou === 1 ? 'needs' : 'need'} you</strong>` : 'none need you'}</p></header>
${board.rows.length ? h`<div class="board">${table(board)}${board.selected ? panel(board.selected, board.today) : ''}</div>`
    : h`<section class="card empty"><img src="/brand/mark.svg" alt="" width="34" height="62"><h2>Nothing is in progress</h2><p>Joiner, mover and leaver cases you can see, and leave waiting for your decision, appear here with whether payroll, records and access agree yet.</p></section>`}</div>`
  return page('In progress', actor, body, { current: '/app/progress', url, wide: true })
}
