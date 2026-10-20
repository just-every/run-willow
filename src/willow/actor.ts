import { initializeProvisionedDoor } from './movein/authority'
// The signed-in person as Willow sees them: an operator-auth session joined to a
// Willow member, that member's explicit permissions, the person they are, and
// the people they currently manage. The owner holds every permission.
// Managing someone grants no permission: a manager's view is defined in access.ts.
import { operatorAuth, type Bindings } from '../auth.server'
import { WillowError, all, insist, newId, now, one, stmt } from './core'
import { today } from './dates'
import { CURRENT_TERMS } from './employment'

export const PERMISSIONS = ['people.manage', 'people.private', 'pay.read', 'leave.manage', 'payroll.handoff', 'documents.private', 'reports.read', 'eeo.read', 'it.tasks', 'audit.read'] as const
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
  'it.tasks': 'Receive IT lifecycle tasks',
  'audit.read': 'Read the audit trail',
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
  if (member.owner) PERMISSIONS.forEach(permission => permissions.add(permission))
  const date = today(await employerZone(env))
  const reports = new Set(member.personId ? (await all<{ person_id: string }>(env, `${CURRENT_TERMS} AND t.manager_person_id = ?`, date, member.personId)).map(row => row.person_id) : [])
  return { ...member, permissions, reports, today: date }
}

export async function ensureMember(env: Bindings, email: string, name: string) {
  await env.DB.batch([stmt(env, 'INSERT INTO wl_members (id, email, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING', newId(), email, name, now())])
  return (await one<{ id: string; name: string; person_id: string | null; status: string }>(env, 'SELECT id, name, person_id, status FROM wl_members WHERE email = ?', email))!
}

export const can = (actor: Actor, permission: Permission) => actor.owner || actor.permissions.has(permission)

export function requirePermission(actor: Actor, ...permissions: Permission[]) {
  insist(permissions.every(permission => can(actor, permission)), 'forbidden', 403)
}

export function requireOwner(actor: Actor) {
  insist(actor.owner, 'owner_required', 403)
}
