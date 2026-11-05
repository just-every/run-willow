import type { Bindings } from '../../auth.server'
import { can, canCredentialAdmin, type Actor } from '../actor'
import { sees } from '../access'
import { auditTrail, type AuditEvent, type AuditFilters } from '../audit'
import { all, json, type Row } from '../core'
import { formatDate, formatInstant } from '../dates'
import { employer } from '../employer'
import { mayReadLeaveRequest } from '../leave'
import { directory } from '../profile'
import { currentMembership, matchesAudience } from '../company/audience'
import { LATEST_ANNOUNCEMENTS } from '../company/store'
import { auditActionLabel, auditRecordKind } from './audit-labels'
import { field, h, page, select, table } from './html'

interface RecordLabel { label: string; href?: string }
type Person = { id: string; name: string }

/** Resolve only the subjects on this page. JSON binds avoid D1's parameter cap
 * for grouped read events. No document title, reason, pay or personal value is
 * selected while making these labels. Directory admission still applies. */
async function recordLabels(env: Bindings, actor: Actor, events: AuditEvent[], people: Person[]) {
  const subjects = [...new Set(events.flatMap(event => event.subject.split(',')))]
  const ids = JSON.stringify(subjects), labels = new Map<string, RecordLabel>()
  const names = new Map(people.map(person => [person.id, person.name]))
  const peopleLink = (person: string) => names.has(person) ? `/app/people/${person}` : undefined
  const put = (id: string, label: string, href?: string) => labels.set(id, { label, href })
  const personLabel = (id: string, kind: string, person: string, href?: string) =>
    put(id, names.has(person) ? `${kind} · ${names.get(person)}` : kind, names.has(person) ? href : undefined)
  const rows = (sql: string, column: string) => all(env, `${sql} WHERE ${column} IN (SELECT value FROM json_each(?))`, ids)
  const [members, cases, tasks, requests, periods, terms, accounts, documents, versions, batches, proposals, templates, policies, policyVersions, changes, selfChanges, credentials, announcements, membership, settings] = await Promise.all([
    rows('SELECT id,name,person_id FROM wl_members', 'id'),
    rows('SELECT id,person_id,kind FROM wl_cases', 'id'),
    rows('SELECT t.id,c.id AS case_id,c.person_id FROM wl_case_tasks t JOIN wl_cases c ON c.id=t.case_id', 't.id'),
    rows('SELECT id,person_id,approver_member_id,status,requested_by FROM wl_leave_requests', 'id'),
    rows('SELECT id,person_id FROM wl_periods', 'id'),
    rows('SELECT t.id,p.person_id FROM wl_terms t JOIN wl_periods p ON p.id=t.period_id', 't.id'),
    rows('SELECT a.id,p.person_id FROM wl_leave_accounts a JOIN wl_periods p ON p.id=a.period_id', 'a.id'),
    rows('SELECT id,person_id FROM wl_documents', 'id'),
    rows('SELECT v.id,d.person_id FROM wl_document_versions v JOIN wl_documents d ON d.id=v.document_id', 'v.id'),
    rows('SELECT id,period_start,period_end FROM wl_payroll_batches', 'id'),
    rows('SELECT id,kind FROM wl_proposals', 'id'),
    can(actor, 'people.manage') ? rows('SELECT id,name FROM wl_templates', 'id') : [],
    rows('SELECT id,name FROM wl_leave_policies', 'id'),
    rows('SELECT v.id,v.version,p.name FROM wl_policy_versions v JOIN wl_leave_policies p ON p.id=v.policy_id', 'v.id'),
    rows('SELECT id,person_id FROM wl_change_requests', 'id'),
    rows('SELECT id,person_id FROM wl_self_changes', 'id'),
    canCredentialAdmin(actor) ? rows('SELECT id,name FROM wl_api_credentials', 'id') : [],
    all(env, `${LATEST_ANNOUNCEMENTS} AND (v.announcement_id IN (SELECT value FROM json_each(?)) OR v.id IN (SELECT value FROM json_each(?)))`, ids, ids),
    currentMembership(env, actor),
    Promise.all([
      ['wl_departments', 'Department'], ['wl_locations', 'Location'], ['wl_schedules', 'Working schedule'],
      ['wl_divisions', 'Division'], ['wl_legal_entities', 'Legal entity'],
    ].map(async ([table, kind]) => ({ kind, rows: await rows(`SELECT id,name FROM ${table}`, 'id') }))),
  ])
  for (const person of people) put(person.id, person.name, peopleLink(person.id))
  for (const member of members) put(member.id, member.name, member.person_id ? peopleLink(member.person_id) : undefined)
  for (const record of cases) personLabel(record.id, ({ joiner: 'Joiner case', mover: 'Change case', leaver: 'Leaver case' } as Record<string, string>)[record.kind] ?? 'Lifecycle case', record.person_id,
    sees(actor, record.person_id, 'lifecycle') ? `/app/cases/${record.id}` : undefined)
  for (const record of tasks) personLabel(record.id, 'Lifecycle task', record.person_id,
    sees(actor, record.person_id, 'lifecycle') ? `/app/cases/${record.case_id}` : undefined)
  for (const record of requests) personLabel(record.id, 'Leave request', record.person_id,
    mayReadLeaveRequest(actor, record) ? `/app/leave/${record.id}` : undefined)
  for (const [records, kind] of [[periods, 'Employment'], [terms, 'Employment terms'], [accounts, 'Leave account'], [documents, 'Document'], [versions, 'Document version'], [changes, 'Employment change request'], [selfChanges, 'Profile change request']] as [Row[], string][]) {
    for (const record of records) personLabel(record.id, kind, record.person_id, peopleLink(record.person_id))
  }
  for (const batch of batches) put(batch.id, `Payroll batch · ${formatDate(batch.period_start)} – ${formatDate(batch.period_end)}`,
    can(actor, 'payroll.handoff') && can(actor, 'pay.read') ? `/app/payroll/${batch.id}` : undefined)
  for (const proposal of proposals) put(proposal.id, proposal.kind === 'joiner' ? 'New employment proposal' : 'Employment change proposal', can(actor, 'people.manage') ? `/app/proposals/${proposal.id}` : undefined)
  for (const template of templates) put(template.id, `Workflow template · ${template.name}`)
  for (const policy of policies) put(policy.id, `Leave policy · ${policy.name}`)
  for (const policy of policyVersions) put(policy.id, `Leave policy · ${policy.name} · version ${policy.version}`)
  for (const credential of credentials) put(credential.id, `API credential · ${credential.name}`, '/app/api-credentials')
  for (const announcement of announcements) {
    const administrator = can(actor, 'people.manage')
    const delivered = !announcement.retired && announcement.starts_on <= actor.today && (!announcement.ends_on || announcement.ends_on >= actor.today) && matchesAudience(announcement, membership)
    if (administrator || delivered) {
      const label = { label: `Announcement · ${announcement.title}`, href: administrator ? '/app/company' : '/app' }
      labels.set(announcement.announcement_id, label)
      labels.set(announcement.id, label)
    }
  }
  for (const group of settings) for (const row of group.rows) put(row.id, `${group.kind} · ${row.name}`)
  return labels
}

function details(event: AuditEvent): Record<string, unknown> {
  const value = json<unknown>(event.detail, {})
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function eventRecords(event: AuditEvent, labels: Map<string, RecordLabel>, people: Person[]): RecordLabel[] {
  if (event.action === 'access.bulk') {
    const detail = details(event), names = new Map(people.map(person => [person.id, person.name]))
    const invited = Array.isArray(detail.invited) ? detail.invited : []
    const named = invited.filter((id): id is string => typeof id === 'string').map(id => names.get(id)).filter(Boolean)
    return [{ label: named.length ? `Employee invitations · ${named.slice(0, 5).join(', ')}${invited.length > 5 ? ` and ${invited.length - 5} more` : ''}` : 'Selected employee invitations' }]
  }
  const special: Record<string, string> = {
    employer: 'Employer settings', organisation: 'Organization', organization: 'Organization',
    credentials: 'API credentials', scope: 'Authorized people', report: 'Report',
    none: 'No default access level', system: 'Willow',
  }
  return [...new Set(event.subject.split(','))].map(subject => labels.get(subject) ?? { label: special[subject] ?? `${auditRecordKind(event.action)} (unavailable)` })
}

function auditLink(filters: AuditFilters, direction?: 'before' | 'after', cursor?: number): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
  if (direction && cursor) query.set(direction, String(cursor))
  return `/app/audit${query.size ? `?${query}` : ''}`
}

export async function auditPage(env: Bindings, actor: Actor, url: URL) {
  // Authorize before loading the directory, names or any record metadata.
  const trail = await auditTrail(env, actor, url)
  const [company, people, members, credentials] = await Promise.all([
    employer(env), directory(env, actor), all<{ id: string; name: string }>(env, 'SELECT id,name FROM wl_members'),
    canCredentialAdmin(actor) ? all<{ id: string; name: string }>(env, 'SELECT id,name FROM wl_api_credentials') : [],
  ])
  const labels = await recordLabels(env, actor, trail.events, people)
  const names = new Map(members.map(member => [member.id, member.name]))
  const credentialNames = new Map(credentials.map(credential => [`credential:${credential.id}`, credential.name]))
  const who = (event: AuditEvent) => event.agent_name || names.get(event.actor) || credentialNames.get(event.actor) ||
    (event.actor.startsWith('credential:') ? 'API credential' : event.actor === 'scheduler' ? 'Willow (scheduled work)' : event.actor === 'system' ? 'Willow' : 'Former member')
  const { filters } = trail
  const actions = trail.actions.map(action => ({ value: action, label: auditActionLabel(action) })).sort((a, b) => a.label.localeCompare(b.label))
  if (filters.action && !actions.some(action => action.value === filters.action)) actions.push({ value: filters.action, label: auditActionLabel(filters.action) })
  const body = h`<h1>Audit trail</h1><p class="muted">Every change, and every read of private details, pay, confidential reasons and documents. Newest first. Browse all retained events; dates use ${company?.timezone ?? 'UTC'}.</p>
<section class="card"><h2>Find events</h2><form method="get" action="/app/audit" class="row-form">
${select('Person', 'person', people.map(person => ({ value: person.id, label: person.name })), filters.person, { required: false, blank: 'All people' })}
${select('Action', 'action', actions, filters.action, { required: false, blank: 'All actions' })}
${field('From date', 'from', { type: 'date', value: filters.from, required: false })}${field('Through date', 'to', { type: 'date', value: filters.to, required: false })}
<button type="submit">Filter events</button><a href="/app/audit">Clear filters</a></form></section>
<section class="card"><h2>Events</h2>${trail.events.length ? table(['When', 'Who', 'What', 'Record'], trail.events.map(event => [formatInstant(event.at, company?.timezone ?? 'UTC'), who(event), auditActionLabel(event.action),
  eventRecords(event, labels, people).map(record => h`<div>${record.href ? h`<a href="${record.href}">${record.label}</a>` : record.label}</div>`)])) : h`<p>No events match this view.</p><p><a href="${auditLink(filters)}">Return to the newest matching events</a></p>`}
<nav aria-label="Audit event pages">${trail.newer ? h`<a href="${auditLink(filters, 'after', trail.newer)}">Newer events</a> · ` : ''}${trail.older ? h`<a href="${auditLink(filters, 'before', trail.older)}">Older events</a>` : ''}</nav></section>`
  return page('Audit', actor, body, { current: '/app/audit', url })
}
