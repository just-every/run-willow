// "Explain" on the In progress panel: the agent context (proposals.ts context()) and the
// follow-up policy as plain sentences for the HR reader. It reads the same access-checked
// data an agent would, so it names what is withheld rather than showing it.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { formatDay, formatInstant } from './dates'
import { context } from './proposals'
import type { progress } from './progress'
import { workList } from './work'
import { hoursLabel } from './ui/labels'

type Selected = NonNullable<Awaited<ReturnType<typeof progress>>['selected']>
export interface Explanation { checked: string[]; reminds: string[]; reads: string[]; json: string }

const list = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
const hour = (value: number) => `${(value + 11) % 12 + 1}:00 ${value < 12 ? 'AM' : 'PM'}`
const offsetWords = (offset: number) => offset === 0 ? 'on the due date' : `${Math.abs(offset)} day${Math.abs(offset) === 1 ? '' : 's'} ${offset > 0 ? 'after' : 'before'} it`

export async function explain(env: Bindings, actor: Actor, item: Selected): Promise<Explanation> {
  const [record, work] = await Promise.all([context(env, actor, item.person.id), workList(env, actor)])
  const day = (date: string) => formatDay(date, actor.today, { year: true })
  const name = item.person.name

  const checked: string[] = []
  if (item.kind === 'leave') checked.push(`${name} asked for leave from ${day(item.effective)}${item.endDate && item.endDate !== item.effective ? ` to ${day(item.endDate)}` : ''} (${item.detail}). It is waiting for a decision.`)
  else {
    checked.push(`${name} has an open ${item.what.toLowerCase()} case${item.template ? ` from the template “${item.template.replace(/ \(v(\d+)\)$/, '” (version $1)')}` : ''}, effective ${day(item.effective)}.`)
    if (item.tasks) checked.push(`${item.tasks.done} of ${item.tasks.total} task${item.tasks.total === 1 ? ' is' : 's are'} done.`)
  }
  for (const step of item.steps.filter(step => step.state === 'alert')) checked.push(`${step.title} is still open (${step.detail.replace(/ · /g, ', ')}).${step.note ? ` ${step.note}` : ''}`)
  if (item.exception && !item.steps.some(step => step.state === 'alert')) checked.push(item.exception)

  const reminds: string[] = []
  const policy = work.policy
  if (!policy) reminds.push('Reminders are paused until HR approves a reminder cadence and quiet hours, so Willow reminds no one yet.')
  else {
    reminds.push(`HR approved reminders ${list(policy.offsets.map(offsetWords))}, sent to the accountable owner by email when email notices are on.`)
    reminds.push(policy.quiet_start === policy.quiet_end ? 'There are no quiet hours.' : `Willow sends nothing during quiet hours, ${hour(policy.quiet_start)} to ${hour(policy.quiet_end)} in ${work.timezone}.`)
  }
  if (item.agent?.next) reminds.push(`It checks again ${item.agent.next.startsWith('within') ? item.agent.next : `at ${item.agent.next}`}.`)

  const view = record.record as Record<string, any>
  const current = view.current as { jobTitle?: string; department?: { name: string }; location?: { name: string }; manager?: { name: string }; schedule?: { name: string } } | null
  const reads: string[] = []
  const facts = [current?.jobTitle, current?.department && `in ${current.department.name}`, current?.location && `at ${current.location.name}`, current?.manager && `managed by ${current.manager.name}`].filter(Boolean)
  reads.push(`Willow answers only from ${name}’s record as you may see it today${facts.length ? `: ${facts.join(', ')}` : ''}.`)
  reads.push(record.withheld.length ? `Withheld from you, so Willow does not use or guess them: ${list(record.withheld.map(label => label.toLowerCase()))}.` : 'Nothing in this record is withheld from you.')
  for (const policy of record.policies) reads.push(`Leave figures come from ${policy.policy} version ${policy.version}: ${policy.accrualWeeksPerYear} weeks a year of scheduled hours${policy.negativeLimitMinutes ? `, and the balance may go ${hoursLabel(policy.negativeLimitMinutes / 60)} below zero` : ''}.`)
  reads.push('Willow never infers access from someone’s rank: managing a person does not reveal their pay or private details.')
  reads.push(`Prepared ${formatInstant(Date.now(), work.timezone)}.`)

  return { checked, reminds, reads, json: `/api/willow/context/${item.person.id}` }
}
