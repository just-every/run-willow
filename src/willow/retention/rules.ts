// DATA-002's dated, sourced US federal retention table. A product default and not
// legal advice: nothing is purged until the owner adopts it and confirms each work state.
import { addDays } from '../dates'

export const TABLE_VERSION = '2026-10-21'

export const CLASSES = {
  i9: { label: 'Form I-9 and E-Verify records', citation: '8 CFR 274a.2(b)(2)(i)(A)', rule: 'The later of three years after hire and one year after employment ends.' },
  employment_tax: { label: 'Employment-tax records', citation: '26 CFR 31.6001-1(e)(2)', rule: 'Four years after the related tax is due or paid, whichever is later.' },
  payroll: { label: 'Payroll, pay-rate, compensation-decision and leave-ledger records', citation: '29 CFR 516.5–516.6, 1627.3(a)', rule: 'Three years.' },
  personnel: { label: 'Personnel actions, their documents and applications', citation: '29 CFR 1602.14, 1627.3(b); 41 CFR 60-1.12', rule: 'One year, or two years for a federal contractor with 150 or more employees and a contract of at least $150,000.' },
  protected_leave: { label: 'Protected-leave cases and certifications', citation: '29 CFR 825.500', rule: 'Three years.' },
  eeo: { label: 'EEO self-identification, HR-recorded categories and EEO-1 run rows', citation: '29 CFR 1602.14; 41 CFR 60-300.44(k), 60-741.44(k)', rule: 'One year, two years for such a contractor, three years for VEVRAA and Section 503 data-collection records.' },
} as const
export type ClassKey = keyof typeof CLASSES
export const CLASS_KEYS = Object.keys(CLASSES) as ClassKey[]
export const isClass = (value: string): value is ClassKey => value in CLASSES

export interface Contractor { contractor: boolean; covered: boolean }

/** Whole years after a date; a leap day moves to March 1 so a period is never shortened. */
export function addYears(date: string, years: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const moved = new Date(Date.UTC(year + years, month - 1, day))
  return moved.getUTCMonth() === month - 1 ? moved.toISOString().slice(0, 10) : addDays(`${year + years}-03-01`, 0)
}

const later = (a: string, b: string) => (a >= b ? a : b)

/** Table years for a class, and the date the period runs from. `record` is the latest record date, `end` the end of employment, `hire` the first start. */
export function classExpiry(key: ClassKey, dates: { hire: string; end: string; record: string | null }, contractor: Contractor, extraYears = 0): string {
  const from = dates.record ? later(dates.record, dates.end) : dates.end
  const fixed = (years: number) => addYears(from, Math.max(years, extraYears))
  switch (key) {
    case 'i9': return later(addYears(dates.hire, Math.max(3, extraYears)), addYears(dates.end, Math.max(1, extraYears)))
    case 'employment_tax': return addYears(dates.record ?? dates.end, Math.max(4, extraYears))
    case 'payroll': case 'protected_leave': return fixed(3)
    case 'personnel': return fixed(contractor.covered ? 2 : 1)
    case 'eeo': return fixed(contractor.covered ? 2 : 1)
  }
}
