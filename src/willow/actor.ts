import { performanceGrants, type PerformanceGrant } from './levels/performance'
import { settingsGrants, type SettingsGrant } from './levels/settings'
import { approvalGrants, type ApprovalGrant } from './levels/approvals'
import { leaveGrants, type LeaveGrant } from './levels/leave'
import { compensationGrants, type CompensationGrant } from './levels/compensation'
import { jobGrants, type JobGrant } from './levels/job'
import { documentGrants, type DocumentGrant } from './levels/documents'
import { otherPersonalGrants, type OtherGrant } from './levels/other-personal'
import { followsOwnChanges } from './levels/follow'
import { reportGrants, type ReportGrant } from './levels/reports'
import { scopedGrants, type ScopedGrant } from './levels/scope'
import { initializeProvisionedDoor } from './movein/authority'
// The signed-in person as Willow sees them: an operator-auth session joined to a
// Willow member, that member's explicit permissions, the person they are, and
// the people they currently manage. The owner holds every permission.
// Managing someone grants no permission: a manager's view is defined in access.ts.
import { operatorAuth, type Bindings } from '../auth.server'
import { WillowError, all, insist, newId, now, one, stmt } from './core'
import { today } from './dates'
import { CURRENT_TERMS } from './employment'

export const PERMISSIONS = ['people.manage', 'people.private', 'pay.read', 'leave.manage', 'payroll.handoff', 'documents.private', 'reports.read', 'eeo.read', 'eeo.individual', 'it.tasks', 'audit.read', 'compensation.approve', 'access.admin'] as const
export type Permission = typeof PERMISSIONS[number]

export const PERMISSION_LABELS: Record<Permission, string> = {
  'people.manage': 'Manage people, employment and lifecycle',
  'people.private': 'Read private contact details',
  'pay.read': 'Read compensation',
  'leave.manage': 'Manage leave policies, balances and confidential reasons',
  'payroll.handoff': 'Prepare and hand off payroll changes',
  'documents.private': 'Read every private document category',
  'reports.read': 'Read organization-wide summaries',
  'eeo.read': 'Read protected aggregate diversity reports (also requires reports access)',
  'eeo.individual': 'EEO compliance: read and record individual EEO answers (never implied by ownership or any other right)',
  'it.tasks': 'Receive IT lifecycle tasks',
  'audit.read': 'Read the audit trail',
  'access.admin': 'Administer named access levels (also requires employer-wide manage people; owner alone delegates this right)',
  'compensation.approve': 'Approve compensation budgets and publication (also requires manage people and pay access)',
}

/** Convenience bundles for granting; permissions stay explicit per member. */
export const PRESETS: Record<string, Permission[]> = {
  hr: ['people.manage', 'people.private', 'documents.private', 'leave.manage', 'reports.read', 'audit.read'],
  payroll: ['pay.read', 'payroll.handoff'],
  it: ['it.tasks'],
  employee: [],
}

export interface Actor {
  id: string
  sessionId: string
  email: string
  name: string
  owner: boolean
  permissions: Set<Permission>
  personId: string | null
  /** People whose current (or first upcoming) terms name this actor's person as manager. */
  reports: Set<string>
  settingsGrants: SettingsGrant[]
  approvalGrants: ApprovalGrant[]
  performanceFields: PerformanceGrant[]
  jobFields: JobGrant[]
  leaveFields: LeaveGrant[]
  compensationFields: CompensationGrant[]
  reportGrants: ReportGrant[]
  documentCategories: DocumentGrant[]
  otherPersonal: OtherGrant[]
  followOwnChanges: boolean
  /** ROLE-002: about-others rights from scoped levels, each with the people it reaches today. Never in `permissions`. */
  scoped: ScopedGrant[]
  today: string
}

export async function employerZone(env: Bindings): Promise<string> {
  return (await one<{ timezone: string }>(env, 'SELECT timezone FROM wl_employer WHERE singleton = 1'))?.timezone ?? 'UTC'
}

export async function currentActor(env: Bindings, request: Request): Promise<Actor | null> {
  const session = await operatorAuth(env).getSession(request)
  if (!session) return null
  const email = session.operator.email.toLowerCase()
  const owner = session.operator.role === 'owner'
  if(owner) await initializeProvisionedDoor(env)
  let member = await one<{ id: string; name: string; person_id: string | null; status: string }>(env, 'SELECT id, name, person_id, status FROM wl_members WHERE email = ?', email)
  if (!member && owner) member = await ensureMember(env, email, session.operator.displayName || email)
  if (!member) throw new WillowError('not_a_member', 403)
  return await actorFor(env, { id: member.id, email, name: member.name, owner, personId: member.person_id, sessionId: session.id })
}

/** Builds the actor for a member: used for the signed-in member and for visibility previews. */
export async function actorFor(env: Bindings, member: { id: string; email: string; name: string; owner: boolean; personId: string | null; sessionId: string }): Promise<Actor> {
  const admission = await one(env, `SELECT m.status, o.status AS sign_in FROM wl_members m
    LEFT JOIN oa_operators o ON lower(o.email) = m.email WHERE m.id = ?`, member.id)
  insist(admission?.status === 'active' && admission.sign_in === 'active', 'access_ended', 403)
  const permissions = new Set((await all<{ permission: Permission }>(env, 'SELECT permission FROM wl_effective_permissions WHERE member_id = ?', member.id)).map(row => row.permission))
  // Ownership implies every right except EEO compliance, which the owner assigns explicitly.
  if (member.owner) PERMISSIONS.filter(permission => permission !== 'eeo.individual').forEach(permission => permissions.add(permission))
  const date = today(await employerZone(env))
  const reports = new Set(member.personId ? (await all<{ person_id: string }>(env, `${CURRENT_TERMS} AND t.manager_person_id = ?`, date, member.personId)).map(row => row.person_id) : [])
  const [performanceFields, jobFields, leaveFields, compensationFields, decisions, settings] = await Promise.all([performanceGrants(env,member.id,member.personId,date), jobGrants(env,member.id,member.personId,date), leaveGrants(env,member.id,member.personId,date), compensationGrants(env,member.id,member.personId,date), approvalGrants(env,member.id,member.personId,date), settingsGrants(env,member.id)])
  return { ...member, permissions, reports, today: date, performanceFields, jobFields, leaveFields, compensationFields, approvalGrants: decisions, settingsGrants: settings, reportGrants: await reportGrants(env,member.id,member.personId,date), documentCategories: await documentGrants(env,member.id,member.personId,date), otherPersonal: await otherPersonalGrants(env, member.id, member.personId, date), followOwnChanges: await followsOwnChanges(env,member), scoped: member.owner ? [] : await scopedGrants(env, member.id, member.personId, date) }
}

export async function ensureMember(env: Bindings, email: string, name: string) {
  await env.DB.batch([stmt(env, 'INSERT INTO wl_members (id, email, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING', newId(), email, name, now())])
  return (await one<{ id: string; name: string; person_id: string | null; status: string }>(env, 'SELECT id, name, person_id, status FROM wl_members WHERE email = ?', email))!
}

/** Employer-wide: direct grants, unscoped levels and the owner. A scoped level never satisfies this. */
export const can = (actor: Actor, permission: Permission) => (actor.owner && permission !== 'eeo.individual') || actor.permissions.has(permission)

/** About one person: the employer-wide right, or a scoped level whose scope reaches them today. */
export const canAbout = (actor: Actor, permission: Permission, personId: string) => can(actor, permission) || actor.scoped.some(grant => grant.permissions.has(permission) && grant.people.has(personId))

/** Every right held about one person: the union of employer-wide rights and each reaching level's own rights. */
export function permissionsAbout(actor: Actor, personId: string): Set<Permission> {
  const rights = new Set(actor.permissions)
  if (actor.owner) PERMISSIONS.filter(permission => permission !== 'eeo.individual').forEach(permission => rights.add(permission))
  for (const grant of actor.scoped) if (grant.people.has(personId)) grant.permissions.forEach(permission => rights.add(permission))
  return rights
}

/** The people a permission reaches through scoped levels only (the employer-wide right is `can`). */
export function scopedPeople(actor: Actor, ...permissions: Permission[]): Set<string> {
  const people = new Set<string>()
  for (const grant of actor.scoped) if (permissions.some(permission => grant.permissions.has(permission))) grant.people.forEach(person => people.add(person))
  return people
}

export const hasScopedGrant = (actor: Actor, ...permissions: Permission[]) => actor.scoped.some(grant => permissions.some(permission => grant.permissions.has(permission)))

export function requirePermission(actor: Actor, ...permissions: Permission[]) {
  insist(permissions.every(permission => can(actor, permission)), 'forbidden', 403)
}

export const canLevelAdmin=(actor: Actor)=>actor.owner || (can(actor,'people.manage') && can(actor,'access.admin'))
export function requireLevelAdmin(actor: Actor) { insist(canLevelAdmin(actor),'access_administrator_required',403) }

export function requireOwner(actor: Actor) {
  insist(actor.owner, 'owner_required', 403)
}
