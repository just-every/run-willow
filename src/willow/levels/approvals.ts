// ROLE-011: decision selection never grants a person's data or ordinary write rights.
import type { Bindings } from '../../auth.server'
import { actorFor, type Actor } from '../actor'
import { all, guard, insist, one } from '../core'
import type { Input } from '../input'
import { EVERYONE, levelScopes, scopeMembers, type Scope } from './scope'

export type ApprovalKey = 'leave' | 'self:legalName' | 'self:personal' | 'self:dependent' | 'self:goal' | `document:${string}` | `custom:${string}` | `change:${'job' | 'compensation'}:${'hr' | 'payroll' | 'skip_manager'}`
export interface ApprovalGrant { level: string; scope: Scope; keys: ApprovalKey[]; members: Set<string> }
export interface ApprovalChoice { key: ApprovalKey; label: string }
export interface ApprovalRow { level_id: string; approval: ApprovalKey }
export const APPROVAL_INPUTS = ['approvals', 'approvalSelection']
export const FIXED_APPROVALS: readonly ApprovalChoice[] = [
 { key: 'leave', label: 'Leave requests' },
 { key: 'self:legalName', label: 'Legal name changes' },
 { key: 'self:personal', label: 'Personal detail changes' },
 { key: 'self:dependent', label: 'Dependent changes' },
 { key: 'self:goal', label: 'Goal changes' },
 ...(['job', 'compensation'] as const).flatMap(type => (['hr', 'payroll', 'skip_manager'] as const).map(role => ({ key: `change:${type}:${role}` as ApprovalKey, label: `${type === 'job' ? 'Job' : 'Compensation'} changes: ${role === 'hr' ? 'HR' : role === 'payroll' ? 'Payroll' : 'Manager’s manager'} step` }))),
]

/** Choice labels contain definitions only, never employee values. */
export async function approvalChoices(env: Bindings): Promise<ApprovalChoice[]> {
 const [categories, fields] = await Promise.all([
  all<{ id: string; name: string }>(env, 'SELECT id,name FROM wl_doc_categories ORDER BY name'),
  all<{ id: string; label: string }>(env, 'SELECT f.id,v.label FROM wl_custom_fields f JOIN wl_custom_field_versions v ON v.field_id=f.id WHERE v.version=(SELECT MAX(version) FROM wl_custom_field_versions WHERE field_id=f.id) ORDER BY v.label'),
 ])
 return [...FIXED_APPROVALS, ...categories.map(category => ({ key: `document:${category.id}` as ApprovalKey, label: `Documents: ${category.name}` })), ...fields.map(field => ({ key: `custom:${field.id}` as ApprovalKey, label: `Custom field: ${field.label}` }))]
}

/** Omission preserves saved selection; the native form sentinel makes clearing explicit. */
export function readApprovals(input: Input, choices: readonly ApprovalChoice[]): ApprovalKey[] | undefined {
 if (!APPROVAL_INPUTS.some(name => input.provided(name))) return undefined
 const selected = [...new Set(input.list('approvals'))].sort()
 insist(selected.every(key => choices.some(choice => choice.key === key)), 'invalid_approvals')
 return selected as ApprovalKey[]
}

export const approvalRuleRows = (env: Bindings) => all<ApprovalRow>(env, 'SELECT level_id,approval FROM wl_level_approvals ORDER BY approval')

export async function approvalGrants(env: Bindings, member: string, person: string | null, date: string): Promise<ApprovalGrant[]> {
 const rows = await all<ApprovalRow>(env, 'SELECT r.level_id,r.approval FROM wl_level_approvals r JOIN wl_member_levels a ON a.level_id=r.level_id WHERE a.member_id=? ORDER BY r.approval', member)
 if (!rows.length) return []
 const scopes = await levelScopes(env)
 return Promise.all([...new Set(rows.map(row => row.level_id))].map(async level => {
  const scope = scopes.get(level) ?? EVERYONE
  return { level, scope, keys: rows.filter(row => row.level_id === level).map(row => row.approval), members: scope.kind === 'everyone' ? new Set<string>() : await scopeMembers(env, date, scope, person) }
 }))
}

/** Only this level's own scoped selection contributes; native authority stays independent. */
export function hasApproval(actor: Pick<Actor, 'personId' | 'approvalGrants'>, key: string, person: string, levelId?: string): boolean {
 return actor.personId !== person && actor.approvalGrants.some(grant => (!levelId || grant.level === levelId) && grant.keys.includes(key as ApprovalKey) && (grant.scope.kind === 'everyone' || grant.members.has(person)))
}

/** Return current actors, not a stored member snapshot, for a bound role label. */
export async function selectedApprovalMembers(env: Bindings, key: string, person: string, levelId?: string): Promise<Actor[]> {
 const rows = await all<{ id: string; email: string; name: string; person_id: string | null; role: string }>(env, `SELECT DISTINCT m.id,m.email,m.name,m.person_id,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email JOIN wl_member_levels a ON a.member_id=m.id JOIN wl_level_approvals r ON r.level_id=a.level_id WHERE m.status='active' AND o.status='active' AND r.approval=? ${levelId ? 'AND a.level_id=?' : ''} ORDER BY m.id`, key, ...(levelId ? [levelId] : []))
 const actors = await Promise.all(rows.map(row => actorFor(env, { id: row.id, email: row.email, name: row.name, owner: row.role === 'owner', personId: row.person_id, sessionId: '' })))
 return actors.filter(actor => hasApproval(actor, key, person, levelId))
}

/** Rebuild authority before reading business sources; guard every subsequent write. */
export async function liveApprovalActor(env: Bindings, actor: Pick<Actor, 'id' | 'sessionId'>) {
 const snapshot = (await one<{ seq: number }>(env, 'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const row = await one(env, 'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?', actor.id)
 insist(row, 'forbidden', 403)
 const current = await actorFor(env, { id: row.id, email: row.email, name: row.name, owner: row.role === 'owner', personId: row.person_id, sessionId: actor.sessionId })
 return { actor: current, guards: [guard(env, 'access_changed', '(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?', snapshot), guard(env, 'access_changed', `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.email=lower(o.email) WHERE s.id=? AND m.id=? AND m.status='active' AND o.status='active' AND s.revoked_at IS NULL AND s.operator_version=o.version AND s.expires_at>?)`, actor.sessionId, actor.id, Date.now())] }
}

export async function approvalGuard(env: Bindings, actor: Pick<Actor, 'id' | 'sessionId'>, key: string, person: string, levelId?: string): Promise<D1PreparedStatement[]> {
 const live = await liveApprovalActor(env, actor)
 insist(hasApproval(live.actor, key, person, levelId), 'approval_forbidden', 403)
 return live.guards
}
