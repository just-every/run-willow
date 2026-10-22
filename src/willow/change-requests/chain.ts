// FLOW-004 approval chains. HR records one chain per request type (pay-changing
// "compensation" requests, otherwise "job"), naming the mover workflow the
// approved change starts. Steps are roles, resolved per request revision:
// the subject's manager's manager in force today, any HR member
// (people.manage) or any payroll member (payroll.handoff + pay.read). A step
// may apply only at or above a pay increase percentage (inclusive) or only
// when the person's location or effective-dated band position matches.
import type { Bindings } from '../../auth.server'
import { can, canAbout, requirePermission, type Actor } from '../actor'
import { all, commit, insist, json, newId, now, one, stmt } from '../core'
import { CURRENT_TERMS } from '../employment'
import type { Input } from '../input'
import { activeTemplate } from '../lifecycle'
import { memberUnavailable } from '../work'
import { hasApproval, type ApprovalKey } from '../levels/approvals'

export const ROLES = ['skip_manager', 'hr', 'payroll'] as const
export type Role = typeof ROLES[number]
export const ROLE_LABELS: Record<Role, string> = { skip_manager: 'Manager’s manager', hr: 'HR', payroll: 'Payroll' }
export type RequestType = 'compensation' | 'job'
export const BAND_POSITIONS = ['below', 'within', 'above', 'unbanded'] as const
export type BandPosition = typeof BAND_POSITIONS[number]
export interface ChainStep { role: Role; minIncreasePercent: number | null; locations: string[]; bandPositions?: BandPosition[]; level?: string; levelLabel?: string }
/** A step as resolved for one request revision; `member` is the named skip-level approver. */
export interface ResolvedStep { role: Role; member: string | null; note: string | null; level?: string; label?: string; approvalKey?: ApprovalKey }
export const changeApprovalKey = (type: RequestType, role: Role): ApprovalKey => `change:${type}:${role}`
export const stepLabel = (step: Pick<ResolvedStep, 'role' | 'label'>) => step.label ?? ROLE_LABELS[step.role]

export async function configureChain(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const type = input.text('requestType', { max: 20 })
  insist(type === 'compensation' || type === 'job', 'invalid_requestType')
  const template = await activeTemplate(env, input.text('template', { max: 100 }), 'mover')
  // Form rows left blank are unused; JSON may send just the rows it needs.
  const roles = input.list('stepRole', { keepEmpty: true }), increases = input.list('stepMinIncrease', { keepEmpty: true }), locations = input.list('stepLocations', { keepEmpty: true }), bands = input.list('stepBandPositions', { keepEmpty: true })
  const levels = input.list('stepLevel', { keepEmpty: true })
  const steps: ChainStep[] = roles.flatMap((role, index) => role.trim() ? [index] : []).map(index => {
    const role = roles[index]
    insist((ROLES as readonly string[]).includes(role), 'invalid_stepRole')
    const increase = (increases[index] ?? '').trim()
    insist(!increase || /^\d{1,3}(\.\d{1,2})?$/.test(increase), 'invalid_stepMinIncrease')
    const bandPositions = (bands[index] ?? '').split(',').map(s => s.trim()).filter(Boolean)
    insist(bandPositions.every(value => (BAND_POSITIONS as readonly string[]).includes(value)), 'invalid_stepBandPositions')
    return { role: role as Role, minIncreasePercent: increase ? Number(increase) : null, bandPositions: [...new Set(bandPositions)] as BandPosition[], locations: (locations[index] ?? '').split(',').map(s => s.trim()).filter(Boolean), ...(levels[index] ? { level: levels[index] } : {}) }
  })
  insist(steps.length >= 1 && steps.length <= 6, 'invalid_steps')
  for (const id of steps.flatMap(s => s.locations)) insist(await one(env, 'SELECT 1 FROM wl_locations WHERE id = ?', id), 'location_not_found', 404)
  for (const step of steps) if (step.level) {
    const level = await one(env, 'SELECT l.name FROM wl_levels l JOIN wl_level_approvals a ON a.level_id=l.id WHERE l.id=? AND a.approval=?', step.level, changeApprovalKey(type, step.role))
    insist(level, 'approval_level_not_eligible', 409)
    step.levelLabel = level.name
  }
  const id = newId()
  await commit(env, [stmt(env, 'INSERT INTO wl_change_chains (id, request_type, steps_json, template_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', id, type, JSON.stringify(steps), template.id, actor.id, now())],
    { actor: actor.id, action: 'change.chain', subject: id, detail: { requestType: type, steps, template: template.id } })
  return { id }
}

export async function currentChain(env: Bindings, type: RequestType) {
  const row = await one(env, 'SELECT * FROM wl_change_chains WHERE request_type = ? ORDER BY recorded_at DESC, id DESC LIMIT 1', type)
  return row ? { id: row.id as string, type, templateId: row.template_id as string, steps: json<ChainStep[]>(row.steps_json, []), recordedAt: row.recorded_at as number } : null
}

export async function chains(env: Bindings) {
  return (await Promise.all((['compensation', 'job'] as const).map(type => currentChain(env, type)))).filter(Boolean)
}

/** The manager in force today of the person's manager in force today, as a Willow member. */
async function skipManager(env: Bindings, personId: string, date: string) {
  const managerOf = async (id: string) => (await one(env, `${CURRENT_TERMS} AND p.person_id = ?`, date, id))?.manager_person_id as string | null ?? null
  const manager = await managerOf(personId)
  const skip = manager ? await managerOf(manager) : null
  return skip ? (await one(env, "SELECT id FROM wl_members WHERE person_id = ? AND status = 'active'", skip))?.id as string ?? null : null
}

/**
 * Applies the chain's conditions to one revision. A skip-level step with no
 * manager's manager holding an active membership is assigned to HR and says so;
 * a revision where no step applies still needs HR.
 */
export async function resolveSteps(env: Bindings, steps: ChainStep[], subject: { personId: string; requestType: RequestType; locationAfter: string | null; increasePercent: number | null; payChanged: boolean; bandPosition?: BandPosition }, date: string): Promise<ResolvedStep[]> {
  const resolved: ResolvedStep[] = []
  for (const step of steps) {
    if (step.minIncreasePercent !== null && !(subject.payChanged && (subject.increasePercent === null || subject.increasePercent >= step.minIncreasePercent))) continue
    if (step.locations.length && !(subject.locationAfter && step.locations.includes(subject.locationAfter))) continue
    if (step.bandPositions?.length && !(subject.bandPosition && step.bandPositions.includes(subject.bandPosition))) continue
    if (step.role === 'skip_manager') {
      const member = await skipManager(env, subject.personId, date)
      if (!member && !step.level) { resolved.push({ role: 'hr', member: null, note: 'No manager’s manager with Willow access; HR approves this step', approvalKey: changeApprovalKey(subject.requestType, 'hr') }); continue }
      resolved.push({ role: 'skip_manager', member, note: null, approvalKey: changeApprovalKey(subject.requestType, step.role), ...(step.level ? { level: step.level, label: `${ROLE_LABELS[step.role]} · ${step.levelLabel}` } : {}) })
    } else resolved.push({ role: step.role, member: null, note: null, approvalKey: changeApprovalKey(subject.requestType, step.role), ...(step.level ? { level: step.level, label: `${ROLE_LABELS[step.role]} · ${step.levelLabel}` } : {}) })
  }
  return resolved.length ? resolved : [{ role: 'hr', member: null, note: 'No configured step applies; HR approves', approvalKey: changeApprovalKey(subject.requestType, 'hr') }]
}

export function selectedChangeApproval(actor: Actor, request: { requested_by: string; person_id: string; request_type?: string }, step: ResolvedStep) {
  if (actor.id === request.requested_by || actor.personId === request.person_id) return false
  const key = step.approvalKey ?? (request.request_type === 'job' || request.request_type === 'compensation' ? changeApprovalKey(request.request_type, step.role) : null)
  return !!key && hasApproval(actor, key, request.person_id, step.level)
}

/** Holds the step's role. Never the requester or the person whose terms change. */
export async function mayApprove(env: Bindings, actor: Actor, request: { requested_by: string; person_id: string; request_type?: string }, step: ResolvedStep | undefined) {
  if (!step || actor.id === request.requested_by || actor.personId === request.person_id) return false
  if (selectedChangeApproval(actor, request, step)) return true
  if (step.role === 'hr') return canAbout(actor, 'people.manage', request.person_id)
  if (step.role === 'payroll') return can(actor, 'payroll.handoff') && can(actor, 'pay.read')
  if (actor.id === step.member) return true
  // FLOW-002 availability: while the named manager's manager has no active access, is not employed or is on approved leave today, HR acts for them.
  if (!canAbout(actor, 'people.manage', request.person_id)) return false
  const member = await one(env, 'SELECT id, person_id, status FROM wl_members WHERE id = ?', step.member)
  return !member || member.status !== 'active' || await memberUnavailable(env, { ...actor, id: member.id, personId: member.person_id }, actor.today)
}

/** Requester, HR, owner, or anyone who holds a role in one of the request's resolved steps. */
export function mayRead(actor: Actor, request: { requested_by: string; person_id: string; request_type?: string }, steps: ResolvedStep[]) {
  if (actor.id === request.requested_by || canAbout(actor, 'people.manage', request.person_id)) return true
  if (actor.personId === request.person_id) return false
  return steps.some(step => selectedChangeApproval(actor, request, step) || (step.role === 'payroll' ? can(actor, 'payroll.handoff') && can(actor, 'pay.read') : step.member === actor.id))
}

export async function chainTemplates(env: Bindings) {
  return await all(env, "SELECT id, name FROM wl_templates WHERE status = 'active' AND kind = 'mover' ORDER BY name")
}
