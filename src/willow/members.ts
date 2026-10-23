import { PERFORMANCE_FIELDS, PERFORMANCE_LABELS, readsPerformanceField } from './levels/performance'
import { readsLeaveField, LEAVE_FIELDS, LEAVE_LABELS } from './levels/leave'
import { readsCompensation, COMPENSATION_FIELDS, COMPENSATION_LABELS } from './levels/compensation'
import { JOB_FIELDS, JOB_LABELS, readsJobHistoryField } from './levels/job'
// Flow 1 (access): Willow members, their explicit permissions, giving and
// ending a person's access, and previewing exactly what a member can see.
// Sign-in accounts are Base operator-auth operators: HR holders are admins
// (they can invite and deactivate members); only the owner sets permissions.
import { reportChoices } from './levels/reports'
import { SELF_FIELDS, SELF_LABELS } from './levels/personal'
import { readsPersonalField } from './levels/other-personal'
import { readsTable } from './record-tables/schema'
import { operatorAuth, type Bindings } from '../auth.server'
import { PERMISSIONS, actorFor, requireOwner, requirePermission, type Actor, type Permission } from './actor'
import { FACET_LABELS, facets, readsCategory, type Facet } from './access'
import { all, commit, insist, newId, now, one, stmt } from './core'
import type { Input } from './input'
import { effectiveFieldDefinitions } from './custom-fields/store'
import { readsCustomField } from './custom-fields/read'
import { personView } from './profile'

export async function members(env: Bindings, actor: Actor, request: Request) {
  requirePermission(actor, 'people.manage')
  const rows = await all(env, 'SELECT m.id, m.email, m.name, m.person_id, m.status, (SELECT json_group_array(permission) FROM wl_effective_permissions p WHERE p.member_id = m.id) AS permissions FROM wl_members m WHERE NOT EXISTS (SELECT 1 FROM wl_erasure_requests r WHERE r.person_id=m.person_id AND r.receipt_id IS NOT NULL) ORDER BY m.name')
  const operators = new Map((await operatorAuth(env).listOperators(request)).map(operator => [operator.email.toLowerCase(), operator]))
  return rows.map(row => {
    const operator = operators.get(row.email)
    return { id: row.id, email: row.email, name: row.name, person: row.person_id, status: row.status, signIn: operator?.status ?? null, owner: operator?.role === 'owner', permissions: operator?.role === 'owner' ? [...PERMISSIONS] : JSON.parse(row.permissions) }
  })
}

async function operatorByEmail(env: Bindings, request: Request, email: string) {
  return (await operatorAuth(env).listOperators(request)).find(operator => operator.email.toLowerCase() === email) ?? null
}

/** The owner sets a member's permissions. people.manage also makes their sign-in an admin, so they can manage members' access. */
export async function setPermissions(env: Bindings, actor: Actor, input: Input, request: Request) {
  requireOwner(actor)
  const member = await one(env, 'SELECT * FROM wl_members WHERE id = ?', input.text('member', { max: 100 }))
  insist(member, 'member_not_found', 404)
  insist(member.id !== actor.id, 'owner_permissions_fixed', 409)
  insist(member.status === 'active', 'access_ended', 409)
  const permissions = input.list('permissions')
  insist(permissions.every(permission => (PERMISSIONS as readonly string[]).includes(permission)), 'invalid_permissions')
  const operator = await operatorByEmail(env, request, member.email)
  insist(operator, 'member_not_found', 404)
  insist(operator.role !== 'owner', 'owner_permissions_fixed', 409)
  const role = permissions.includes('people.manage') ? 'admin' : 'member'
  if (operator.role !== role) await operatorAuth(env).setRole(request, operator.id, role)
  await commit(env, [stmt(env, 'DELETE FROM wl_member_levels WHERE member_id = ?', member.id), stmt(env, 'DELETE FROM wl_permissions WHERE member_id = ?', member.id), ...permissions.map(permission => stmt(env, 'INSERT INTO wl_permissions (member_id, permission, granted_by, granted_at) VALUES (?, ?, ?, ?)', member.id, permission, actor.id, now()))], { actor: actor.id, action: 'member.permissions', subject: member.id, detail: { permissions } })
  return { id: member.id, permissions }
}

/** Gives a person sign-in access to Willow through their work email, with no permissions. */
export async function giveAccess(env: Bindings, actor: Actor, input: Input, request: Request) {
  requirePermission(actor, 'people.manage')
  const person = await one(env, 'SELECT id, legal_name, preferred_name, work_email FROM wl_people WHERE id = ?', input.text('person', { max: 100 }))
  insist(person, 'person_not_found', 404)
  insist(person.work_email, 'work_email_required')
  const email = person.work_email as string, name = person.preferred_name || person.legal_name
  const member = await one(env, 'SELECT * FROM wl_members WHERE email = ?', email)
  insist(!member || !member.person_id || member.person_id === person.id, 'email_linked_elsewhere', 409)
  insist(!member || member.status !== 'active' || !member.person_id, 'already_has_access', 409)
  const auth = operatorAuth(env), operator = await operatorByEmail(env, request, email)
  if (!operator) await auth.invite(request, { email, displayName: name, role: 'member', returnTo: '/app' })
  else if (operator.status === 'inactive') await auth.setOperatorStatus(request, operator.id, 'active')
  const id = member?.id ?? newId()
  await commit(env, [
    member
      ? stmt(env, "UPDATE wl_members SET person_id = ?, status = 'active' WHERE id = ?", person.id, id)
      : stmt(env, "INSERT INTO wl_members (id, email, name, person_id, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)", id, email, name, person.id, now()),
  ], { actor: actor.id, action: 'access.give', subject: person.id, detail: { member: id, invited: !operator } })
  return { id, person: person.id, email }
}

/** Deactivates the person's sign-in, ends every session and clears their permissions; returns the Willow statements to commit. */
export async function endAccessStatements(env: Bindings, actor: Actor, request: Request, personId: string): Promise<D1PreparedStatement[]> {
  requirePermission(actor, 'people.manage')
  const member = await one(env, 'SELECT * FROM wl_members WHERE person_id = ?', personId)
  if (!member || member.status === 'ended') return []
  const auth = operatorAuth(env), operator = await operatorByEmail(env, request, member.email)
  insist(operator?.role !== 'owner', 'owner_access_fixed', 409)
  if (operator && operator.status === 'active') {
    await auth.setOperatorStatus(request, operator.id, 'inactive')
    for (const session of await auth.listSessions(request, operator.id)) if (session.active) await auth.revokeSession(request, session.id)
  }
  return [stmt(env, 'DELETE FROM wl_hiring_team WHERE member_id = ?', member.id), stmt(env, 'DELETE FROM wl_member_levels WHERE member_id = ?', member.id), stmt(env, 'DELETE FROM wl_permissions WHERE member_id = ?', member.id), stmt(env, "UPDATE wl_members SET status = 'ended' WHERE id = ?", member.id)]
}

export async function endAccess(env: Bindings, actor: Actor, input: Input, request: Request) {
  const personId = input.text('person', { max: 100 })
  insist(await one(env, 'SELECT 1 FROM wl_people WHERE id = ?', personId), 'person_not_found', 404)
  const statements = await endAccessStatements(env, actor, request, personId)
  insist(statements.length, 'no_access_to_end', 409)
  await commit(env, statements, { actor: actor.id, action: 'access.end', subject: personId })
  return { id: personId, status: 'ended' }
}

/**
 * What a member would see of a person, computed by the same projection the
 * member's own requests use. The preview shows only values the previewing
 * member may also read; anything else is reported as withheld, never shown.
 */
export async function visibilityPreview(env: Bindings, actor: Actor, memberId: string, personId: string) {
  requirePermission(actor, 'people.manage')
  const member = await one(env, 'SELECT * FROM wl_members WHERE id = ?', memberId)
  insist(member, 'member_not_found', 404)
  insist(await one(env, 'SELECT 1 FROM wl_people WHERE id = ?', personId), 'person_not_found', 404)
  const owner = !!await one(env, "SELECT 1 FROM oa_operators WHERE lower(email) = ? AND role = 'owner'", member.email)
  const target = await actorFor(env, { id: member.id, email: member.email, name: member.name, owner, personId: member.person_id, sessionId: '' })
  const theirs = facets(target, personId), mine = facets(actor, personId)
  const both = new Set([...theirs].filter(facet => mine.has(facet)))
  const view = await personView(env, actor, personId, { admissionActor: target, facets: both, leaveFields:field=>readsLeaveField(target,personId,field)&&readsLeaveField(actor,personId,field), compensationFields: field=>readsCompensation(target,personId,field)&&readsCompensation(actor,personId,field), jobFields: field=>readsJobHistoryField(target,personId,field)&&readsJobHistoryField(actor,personId,field), personalFields: field => readsPersonalField(target,personId,field) && readsPersonalField(actor,personId,field), categories: category => readsCategory(target, personId, category) && readsCategory(actor, personId, category), customFields: definition => readsCustomField(target, personId, definition), recordTables: table => readsTable(target, personId, table) })
  const customDefinitions = await effectiveFieldDefinitions(env, actor.today)
  const readableReports=new Map((await reportChoices(env,actor)).map(report=>[report.id,report.name]))
  const reportSelections=[...new Set(target.reportGrants.flatMap(grant=>grant.reports))].sort().map(id=>({id,name:readableReports.get(id)??null,withheldFromYou:!readableReports.has(id),reachesThisPerson:target.reportGrants.some(grant=>grant.reports.includes(id)&&grant.people.has(personId))}))
  return {
    member: { id: member.id, name: member.name, status: member.status, permissions: [...target.permissions] as Permission[], scoped: target.scoped.map(grant => ({ level: grant.level, permissions: [...grant.permissions].sort(), reachesThisPerson: grant.people.has(personId) })), managesThisPerson: target.reports.has(personId), isThisPerson: target.personId === personId },
    performanceFields:PERFORMANCE_FIELDS.map(field=>({field,label:PERFORMANCE_LABELS[field],levelView:readsPerformanceField(target,personId,field)})),
    reportSelections,
    leaveFields:LEAVE_FIELDS.map(field=>({field,label:LEAVE_LABELS[field],visible:readsLeaveField(target,personId,field),withheldFromYou:readsLeaveField(target,personId,field)&&!readsLeaveField(actor,personId,field)})),
    compensationFields:COMPENSATION_FIELDS.map(field=>({field,label:COMPENSATION_LABELS[field],visible:readsCompensation(target,personId,field),withheldFromYou:readsCompensation(target,personId,field)&&!readsCompensation(actor,personId,field)})),
    jobFields:JOB_FIELDS.map(field=>({field,label:JOB_LABELS[field],visible:readsJobHistoryField(target,personId,field),withheldFromYou:readsJobHistoryField(target,personId,field)&&!readsJobHistoryField(actor,personId,field)})),
    personalFields: SELF_FIELDS.map(field=>({field,label:SELF_LABELS[field],visible:readsPersonalField(target,personId,field),withheldFromYou:readsPersonalField(target,personId,field)&&!readsPersonalField(actor,personId,field)})),
    customFields: customDefinitions.map(definition => ({ id: definition.id, key: definition.key, label: definition.label, visible: readsCustomField(target, personId, definition), withheldFromYou: readsCustomField(target, personId, definition) && !readsCustomField(actor, personId, definition) })),
    facets: (Object.keys(FACET_LABELS) as Facet[]).map(facet => ({ facet, label: FACET_LABELS[facet], visible: theirs.has(facet), withheldFromYou: theirs.has(facet) && !mine.has(facet) })),
    view,
  }
}
