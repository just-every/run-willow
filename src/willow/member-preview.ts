import type { Bindings } from '../auth.server'
import { actorFor, requirePermission, type Actor, type Permission } from './actor'
import { FACET_LABELS, facets, readsCategory, type Facet } from './access'
import { insist, one } from './core'
import { effectiveFieldDefinitions } from './custom-fields/store'
import { readsCustomField } from './custom-fields/read'
import { personView } from './profile'
import { reportChoices } from './levels/reports'
import { SELF_FIELDS, SELF_LABELS } from './levels/personal'
import { readsPersonalField } from './levels/other-personal'
import { readsTable } from './record-tables/schema'
import { PERFORMANCE_FIELDS, PERFORMANCE_LABELS, readsPerformanceField } from './levels/performance'
import { readsLeaveField, LEAVE_FIELDS, LEAVE_LABELS } from './levels/leave'
import { readsCompensation, COMPENSATION_FIELDS, COMPENSATION_LABELS } from './levels/compensation'
import { JOB_FIELDS, JOB_LABELS, readsJobHistoryField } from './levels/job'

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
  // Ended members have no projection. Keep the authorized administrator's preview open.
  const target = member.status === 'ended' ? null : await actorFor(env, { id: member.id, email: member.email, name: member.name, owner, personId: member.person_id, sessionId: '' })
  const theirs = target ? facets(target, personId) : new Set<Facet>(), mine = facets(actor, personId)
  const both = new Set([...theirs].filter(facet => mine.has(facet)))
  const view = target ? await personView(env, actor, personId, { admissionActor: target, facets: both, leaveFields:field=>readsLeaveField(target,personId,field)&&readsLeaveField(actor,personId,field), compensationFields: field=>readsCompensation(target,personId,field)&&readsCompensation(actor,personId,field), jobFields: field=>readsJobHistoryField(target,personId,field)&&readsJobHistoryField(actor,personId,field), personalFields: field => readsPersonalField(target,personId,field) && readsPersonalField(actor,personId,field), categories: category => readsCategory(target, personId, category) && readsCategory(actor, personId, category), customFields: definition => readsCustomField(target, personId, definition), recordTables: table => readsTable(target, personId, table) }) : null
  const customDefinitions = await effectiveFieldDefinitions(env, actor.today)
  const readableReports=new Map((await reportChoices(env,actor)).map(report=>[report.id,report.name]))
  const reportSelections=[...new Set((target?.reportGrants ?? []).flatMap(grant=>grant.reports))].sort().map(id=>({id,name:readableReports.get(id)??null,withheldFromYou:!readableReports.has(id),reachesThisPerson:!!target?.reportGrants.some(grant=>grant.reports.includes(id)&&grant.people.has(personId))}))
  return {
    member: { id: member.id, name: member.name, status: member.status, permissions: [...(target?.permissions ?? [])] as Permission[], scoped: (target?.scoped ?? []).map(grant => ({ level: grant.level, permissions: [...grant.permissions].sort(), reachesThisPerson: grant.people.has(personId) })), managesThisPerson: !!target?.reports.has(personId), isThisPerson: !!target && target.personId === personId },
    performanceFields:PERFORMANCE_FIELDS.map(field=>({field,label:PERFORMANCE_LABELS[field],levelView:!!target && readsPerformanceField(target,personId,field)})),
    reportSelections,
    leaveFields:LEAVE_FIELDS.map(field=>({field,label:LEAVE_LABELS[field],visible:!!target && readsLeaveField(target,personId,field),withheldFromYou:!!target && readsLeaveField(target,personId,field)&&!readsLeaveField(actor,personId,field)})),
    compensationFields:COMPENSATION_FIELDS.map(field=>({field,label:COMPENSATION_LABELS[field],visible:!!target && readsCompensation(target,personId,field),withheldFromYou:!!target && readsCompensation(target,personId,field)&&!readsCompensation(actor,personId,field)})),
    jobFields:JOB_FIELDS.map(field=>({field,label:JOB_LABELS[field],visible:!!target && readsJobHistoryField(target,personId,field),withheldFromYou:!!target && readsJobHistoryField(target,personId,field)&&!readsJobHistoryField(actor,personId,field)})),
    personalFields: SELF_FIELDS.map(field=>({field,label:SELF_LABELS[field],visible:!!target && readsPersonalField(target,personId,field),withheldFromYou:!!target && readsPersonalField(target,personId,field)&&!readsPersonalField(actor,personId,field)})),
    customFields: customDefinitions.map(definition => ({ id: definition.id, key: definition.key, label: definition.label, visible: !!target && readsCustomField(target, personId, definition), withheldFromYou: !!target && readsCustomField(target, personId, definition) && !readsCustomField(actor, personId, definition) })),
    facets: (Object.keys(FACET_LABELS) as Facet[]).map(facet => ({ facet, label: FACET_LABELS[facet], visible: theirs.has(facet), withheldFromYou: theirs.has(facet) && !mine.has(facet) })),
    view,
  }
}
