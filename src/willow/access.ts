// What a member may see about a person. Every read of a person's data goes
// through these facets before any value is selected for a response, a page,
// an export or an agent's context. Managerial rank grants only the manager
// facets listed here; private contact, pay and confidential reasons need an
// explicit permission or being that person.
import { can, type Actor } from './actor'

export type Facet =
  | 'directory'     // name, work email, job title, department, location, manager
  | 'employment'    // periods, dates, employment type, terms history without pay
  | 'payroll'       // payroll provider identifiers
  | 'private'       // personal contact, address, date of birth, emergency contact
  | 'pay'           // compensation on every terms version
  | 'leave'         // leave accounts, balances, ledger and request dates
  | 'leave_reason'  // confidential absence reasons
  | 'lifecycle'     // joiner, mover and leaver cases and their tasks
  | 'documents'     // document listing (each category decides who reads it)

export const FACET_LABELS: Record<Facet, string> = {
  directory: 'Directory (name, work email, role, team)',
  employment: 'Employment history and terms (without pay)',
  payroll: 'Payroll identifiers',
  private: 'Private contact details',
  pay: 'Compensation',
  leave: 'Leave balances and requests',
  leave_reason: 'Confidential absence reasons',
  lifecycle: 'Joiner, mover and leaver cases',
  documents: 'Private documents',
}

export function facets(actor: Actor, personId: string): Set<Facet> {
  const self = actor.personId === personId
  const manager = actor.reports.has(personId)
  const result = new Set<Facet>(['directory'])
  if (self || manager || can(actor, 'people.manage') || can(actor, 'payroll.handoff')) result.add('employment')
  if (can(actor, 'people.manage') || can(actor, 'payroll.handoff')) result.add('payroll')
  if (self || can(actor, 'people.private')) result.add('private')
  if (self || can(actor, 'pay.read')) result.add('pay')
  if (self || manager || can(actor, 'leave.manage')) result.add('leave')
  if (self || can(actor, 'leave.manage')) result.add('leave_reason')
  if (self || manager || can(actor, 'people.manage')) result.add('lifecycle')
  if (self || manager || can(actor, 'documents.private')) result.add('documents')
  return result
}

export const sees = (actor: Actor, personId: string, facet: Facet) => facets(actor, personId).has(facet)

/** Whether a member may read a document category for a person. */
export function readsCategory(actor: Actor, personId: string, category: Record<string, any>) {
  if (can(actor, 'documents.private')) return true
  if (actor.personId === personId && category.subject_reads) return true
  return actor.reports.has(personId) && !!category.manager_reads
}

/** Organisation-wide lists: people.manage, reports.read and leave/payroll holders see everyone; others see the current directory. */
export const seesEveryone = (actor: Actor) => can(actor, 'people.manage') || can(actor, 'reports.read') || can(actor, 'leave.manage') || can(actor, 'payroll.handoff')
