// What Willow's own follow-up has done and will do for one piece of open work, in its
// own words: the reminders the scheduler (work-scheduler.ts) recorded for the current
// schedule, and when its next 15-minute run outside quiet hours reaches the next step.
// It describes the scheduler; it never claims work done or a reminder it did not send.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { connectionSettings } from './connections'
import { all } from './core'
import { addDays, formatDay, formatInstant, today as dayIn } from './dates'
import type { workList } from './work'

type Work = Awaited<ReturnType<typeof workList>>
export interface Followup { said: string[]; next: string | null; canRun: boolean }

const clock = (hour: number) => `${(hour + 11) % 12 + 1}:00 ${hour < 12 ? 'AM' : 'PM'}`

/** When the scheduler next reaches a step that falls due on `date`. */
function nextRun(date: string, policy: NonNullable<Work['policy']>, zone: string, instant = Date.now()) {
  const { quiet_start: start, quiet_end: end } = policy
  const quiet = (hour: number) => start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end
  const today = dayIn(zone, instant)
  let day = date > today ? date : today
  let hour = date > today ? 0 : Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(instant))
  if (date <= today && !quiet(hour)) return 'within 15 minutes'
  for (let step = 0; step < 48 && quiet(hour); step++) { hour = (hour + 1) % 24; if (!hour) day = addDays(day, 1) }
  return `at ${clock(hour)} ${day === today ? 'today' : `on ${formatDay(day, today)}`}`
}

export async function followup(env: Bindings, actor: Actor, work: Work, item: Work['items'][number] | null, owner: string | null): Promise<Followup | null> {
  if (!item) return null
  const canRun = actor.owner, who = owner ?? item.ownerName
  if (!work.policy) return { said: ['Reminders are paused until HR approves a reminder cadence and quiet hours, so I have not reminded anyone about this yet.'], next: null, canRun }
  if (item.coverage === 'blocked') return { said: [`${who} is unavailable and no substitute can cover, so no reminder goes out until someone reassigns this follow-up.`], next: null, canRun }
  const sent = await all(env, 'SELECT step, recipient, status, failure, created_at FROM wl_work_deliveries WHERE source = ? AND schedule_revision = ? ORDER BY created_at', item.source, item.revision)
  const names = new Map(item.candidates.map(candidate => [candidate.id, candidate.name]))
  const said: string[] = []
  const last = sent.at(-1)
  if (last) {
    const to = names.get(last.recipient) ?? who, at = formatInstant(last.created_at, work.timezone)
    said.push(['accepted', 'development'].includes(last.status) ? `I reminded ${to} on ${at}.`
      : last.status === 'disabled' ? `Email notices are off, so my reminder to ${to} on ${at} was recorded but not sent.`
      : `My reminder to ${to} on ${at} did not go through (${String(last.failure ?? last.status).replace(/_/g, ' ')}).`)
  } else said.push(`I have not reminded ${who} yet.`)
  const steps = new Set(sent.map(row => row.step))
  const offset = work.policy.offsets.find(value => !steps.has(value))
  if (offset === undefined) {
    said.push(`Every reminder step has gone out; this stays on ${who}’s list until it is done.`)
    return { said, next: null, canRun }
  }
  const when = nextRun(addDays(item.dueDate, offset), work.policy, work.timezone)
  const notices = Boolean((await connectionSettings(env)).notices)
  said.push(notices ? `I will check again ${when} and remind ${who} if it is still open.` : `I will check again ${when}. Email notices are off, so I will record a reminder for ${who} but not send it.`)
  return { said, next: when.replace(/^at |^on /, ''), canRun }
}
