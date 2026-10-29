import { locale } from './locale/runtime'
// Calendar dates for employment: ISO YYYY-MM-DD in the employer's time zone.
import { insist } from './core'

export function validTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0)
    return zone.length <= 64 && /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(zone)
  } catch {
    return false
  }
}

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
}

export function requireDate(value: string, code: string): string {
  insist(isDate(value), code)
  return value
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const at = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((at(to) - at(from)) / 86_400_000)
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

export function today(zone: string, instant = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

export function formatInstant(instant: number, zone: string): string {
  return new Intl.DateTimeFormat(locale()==='en'?'en-US':locale(), { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(instant)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale()==='en'?'en-US':locale(), { timeZone: 'UTC', dateStyle: 'medium' }).format(Date.UTC(year, month - 1, day))
}

/** Minutes as hours with two decimals, e.g. 450 -> "7.50". */
export const hours = (minutes: number) => (minutes / 60).toFixed(2)

/** Parses "7.6" or "7:36" hours into whole minutes. */
export function parseHours(value: string, code: string): number {
  const text = value.trim()
  const colon = text.match(/^(-?)(\d{1,4}):([0-5]\d)$/)
  if (colon) return (colon[1] ? -1 : 1) * (Number(colon[2]) * 60 + Number(colon[3]))
  insist(/^-?\d{1,5}(\.\d{1,4})?$/.test(text), code)
  return Math.round(Number(text) * 60)
}

/** A calendar day with its weekday, e.g. "Mon, Oct 26"; the year only when it is not this year's. */
export function formatDay(date: string, today: string, { year = false } = {}): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale()==='en'?'en-US':locale(), { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(year || date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).format(Date.UTC(y, m - 1, d))
}
