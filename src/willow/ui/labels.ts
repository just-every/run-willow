// Stored values as people read them: roles, employment types, task offsets, ISO dates and
// audit actions. Records keep their stored spelling; only the page wording changes here.
import { formatDay, isDate } from '../dates'

export const ASSIGNEE_LABELS: Record<string, string> = { hr: 'HR', it: 'IT', payroll: 'Payroll', manager: 'Manager', employee: 'Employee' }
export const TYPE_LABELS: Record<string, string> = { full_time: 'Full time', part_time: 'Part time', casual: 'Casual', fixed_term: 'Fixed term', unknown: 'Unknown (from import)' }
export const KIND_LABELS: Record<string, string> = { joiner: 'Joiner', mover: 'Mover', leaver: 'Leaver' }

/** First letter up, the rest as written: "overdue" -> "Overdue", "in force" -> "In force". */
export const sentence = (text: string) => text.replace(/^\p{Ll}/u, letter => letter.toUpperCase())

export const assignee = (value: string) => ASSIGNEE_LABELS[value] ?? sentence(value)

const days = (count: number) => `${count} day${count === 1 ? '' : 's'}`
/** A task's deadline relative to the case date: "3 days before", "On the day", "2 days after". */
export const dueOffset = (offset: number) => offset < 0 ? `${days(-offset)} before` : offset > 0 ? `${days(offset)} after` : 'On the day'

/** Hours as people say them, never split from the unit: 16 -> "16 hours", 7.5 -> "7.5 hours". */
export const hoursLabel = (value: number | string) => {
  const amount = Number(value)
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} hour${amount === 1 ? '' : 's'}`
}

/** A stored value shown in a table: ISO dates as US days with the year, enums as words. */
export function displayValue(value: unknown, today: string): string {
  if (value === null || value === undefined || value === '') return '—'
  const text = String(value)
  if (isDate(text)) return formatDay(text, today, { year: true })
  if (Object.hasOwn(TYPE_LABELS, text)) return TYPE_LABELS[text]
  if (Object.hasOwn(KIND_LABELS, text)) return KIND_LABELS[text]
  return text
}

/** An audit action code as words: "report.compensation.read" -> "Report compensation read". */
export const actionLabel = (action: string) => sentence(action.replace(/[._]+/g, ' '))
