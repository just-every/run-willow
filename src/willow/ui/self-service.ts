// SELF-001: personal updates that need HR approval, with immutable proposals.
import { customApprovalForms } from './custom-approval'
import type { Bindings } from '../../auth.server'
import { can, canAbout, employerZone, hasScopedGrant, type Actor } from '../actor'
import { formatDate } from '../dates'
import { personNames, PRIVATE_LABELS } from '../people'
import { SELF_FIELDS, selfWriteModes, type SelfField } from '../levels/personal'
import { personView } from '../profile'
import type { PersonRecordTables } from '../record-tables/rows'
import { selfChange, selfChanges, selfExceptions } from '../self-service/view'
import { area, field, form, h, hidden, page, select, table, tag, when, type Html } from './html'

const route = '/app/self-changes'
const hr = (actor: Actor, personId = '') => canAbout(actor, 'people.manage', personId) && canAbout(actor, 'people.private', personId)
const title = (kind: string) => kind === 'goal' ? 'Goal change' : kind === 'customField' ? 'Custom field change' : kind === 'document' ? 'Document change' : kind === 'legalName' ? 'Legal name change' : kind === 'dependent' ? 'Dependent change' : 'Personal detail change'
const PERSONAL_LABELS: Record<SelfField, string> = { legalName:'Legal name', preferredName: 'Preferred name', ...PRIVATE_LABELS }
const LABELS: Record<string, string> = { ...PERSONAL_LABELS, operation:'Goal change', payload:'Proposed details', title:'Goal', milestones:'Milestones', dueDate:'Due date', owner:'Goal owner', progress:'Progress percent', evidence:'Completion evidence', goal:'Goal id', source:'Source revision', legalName: 'Legal name', name: 'Name', relationship: 'Relationship', row: 'Dependent row', values: 'Details', removed: 'Removed' }
type PersonalModes = Record<SelfField, 'view' | 'approval' | 'edit'>

/** Render the saved proposal itself, never a reconstruction from today's record. */
function snapshot(value: unknown): Html {
  if (value === null || value === undefined) return h`<dl class="facts"><dt>Dependent</dt><dd>Not recorded</dd></dl>`
  if (Array.isArray(value)) return h`<ol>${value.map(item => h`<li>${snapshot(item)}</li>`)}</ol>`
  if (typeof value !== 'object') return h`<dl class="facts"><dt>Value</dt><dd>${typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</dd></dl>`
  return h`<dl class="facts">${Object.entries(value).map(([key, item]) => h`<dt>${LABELS[key] ?? key.replace(/_/g, ' ')}</dt><dd>${item !== null && typeof item === 'object' ? snapshot(item) : item === null || item === '' ? '—' : typeof item === 'boolean' ? (item ? 'Yes' : 'No') : key === 'date_of_birth' && typeof item === 'string' ? formatDate(item) : item}</dd>`)}</dl>`
}

function dependentFields(values: Record<string, unknown> = {}) {
  return [field('Name', 'col.name', { value: values.name }), field('Relationship', 'col.relationship', { value: values.relationship }), field('Date of birth', 'col.date_of_birth', { type: 'date', required: false, value: values.date_of_birth })]
}

function personalRequestForms(view: Record<string, unknown>, modes: PersonalModes) {
  const fields = SELF_FIELDS.filter(key => key!=='legalName' && modes[key] === 'approval')
  return fields.length ? h`<section class="card private"><h2>Request a personal detail change</h2><p>HR reviews these fields before they change. Leave a value blank to request its removal.</p>${fields.map(key => h`<details><summary>Change ${PERSONAL_LABELS[key].toLowerCase()}</summary>${form('self.request', `${route}/{id}`, [hidden('kind', 'personal'), hidden('field', key), field(PERSONAL_LABELS[key], 'value', { required: false, type: key === 'date_of_birth' ? 'date' : 'text', value: key === 'preferredName' ? view.preferredName : (view.private as Record<string, unknown>)[key] })], `Request ${PERSONAL_LABELS[key].toLowerCase()} change`)}</details>`)}</section>` : h``
}

function requestForms(view: Record<string, unknown>, modes: PersonalModes) {
  const dependents = (view.recordTables as PersonRecordTables).tables.find(item => item.key === 'dependents')
  return h`${personalRequestForms(view, modes)}${modes.legalName==='approval'?h`<section class="card"><h2>Request a legal name change</h2><p>HR reviews your request before your legal name changes.</p>${form('self.request', `${route}/{id}`, [hidden('kind', 'legalName'), field('New legal name', 'legalName', { value: view.legalName })], 'Request legal name change')}</section>`:''}
<section class="card private"><h2>Dependents</h2><p>Dependent details are private. HR reviews additions, changes and removals before they take effect.</p>
${dependents?.rows.length ? table(['Name', 'Relationship', 'Date of birth'], dependents.rows.map(row => [row.values!.name, row.values!.relationship, row.values!.date_of_birth ? formatDate(String(row.values!.date_of_birth)) : '—'])) : h`<p class="muted">No dependents recorded.</p>`}
${!dependents?.retired ? h`<details><summary>Add a dependent</summary>${form('self.request', `${route}/{id}`, [hidden('kind', 'dependent'), ...dependentFields()], 'Request dependent addition')}</details>
${dependents?.rows.map(row => h`<details><summary>Change ${row.values!.name}</summary>${form('self.request', `${route}/{id}`, [hidden('kind', 'dependent'), hidden('row', row.id), ...dependentFields(row.values!)], 'Request dependent change')}${form('self.request', `${route}/{id}`, [hidden('kind', 'dependent'), hidden('row', row.id), hidden('remove', 'yes')], 'Request dependent removal', { secondary: true })}</details>`)}` : h`<p class="muted">This table is retired; HR must review its definition before new changes can be requested.</p>`}</section>`
}

export async function selfChangesPage(env: Bindings, actor: Actor, url: URL) {
  const [changes, names, view, modes] = await Promise.all([selfChanges(env, actor), personNames(env), actor.personId ? personView(env, actor, actor.personId) : null, selfWriteModes(env, actor)])
  const mayHandle = can(actor,'people.manage') || hr(actor) || hasScopedGrant(actor, 'people.manage') || (can(actor, 'payroll.handoff') && can(actor, 'pay.read'))
  const exceptions = mayHandle ? await selfExceptions(env,actor) : []
  const body = h`<h1>Personal change requests</h1><p>Changes marked for HR approval stay pending until HR reviews them. Your access determines how legal name changes are made; dependent details still need approval. Your access determines which other personal details need approval and which you can save directly on <a href="${actor.personId ? `/app/people/${actor.personId}` : '/app/people'}">your record</a>.</p>
<section class="card"><h2>${hr(actor) || hasScopedGrant(actor, 'people.private') ? 'Requests in your scope' : 'Your requests'}</h2>${changes.length ? table(['Person', 'Request', 'Status', 'Due', 'Owner', 'Reconciliation'], changes.map(change => [h`<a href="/app/people/${change.personId}">${names.get(change.personId) ?? change.personId}</a>`, h`<a href="${route}/${change.id}">${title(change.kind)}</a>`, tag(change.status), formatDate(change.dueDate), change.owner, change.reconciliation ? tag(change.reconciliation.status) : '—'])) : h`<p class="muted">No personal change requests.</p>`}</section>
${mayHandle ? h`<section class="card"><h2>Approved revisions to reconcile</h2><p>Private values remain with HR. Record the downstream handoff; no provider confirmation is implied.</p>${exceptions.length ? table(['Person','Change','Due','Reconciliation'],exceptions.map(r=>[names.get(r.personId)??r.personId,title(r.kind),formatDate(r.dueDate),r.status==='resolved'?h`${tag('resolved')} ${r.reference}`:form('self.reconcile',route,[hidden('change',r.id),field('Handoff reference','reference')],'Record handoff',{secondary:true})])) : h`<p class="muted">No approved revisions.</p>`}</section>` : ''}
${await customApprovalForms(env,actor)}${view ? requestForms(view, modes) : ''}`
  return page('Personal change requests', actor, body, { current: route, url })
}

export async function selfChangePage(env: Bindings, actor: Actor, id: string, url: URL) {
  const [change, zone, names] = await Promise.all([selfChange(env, actor, id), employerZone(env), personNames(env)])
  const back = `${route}/${change.id}`
  const body = h`<p class="back"><a href="${route}">← Personal change requests</a></p><div class="title-row"><h1>${title(change.kind)}</h1><p>${tag(change.status)}</p></div>
<section class="card"><h2>Request details</h2><dl class="facts"><dt>Person</dt><dd><a href="/app/people/${change.personId}">${names.get(change.personId) ?? change.personId}</a></dd><dt>Requested by</dt><dd>${change.requestedBy}</dd><dt>Requested at</dt><dd>${when(change.requestedAt, zone)}</dd><dt>Due</dt><dd>${formatDate(change.dueDate)}</dd><dt>Owner</dt><dd>${change.owner}</dd><dt>Status</dt><dd>${tag(change.status)}</dd></dl><p>The saved before and after values remain as the record of this request.</p><h3>Before</h3>${change.kind==='goal'&&change.before===null?h`<p>New goal; nothing is published until approval.</p>`:change.kind==='document'?h`<p>${change.before?'The current published versions remain on the person record until approval.':'New document; nothing is published until approval.'}</p>`:snapshot(change.before)}<h3>After</h3>${change.kind==='document'?h`<dl class="facts"><dt>Title</dt><dd>${change.after.title}</dd><dt>Category</dt><dd>${change.documentCategory}</dd><dt>File</dt><dd>${change.after.filename}</dd><dt>Size</dt><dd>${change.after.size} bytes</dd><dt>SHA-256</dt><dd>${change.after.sha256}</dd></dl><p><a href="/app/files/document/${change.after.version}?download=1">Download proposed file for review</a></p>`:change.after === null ? h`<dl class="facts"><dt>Dependent</dt><dd>Removed</dd></dl>` : snapshot(change.after)}</section>
${change.decision ? h`<section class="card"><h2>Decision</h2><dl class="facts"><dt>Decision</dt><dd>${tag(change.status)}</dd><dt>Recorded by</dt><dd>${change.decision.by}</dd><dt>Recorded at</dt><dd>${when(change.decision.at, zone)}</dd><dt>Comment</dt><dd>${change.decision.comment || '—'}</dd></dl></section>` : ''}
${change.mayDecide && change.status === 'pending' ? h`<section class="card"><h2>Review</h2>${form('self.decide', back, [hidden('change', change.id), select('Decision', 'decision', [{ value: 'approve', label: 'Approve' }, { value: 'reject', label: 'Reject' }]), area('Comment', 'comment')], 'Record decision')}</section>` : ''}
${change.reconciliation ? h`<section class="card"><h2>Reconciliation</h2><dl class="facts"><dt>Status</dt><dd>${tag(change.reconciliation.status)}</dd><dt>Reference</dt><dd>${change.reconciliation.reference || '—'}</dd><dt>Recorded by</dt><dd>${change.reconciliation.by || '—'}</dd><dt>Recorded at</dt><dd>${when(change.reconciliation.at, zone)}</dd></dl>
${change.mayDecide && change.status === 'approved' && change.reconciliation.status === 'open' ? form('self.reconcile', back, [hidden('change', change.id), field('Reconciliation reference', 'reference', { hint: 'Record the evidence or reference for the completed follow-up.' })], 'Record reconciliation') : ''}</section>` : ''}`
  return page('Personal change request', actor, body, { current: route, url })
}

export async function selfChangesPanel(env: Bindings, actor: Actor) {
  if (!actor.personId && !can(actor,'people.private') && !actor.otherPersonal.length && !actor.approvalGrants.length && !actor.performanceFields.length) return h``
  const changes = await selfChanges(env, actor)
  const pending = changes.filter(change => change.status === 'pending').length
  const open = changes.filter(change => change.status === 'approved' && change.reconciliation?.status === 'open').length
  return h`<section class="card"><h2><a href="${route}">Personal change requests</a></h2><p>${pending} awaiting HR approval · ${open} awaiting reconciliation</p>${actor.personId ? h`<p><a href="${route}">Request a legal name or dependent change</a></p>` : ''}</section>`
}

export function selfProfilePanel(actor: Actor, view: Record<string, unknown>, modes?: PersonalModes) {
  if (actor.personId !== view.id || view.asOf !== actor.today) return h``
  const mode = modes?.preferredName ?? 'edit', legalMode=modes?.legalName??'approval'
  return h`<section class="card"><h2>Your personal details</h2><p>${mode === 'edit' ? 'Your preferred name saves immediately.' : mode === 'approval' ? 'HR approves changes to your preferred name.' : 'Your preferred name is view only.'} ${legalMode==='approval'?'HR approves legal name changes.':legalMode==='edit'?'Your legal name saves immediately.':'Your legal name is view only.'} HR approves dependent changes.</p>${mode === 'edit' ? form('person.update', `/app/people/${view.id}`, [hidden('person', view.id), hidden('revision', view.revision), field('Preferred name', 'preferredName', { required: false, value: view.preferredName })], 'Save preferred name') : h`<dl class="facts"><dt>Preferred name</dt><dd>${view.preferredName || '—'}</dd></dl>`}${legalMode==='edit'?form('person.update',`/app/people/${view.id}`,[hidden('person',view.id),hidden('revision',view.revision),field('Legal name','legalName',{value:view.legalName})],'Save legal name'):''}<p><a href="${route}">Request an allowed personal or dependent change and track its progress</a></p></section>`
}
