// The In progress board: every open joiner, mover and leaver case and every leave
// request waiting on the reader, and whether payroll, records and access agree yet.
// It reads only through the access-checked views (caseDetail, directory, approvals,
// workList), so a member sees exactly the rows and cells they may see elsewhere.
import type { Bindings } from '../auth.server'
import { can, type Actor } from './actor'
import { WillowError, all, json, one } from './core'
import { daysBetween, formatDay, formatInstant } from './dates'
import { approvals } from './leave'
import { caseDetail } from './lifecycle'
import { directory } from './profile'
import { workList } from './work'
import { followup, type Followup } from './progress-followup'

export type CellState = 'done' | 'wait' | 'alert' | 'none'
export interface Cell { state: CellState; text: string; detail?: string }
export interface Step { state: CellState; title: string; detail: string; note?: string }
type Case = Awaited<ReturnType<typeof caseDetail>>
type Task = Case['tasks'][number]
type Work = Awaited<ReturnType<typeof workList>>
type Request = Awaited<ReturnType<typeof approvals>>[number]
interface Row {
  key: string; kind: string; path: string; person: { id: string; name: string; role: string | null }
  what: string; detail: string; effective: string; endDate?: string
  payroll: Cell; records: Cell; access: Cell; owner: { name: string; role: string } | null
  exception: string | null; needsYou: boolean; source: string | null; case?: Case; request?: Request
}

const KIND_LABELS: Record<string, string> = { joiner: 'Joiner', mover: 'Mover', leaver: 'Leaver' }
const ASSIGNEE_LABELS: Record<string, string> = { hr: 'HR', it: 'IT', payroll: 'Payroll', manager: 'Manager', employee: 'Employee' }
const NONE: Cell = { state: 'none', text: 'Not applicable' }

const overdueDays = (task: Task, today: string) => task.status === 'open' && task.dueDate < today ? daysBetween(task.dueDate, today) : 0
const pastDue = (days: number) => `${days} day${days === 1 ? '' : 's'} past due`

/** One system's tasks in a case: overdue first, then open, then done. */
function tasksCell(tasks: Task[], today: string, doneText = 'Done'): Cell {
  if (!tasks.length) return NONE
  const late = tasks.find(task => overdueDays(task, today))
  if (late) return { state: 'alert', text: 'Overdue', detail: pastDue(overdueDays(late, today)) }
  const open = tasks.filter(task => task.status === 'open')
  if (open.length) return { state: 'wait', text: open.length === tasks.length ? 'Open' : `${tasks.length - open.length} of ${tasks.length} done`, detail: `due ${formatDay(open[0].dueDate, today).replace(/^\w+, /, '')}` }
  return { state: 'done', text: doneText }
}

/** The payroll handoff of a case's change, for members who hand off payroll. */
async function handoffs(env: Bindings) {
  const claimed = new Map((await all(env, 'SELECT i.source_kind, i.source_id, b.status FROM wl_payroll_items i JOIN wl_payroll_batches b ON b.id = i.batch_id')).map(row => [`${row.source_kind}:${row.source_id}`, row.status as string]))
  const draft = await one(env, "SELECT lines FROM wl_payroll_batches WHERE status = 'draft'")
  const drafted = new Set(json<{ lines: { key: string }[] }>(draft?.lines, { lines: [] }).lines.map(line => line.key))
  return (key: string | null): Cell | null => {
    if (!key) return null
    const status = claimed.get(key)
    if (status === 'acknowledged') return { state: 'done', text: 'Handed off', detail: 'acknowledged' }
    if (status) return { state: 'wait', text: 'Handed off', detail: 'not acknowledged' }
    if (drafted.has(key)) return { state: 'wait', text: 'In draft batch' }
    return { state: 'wait', text: 'Not handed off' }
  }
}

async function changeKey(env: Bindings, item: Case) {
  if (item.kind === 'joiner') return `start:${item.period}`
  if (item.kind === 'leaver') return `end:${item.period}`
  const terms = await one(env, "SELECT id FROM wl_terms WHERE period_id = ? AND effective_from = ? AND status = 'active' ORDER BY rowid DESC LIMIT 1", item.period, item.anchorDate)
  return terms ? `terms:${terms.id}` : null
}

export async function progress(env: Bindings, actor: Actor, selected = '') {
  const today = actor.today
  const [people, work, waiting] = await Promise.all([directory(env, actor), workList(env, actor), approvals(env, actor)])
  const named = new Map(people.map(person => [person.id, person]))
  const items = new Map(work.items.map(item => [item.source, item]))
  const handoff = can(actor, 'payroll.handoff') && can(actor, 'pay.read') ? await handoffs(env) : null
  const cases: Case[] = []
  for (const row of await all(env, "SELECT id FROM wl_cases WHERE status = 'open' ORDER BY anchor_date, opened_at")) {
    try { cases.push(await caseDetail(env, actor, row.id)) } catch (error) { if (!(error instanceof WillowError && error.status === 404)) throw error }
  }
  const roleOn = new Map<string, Map<string, string | null>>()
  const roleAt = async (personId: string, date: string) => {
    if (!roleOn.has(date)) roleOn.set(date, new Map((await directory(env, actor, date)).map(person => [person.id, person.jobTitle ?? null])))
    return roleOn.get(date)!.get(personId) ?? null
  }

  const rows: Row[] = []
  for (const item of cases) {
    const open = item.tasks.filter(task => task.status === 'open').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const late = open.find(task => overdueDays(task, today))
    const accountable = open[0] ? items.get(`task:${open[0].id}`) : items.get(`information:${item.id}`)
    const role = named.get(item.person.id)?.jobTitle ?? null
    const after = item.kind === 'mover' ? await roleAt(item.person.id, item.anchorDate) : null
    const payrollTasks = tasksCell(item.tasks.filter(task => task.assignee === 'payroll'), today)
    const handed = handoff?.(await changeKey(env, item)) ?? null
    const exception = late ? `${late.title} is ${pastDue(overdueDays(late, today))}.` : item.missing.length && item.anchorDate <= today ? 'Required information is still missing.' : null
    rows.push({
      key: `case:${item.id}`, kind: item.kind, path: `/app/cases/${item.id}`, person: { id: item.person.id, name: item.person.name, role },
      what: KIND_LABELS[item.kind], detail: after && after !== role ? `to ${after}` : item.template.name,
      effective: item.anchorDate,
      payroll: payrollTasks.state === 'alert' || !handed ? payrollTasks : handed,
      records: item.missing.length ? { state: 'wait', text: `${item.missing.length} missing`, detail: item.missing.map(field => field.replace(/_/g, ' ')).join(', ') } : can(actor, 'people.manage') ? { state: 'done', text: 'Complete' } : NONE,
      access: tasksCell(item.tasks.filter(task => task.assignee === 'it' || task.action === 'end_access' || task.system), today, item.kind === 'leaver' ? 'Removed' : 'Ready'),
      owner: accountable ? { name: accountable.ownerName, role: open[0] ? ASSIGNEE_LABELS[open[0].assignee] : 'HR' } : null,
      exception, needsYou: Boolean(late?.mine || (exception && !late && can(actor, 'people.manage'))),
      source: accountable?.source ?? null, case: item,
    })
  }
  for (const request of waiting) {
    const accountable = items.get(`leave:${request.id}`)
    rows.push({
      key: `leave:${request.id}`, kind: 'leave', path: `/app/leave/${request.id}`, person: { id: request.person, name: request.name, role: named.get(request.person)?.jobTitle ?? null },
      what: 'Leave', detail: `${request.policy} · ${request.hours} h`, effective: request.startDate, endDate: request.endDate,
      payroll: NONE, records: NONE, access: NONE,
      owner: accountable ? { name: accountable.ownerName, role: 'Approver' } : null,
      exception: null, needsYou: true, source: accountable?.source ?? null, request,
    })
  }
  rows.sort((a, b) => Number(Boolean(b.exception)) - Number(Boolean(a.exception)) || a.effective.localeCompare(b.effective))

  const chosen = rows.find(row => row.key === selected) ?? rows.find(row => row.exception) ?? rows[0] ?? null
  return {
    today, timezone: work.timezone,
    people: new Set(rows.map(row => row.person.id)).size,
    needYou: new Set(rows.filter(row => row.needsYou).map(row => row.person.id)).size,
    rows: rows.map(({ case: _case, request: _request, ...row }) => row),
    selected: chosen ? await detail(env, actor, chosen, work, items, today) : null,
  }
}

async function detail(env: Bindings, actor: Actor, row: Row, work: Work, items: Map<string, Work['items'][number]>, today: string) {
  const item = row.source ? items.get(row.source) ?? null : null
  const agent: Followup | null = await followup(env, actor, work, item, row.owner?.name ?? null)
  const steps: Step[] = []
  let expected: { title: string; detail: string } | null = null, observed: { title: string; detail: string } | null = null
  if (row.case) {
    for (const task of row.case.tasks) {
      const late = overdueDays(task, today)
      steps.push(task.status === 'done'
        ? { state: 'done', title: task.title, detail: `${ASSIGNEE_LABELS[task.assignee]} · ${task.completedAt ? formatInstant(task.completedAt, work.timezone) : 'done'}`, note: task.evidence ?? undefined }
        : { state: late ? 'alert' : 'wait', title: task.title, detail: `${ASSIGNEE_LABELS[task.assignee]}${task.system ? ` · ${task.system}` : ''} · due ${formatDay(task.dueDate, today)}${late ? ` · ${pastDue(late)}` : ''}`, note: task.evidenceRequired ? 'Done only with evidence of what was done.' : undefined })
    }
    const late = row.case.tasks.find(task => overdueDays(task, today))
    const done = row.case.tasks.filter(task => task.status === 'done').length
    if (late) {
      expected = { title: `Done by ${formatDay(late.dueDate, today)}`, detail: `${ASSIGNEE_LABELS[late.assignee]} records ${late.evidenceRequired ? 'evidence' : 'completion'}` }
      observed = { title: 'Still open', detail: pastDue(overdueDays(late, today)) }
    } else if (row.case.tasks.length) {
      const last = row.case.tasks.map(task => task.dueDate).sort().at(-1)!
      expected = { title: `${row.case.tasks.length} tasks done`, detail: `by ${formatDay(last, today)}` }
      observed = { title: `${done} of ${row.case.tasks.length} done`, detail: row.case.missing.length ? `${row.case.missing.length} required field(s) missing` : 'Required information complete' }
    }
  } else if (row.request) {
    steps.push({ state: 'done', title: `Requested ${row.request.hours} hours of ${row.request.policy}`, detail: formatInstant(row.request.requestedAt, work.timezone) })
    steps.push({ state: 'wait', title: `Waiting for ${row.owner?.name ?? 'a decision'}`, detail: 'Approve or decline on the request' })
  }
  if (agent?.next) steps.push({ state: 'none', title: 'Willow checks again', detail: agent.next })
  return { key: row.key, kind: row.kind, path: row.path, person: row.person, what: row.what, detail: row.detail, effective: row.effective, endDate: row.endDate ?? null,
    status: row.exception ? 'overdue' : row.kind === 'leave' ? 'pending' : 'open', exception: row.exception,
    tasks: row.case ? { done: row.case.tasks.filter(task => task.status === 'done').length, total: row.case.tasks.length } : null,
    template: row.case ? `${row.case.template.name} (v${row.case.template.version})` : null,
    steps, expected, observed, agent }
}
