import { doorKey } from './movein/authority'
import { currentLevelAdmin, delegatedPayReview, validateDelegation, levelSessionFence } from './levels/delegation'
import { levels } from './levels/store'
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
import { all, auditRead, commit, guard, insist, newId, now, one, stmt, WillowError } from './core'
import { Input } from './input'
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

export async function defaultAccess(env: Bindings) {
  return one<{level_id:string;level_version:number}>(env,'SELECT level_id,level_version FROM wl_default_access WHERE singleton=1')
}

export async function configureDefaultAccess(env: Bindings, actor: Actor, input: Input) {
  requireOwner(actor)
  input.only(['level','reason','returnTo'])
  const level=input.text('level',{optional:true}), reason=input.text('reason',{max:400})
  const snapshot=(await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
  const definition=level ? await one(env,'SELECT id,version FROM wl_levels WHERE id=?',level) : null
  insist(!level||definition,'level_not_found',404)
  await commit(env,[levelSessionFence(env,actor),guard(env,'access_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),
    stmt(env,'DELETE FROM wl_default_access'),
    ...(definition?[stmt(env,'INSERT INTO wl_default_access VALUES(1,?,?,?,?,?)',definition.id,definition.version,actor.id,reason,now())]:[])],
    {actor:actor.id,action:'access.default',subject:level||'none',detail:{version:definition?.version??null,reason}})
  return {level:level||null}
}

/** Explicit owner consent only; repeat submissions never send another invitation. */
export async function bulkGiveAccess(env: Bindings, actor: Actor, input: Input, request: Request) {
  requireOwner(actor)
  input.only(['people','reason','returnTo'])
  const people=[...new Set(input.list('people'))], reason=input.text('reason',{max:400})
  insist(people.length>0&&people.length<=100,'invalid_people')
  const eligible:string[]=[], skipped:string[]=[]
  for(const id of people) {
    const person=await one(env,'SELECT work_email FROM wl_people WHERE id=?',id)
    insist(person,'person_not_found',404)
    const active=await one(env,'SELECT 1 FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?)',id,actor.today,actor.today)
    if(!active){skipped.push(id);continue}
    insist(person.work_email,'work_email_required')
    const member=await one(env,'SELECT person_id,status FROM wl_members WHERE email=?',person.work_email)
    insist(!member||!member.person_id||member.person_id===id,'email_linked_elsewhere',409)
    if(member?.status==='active'&&member.person_id){skipped.push(id);continue}
    eligible.push(id)
  }
  // Validate the exact default before the first outward invitation.
  await defaultAccessGrant(env,actor)
  const invited:string[]=[], deferred:string[]=[]
  for(const [index,person] of eligible.entries()) {
    try {await giveAccess(env,actor,Input.of({person}),request,true);invited.push(person)}
    catch(error) {
      if(!(error&&typeof error==='object'&&'code' in error&&error.code==='rate_limited'))throw error
      deferred.push(...eligible.slice(index));break
    }
  }
  await commit(env,[],{actor:actor.id,action:'access.bulk',subject:actor.id,detail:{invited,skipped,deferred,reason}})
  return {invited,skipped,deferred,notice:deferred.length?`${invited.length} invited; ${skipped.length} skipped. ${deferred.length} deferred by the sign-in invitation limit. Wait 15 minutes, then submit the selection again; existing access is skipped.`:`${invited.length} invited; ${skipped.length} skipped.`}

}

/** Imported access is a separate owner decision; importing alone sends no invitations. */
export async function importAccess(env: Bindings, actor: Actor, input: Input, request: Request) {
  requireOwner(actor)
  input.only(['job','choice','reason','returnTo'])
  const job=input.text('job',{max:100}),choice=input.text('choice',{max:20}),reason=input.text('reason',{max:400})
  insist(choice==='invite'||choice==='defer','invalid_invitation_choice')
  const installation=await doorKey(env)
  const completed=`EXISTS(SELECT 1 FROM ik_jobs j JOIN ik_door_plans p ON p.job_id=j.id WHERE j.id=? AND j.state='completed' AND j.namespace='bamboohr' AND j.destination='people' AND p.installation_id=?)`
  insist(await one(env,'SELECT 1 WHERE '+completed,job,installation),'completed_import_required',409)
  const people=(await all<{id:string}>(env,`SELECT DISTINCT p.target_id AS id FROM ik_provenance p JOIN wl_people person ON person.id=p.target_id WHERE p.job_id=? AND p.target_kind='person' AND p.reversed=0 ORDER BY p.target_id`,job)).map(row=>row.id)
  insist(people.length>0,'import_has_no_people',409)
  // Both decisions are auditable and fenced to the owner's live session and completed job.
  await commit(env,[levelSessionFence(env,actor),guard(env,'import_changed',completed,job,installation)],
    {actor:actor.id,action:'access.import',subject:job,detail:{choice,people,reason}})
  if(choice==='defer') return {invited:[],skipped:[],deferred:people,notice:'Portal invitations deferred. No access was changed and no invitations were sent.'}
  insist(people.length<=100,'import_invitation_selection_required',409)
  return bulkGiveAccess(env,actor,Input.of({people,reason}),request)
}

async function defaultAccessGrant(env: Bindings, actor: Actor) {
  const policy=await defaultAccess(env)
  if(!policy)return null
  const definition=await one(env,'SELECT version FROM wl_levels WHERE id=?',policy.level_id)
  insist(definition?.version===policy.level_version,'default_level_changed',409)
  if(!actor.owner) try {
    const current=await currentLevelAdmin(env,actor),data=await levels(env,current)
    const selected=data.levels.find(level=>level.id===policy.level_id)!
    const plan={...selected,kind:'level' as const,level:selected.id}
    await validateDelegation(env,current,plan,data,true)
    insist(!await delegatedPayReview(env,current,plan,data),'independent_approval_required',403)
  } catch(error) {
    if(error instanceof WillowError) await auditRead(env,actor.id,'access.denied',actor.id,{reason:error.code})
    throw error
  }
  return policy
}

/** Gives a person sign-in access to Willow through their work email, assigning the owner-approved default when configured. */
export async function giveAccess(env: Bindings, actor: Actor, input: Input, request: Request, currentOnly=false) {
  requirePermission(actor, 'people.manage')
  const person = await one(env, 'SELECT id, legal_name, preferred_name, work_email FROM wl_people WHERE id = ?', input.text('person', { max: 100 }))
  insist(person, 'person_not_found', 404)
  insist(person.work_email, 'work_email_required')
  const activeSql='EXISTS(SELECT 1 FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?))'
  if(currentOnly) insist(await one(env,'SELECT 1 WHERE '+activeSql,person.id,actor.today,actor.today),'not_current_employee',409)
  const snapshot=(await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
  const policy=await defaultAccessGrant(env,actor)
  const email = person.work_email as string, name = person.preferred_name || person.legal_name
  const member = await one(env, 'SELECT * FROM wl_members WHERE email = ?', email)
  insist(!member || !member.person_id || member.person_id === person.id, 'email_linked_elsewhere', 409)
  insist(!member || member.status !== 'active' || !member.person_id, 'already_has_access', 409)
  if(policy&&!actor.owner&&member) {
    const reason=member.id===actor.id?'delegation_target_fixed':await one(env,"SELECT 1 FROM wl_effective_permissions WHERE member_id=? AND permission='eeo.individual'",member.id)?'owner_only_delegation':null
    if(reason){await auditRead(env,actor.id,'access.denied',actor.id,{reason});insist(false,reason,403)}
  }
  const auth = operatorAuth(env), operator = await operatorByEmail(env, request, email)
  insist(!policy||operator?.role!=='owner','owner_access_fixed',409)
  const administrator=policy && !!await one(env,"SELECT 1 FROM wl_level_permissions p JOIN wl_levels s ON s.id=p.level_id WHERE p.level_id=? AND p.permission='people.manage' AND s.scope_kind='everyone'",policy.level_id)
  const role=administrator?'admin':'member'
  if (!operator) await auth.invite(request, { email, displayName: name, role, returnTo: '/app' })
  else if (operator.status === 'inactive') await auth.setOperatorStatus(request, operator.id, 'active')
  const target=await one(env,'SELECT id,version,role FROM oa_operators WHERE lower(email)=?',email)
  insist(target,'access_changed',409)
  insist(!policy||target.role!=='owner','owner_access_fixed',409)
  const id = member?.id ?? newId()
  await commit(env, [
    guard(env,'access_changed','EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role=?)',target.id,target.version,target.role),
    levelSessionFence(env,actor),
    guard(env,'access_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),
    ...(currentOnly?[guard(env,'not_current_employee',activeSql,person.id,actor.today,actor.today)]:[]),
    member
      ? stmt(env, "UPDATE wl_members SET person_id = ?, status = 'active' WHERE id = ?", person.id, id)
      : stmt(env, "INSERT INTO wl_members (id, email, name, person_id, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)", id, email, name, person.id, now()),
    ...(operator&&policy?[stmt(env,"UPDATE oa_operators SET role=? WHERE id=? AND role!='owner'",role,operator.id)]:[]),
    ...(policy?[stmt(env,'INSERT OR IGNORE INTO wl_member_levels(member_id,level_id) VALUES(?,?)',id,policy.level_id)]:[]),
  ], { actor: actor.id, action: 'access.give', subject: person.id, detail: { member: id, invited: !operator, defaultLevel:policy?.level_id??null } })
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
