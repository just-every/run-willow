// DATA-002 pages: the owner's retention census (table adoption, state rules, class mappings, holds,
// erasure requests) and the read-only erasure preview. HR sees only the request form and list.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all } from '../core'
import { formatDate } from '../dates'
import { SCOPES } from '../retention/holds'
import { SOURCES, previewErasure } from '../retention/erasure'
import { previewApplicant } from '../retention/applicant'
import { CLASS_KEYS } from '../retention/rules'
import { erasureReceipt, retainedRecords, retention } from '../retention/view'
import { reviewList } from '../retention/review'
import { field, form, h, hidden, page, select, table, tag } from './html'

const PATH = '/app/retention'
const SOURCE_LABELS: Record<string, string> = { own_request: 'The person\'s own request', retention_expiry: 'Retention expiry', counsel: 'Counsel', other: 'Other' }
const SCOPE_LABELS: Record<string, string> = { person: 'One person', document_category: 'A document category', record_class: 'A record class', date_range: 'An employment-date range', employer: 'The whole employer' }

function requestForm(people: { id: string; name: string }[], today: string) {
  return form('erasure.request', PATH, [select('Former worker', 'person', people.map(p => ({ value: p.id, label: p.name }))), select('Request source', 'source', SOURCES.map(value => ({ value, label: SOURCE_LABELS[value] }))),
    field('Date received', 'receivedOn', { type: 'date', value: today })], 'Open erasure request')
}

function applicantForm(applicants: { id: string; name: string; email: string | null }[], today: string) {
  return applicants.length ? form('erasure.request', PATH, [select('Applicant who was not hired', 'application', applicants.map(a => ({ value: a.id, label: `${a.name}${a.email ? ` (${a.email})` : ''}` }))), select('Request source', 'source', SOURCES.map(value => ({ value, label: SOURCE_LABELS[value] }))),
    field('Date received', 'receivedOn', { type: 'date', value: today })], 'Open applicant erasure request') : ''
}

export async function retentionPage(env: Bindings, actor: Actor, url: URL) {
  const data = await retention(env, actor) as any
  const applicants = await all<{ id: string; name: string; email: string | null }>(env, 'SELECT id, name, contact_email AS email FROM wl_hiring_applications ORDER BY name LIMIT 300')
  const requests = (owner: boolean) => data.requests.length ? table(['Person', 'Source', 'Received', 'Status', ''], data.requests.map((r: any) => [r.person.name, SOURCE_LABELS[r.source], formatDate(r.receivedOn), tag(r.status),
    owner && r.receipt ? h`<a href="${PATH}/receipts/${r.receipt}">Receipt</a>` : owner && r.status !== 'withdrawn' ? h`<a href="${PATH}/erasure?${r.applicant ? 'application' : 'person'}=${r.person.id}">Preview</a> ${form('erasure.withdraw', PATH, hidden('request', r.id), 'Withdraw', { secondary: true })}` : ''])) : h`<p>No erasure requests.</p>`
  if (!actor.owner) {
    const people = await all<{ id: string; name: string }>(env, 'SELECT id, legal_name AS name FROM wl_people ORDER BY legal_name')
    return page('Erasure requests', actor, h`<h1>Erasure requests</h1><p>HR opens a request and records where it came from. The owner alone decides.</p>
<section class="card"><h2>Open a request</h2>${requestForm(people, actor.today)}${applicantForm(applicants, actor.today)}</section><section class="card"><h2>Requests</h2>${requests(false)}</section>`, { current: PATH, url })
  }
  const classOptions = CLASS_KEYS.map(key => ({ value: key, label: data.classes.find((c: any) => c.key === key).label }))
  const members = await all<{ id: string; name: string }>(env, "SELECT id, name FROM wl_members WHERE status = 'active' ORDER BY name")
  const adopted = data.adopted?.table_version === data.tableVersion
  const mapRows = (kind: string, rows: any[], name: string) => rows.map(row => [name, row[kind === 'document_category' ? 'name' : 'key'], row.class ? data.classes.find((c: any) => c.key === row.class).label : tag('unmapped')])
  const mappingRefs = [...data.mappings.documentCategories.map((r: any) => ({ value: `document_category:${r.id}`, label: `Document category: ${r.name}` })), ...data.mappings.customFields.map((r: any) => ({ value: `custom_field:${r.id}`, label: `Custom field: ${r.key}` })), ...data.mappings.recordTables.map((r: any) => ({ value: `record_table:${r.id}`, label: `Record table: ${r.key}` }))]
  return page('Retention and erasure', actor, h`<p class="back"><a href="/app/settings">← Settings</a></p><h1>Retention and erasure</h1>
<p>The owner alone adopts the retention table, confirms each work state, places holds and decides erasures. Nothing here deletes anything.</p>
<section class="card"><h2>Retention table <small>${data.tableVersion}</small></h2><p>A dated federal default, not legal advice. You adopt it once; periods may be lengthened, never shortened.</p>
${table(['Record class', 'Rule', 'Source'], data.classes.map((c: any) => [c.label, c.rule, c.citation]))}
${adopted ? h`<p>${tag('adopted')} Adopted ${formatDate(new Date(data.adopted.adopted_at).toISOString().slice(0, 10))}.</p>` : form('retention.adopt', PATH, hidden('version', data.tableVersion), 'Adopt this table')}</section>
<section class="card"><h2>Federal contractor</h2><p>${data.contractor.contractor ? (data.contractor.covered ? 'A federal contractor with 150 or more employees and a contract of at least $150,000.' : 'A federal contractor below those thresholds.') : 'Not a federal contractor (the default).'}</p>
${form('contractor.set', PATH, [h`<label class="check"><input type="checkbox" name="contractor" value="yes"> Federal contractor or subcontractor</label>`, h`<label class="check"><input type="checkbox" name="covered" value="yes"> 150 or more employees and a contract of at least $150,000</label>`], 'Record status')}</section>
<section class="card"><h2>Work-state rules</h2><p>For each state where you have a location, record a longer sourced rule or confirm there is none. Nobody in an unconfirmed state can be erased or purged.</p>
${data.workStates.length ? table(['State', 'Decision'], data.workStates.map((state: string) => { const rows = data.states.filter((r: any) => r.state === state); return [state, rows.length ? rows.map((r: any) => r.decision === 'none' ? 'No longer rule' : `${r.class}: ${r.years} years (${r.citation})`).join('; ') : tag('unconfirmed')] })) : h`<p>No location has a work state yet.</p>`}
${form('retention.state', PATH, [field('State (two letters)', 'state'), select('Decision', 'decision', [{ value: 'none', label: 'No longer state rule' }, { value: 'longer', label: 'A longer sourced rule' }]),
  select('Applies to', 'class', [{ value: 'all', label: 'Every record class' }, ...classOptions], 'all', { required: false }), field('Years', 'years', { type: 'number', required: false }), field('Citation', 'citation', { required: false })], 'Record state decision')}</section>
<section class="card"><h2>Record-class mapping</h2><p>Each document category, custom field and custom table that holds a person's data needs a class before that person's erasure can be previewed.</p>
${table(['Kind', 'Name', 'Class'], [...mapRows('document_category', data.mappings.documentCategories, 'Document category'), ...mapRows('custom_field', data.mappings.customFields, 'Custom field'), ...mapRows('record_table', data.mappings.recordTables, 'Record table')])}
${mappingRefs.length ? h`<form method="post" action="/app/do/retention.map"><input type="hidden" name="returnTo" value="${PATH}">${select('Item', 'target', mappingRefs)}${select('Class', 'class', classOptions)}<button type="submit">Save mapping</button></form>` : ''}</section>
<section class="card"><h2>Legal holds</h2>${data.holds.length ? table(['Scope', 'Reason', 'Review by', 'Status', ''], data.holds.map((hold: any) => [`${SCOPE_LABELS[hold.scope_kind]}${hold.scope_ref ? ` (${hold.scope_ref})` : ''}${hold.from_date ? ` ${hold.from_date} to ${hold.to_date}` : ''}`, hold.reason, formatDate(hold.review_date), tag(hold.released_at ? 'released' : 'active'),
  hold.released_at ? '' : h`${form('hold.release', PATH, hidden('hold', hold.id), 'Release', { secondary: true })}`])) : h`<p>No holds.</p>`}
${form('hold.place', PATH, [select('Scope', 'scope', SCOPES.map(value => ({ value, label: SCOPE_LABELS[value] }))), field('Reference (person, category id or class)', 'ref', { required: false }), field('From (date range only)', 'from', { type: 'date', required: false }), field('To (date range only)', 'to', { type: 'date', required: false }),
  field('Reason', 'reason'), select('Hold owner', 'holdOwner', members.map(m => ({ value: m.id, label: m.name }))), field('Review date', 'reviewDate', { type: 'date' })], 'Place hold')}</section>
<p><a href="${PATH}/retained">Retained records in restricted custody</a> · <a href="${PATH}/review">Records past retention</a></p>
<section class="card"><h2>Erasure requests</h2>${requests(true)}${requestForm(data.former, actor.today)}${applicantForm(applicants, actor.today)}${data.former.length ? '' : h`<p class="muted">No former worker is eligible yet: erasure covers people with no current or future employment.</p>`}</section>`, { current: PATH, url })
}

const DISPOSITIONS: Record<string, string> = { erased: 'Erased now', anonymized: 'Anonymized', redacted: 'Redacted from custody', retained: 'Retained (restricted)', held: 'Held' }

export async function erasurePage(env: Bindings, actor: Actor, url: URL) {
  const applicant = url.searchParams.has('application')
  const preview = applicant ? await previewApplicant(env, actor, url.searchParams.get('application') ?? '') : await previewErasure(env, actor, url.searchParams.get('person') ?? '')
  return page('Erasure preview', actor, h`<p class="back"><a href="${PATH}">← Retention and erasure</a></p><h1>Erasure preview</h1>
<p>${preview.person.name}. This preview changes nothing; the owner confirms its digest to approve.</p>
${preview.blockers.length ? h`<section class="card"><h2>Blocked</h2>${table(['What', 'Reference'], preview.blockers.map(b => [b.reason, b.ref]))}</section>` : ''}
<section class="card"><h2>Summary</h2><dl><dt>Rows examined</dt><dd>${preview.summary.rows}</dd><dt>Erased now</dt><dd>${preview.summary.erased}</dd><dt>Anonymized</dt><dd>${preview.summary.anonymized}</dd><dt>Redacted from custody</dt><dd>${preview.summary.redacted}</dd><dt>Retained</dt><dd>${preview.summary.retained}</dd><dt>Held</dt><dd>${preview.summary.held}</dd><dt>Files</dt><dd>${preview.summary.blobs} (${preview.summary.bytes} bytes)</dd></dl></section>
<section class="card"><h2>Every record, item by item</h2>${table(['Record', 'Rows', 'Files', 'Result', 'Class', 'Until'], preview.items.map(item => [item.label, item.rows, item.blobs, tag(DISPOSITIONS[item.disposition]), item.class ?? '—', item.hold ? 'Hold' : item.expiry ? formatDate(item.expiry) : '—']))}</section>
<section class="card"><h2>Copies outside Willow</h2><p>${preview.copies.exports.statement}</p>${preview.copies.providers.length ? table(['Destination', 'Copies'], preview.copies.providers.map(p => [p.provider, p.copies])) : ''}</section>
<section class="card"><h2>Decision</h2><p>Digest <code>${preview.digest.slice(0, 16)}</code>.</p>${preview.request ? preview.request.status === 'confirmed' ? h`<p>${tag('confirmed')} Confirmed by the owner.</p>` : preview.confirmable ? form('erasure.confirm', PATH, [hidden(applicant ? 'application' : 'person', preview.person.id), hidden('digest', preview.digest)], 'Confirm this preview and erase') : h`<p>Resolve the blocked items first.</p>` : h`<p>Open an erasure request for this person first.</p>`}</section>`, { current: PATH, url })
}

export function receiptPage(actor: Actor, data: Awaited<ReturnType<typeof erasureReceipt>>, url?: URL) {
  return page('Erasure receipt', actor, h`<p class="back"><a href="${PATH}">← Retention and erasure</a></p><h1>Erasure receipt: ${data.label}</h1>
<p>The receipt holds counts and labels only: no name, email, tax identifier, birth date or employee number.</p>
<section class="card"><dl><dt>Request source</dt><dd>${SOURCE_LABELS[data.source]}</dd><dt>Received</dt><dd>${formatDate(data.receivedOn)}</dd><dt>Approved by</dt><dd>${data.approvedBy ?? '—'}</dd><dt>Preview digest</dt><dd><code>${data.digest.slice(0, 16)}</code></dd>
<dt>Erased</dt><dd>${data.totals.erased}</dd><dt>Anonymized</dt><dd>${data.totals.anonymized}</dd><dt>Retained</dt><dd>${data.totals.retained}</dd><dt>Held</dt><dd>${data.totals.held}</dd><dt>Files deleted</dt><dd>${data.blobs.deleted} of ${data.blobs.total} (${data.blobs.bytes} bytes)</dd></dl></section>
<section class="card"><h2>Every record</h2>${table(['Record', 'Rows', 'Result', 'Class', 'Until'], data.counts.map(c => [c.table, c.rows, tag(DISPOSITIONS[c.disposition]), c.class ?? '—', c.hold ? 'Hold' : c.expiry ? formatDate(c.expiry) : '—']))}</section>
<section class="card"><h2>Copies outside Willow</h2><p>${(data.copies as any).exports?.statement ?? ''}</p></section>
<section class="card"><h2>Provider deletion requests</h2><p>Willow never claims a provider deleted the data without evidence. A failed or unanswered request stays open.</p>${data.providerRequests.length ? table(['Provider', 'Copies', 'Status', 'Due', 'Outcome'], data.providerRequests.map(r => [r.provider, r.copies, tag(r.status), formatDate(r.dueDate), r.open ? form('erasure.provider', `${PATH}/receipts/${data.id}`, [hidden('request', r.id), select('Outcome', 'outcome', [{ value: 'deleted', label: 'Deleted' }, { value: 'retained', label: 'Retained by the provider' }, { value: 'failed', label: 'Failed' }]), field('Evidence', 'evidence'), field('Provider reason (retained)', 'reason', { required: false }), field('Provider expiry (retained)', 'expiry', { type: 'date', required: false })], 'Record outcome') : [r.evidence, r.reason].filter(Boolean).join('; ')])) : h`<p>No provider was handed this person's data.</p>`}</section>`, { current: PATH, url })
}

export function retainedPage(actor: Actor, data: Awaited<ReturnType<typeof retainedRecords>>, url?: URL) {
  return page('Retained records', actor, h`<p class="back"><a href="${PATH}">← Retention and erasure</a></p><h1>Retained records</h1>
<p>Records kept for a retention rule or a hold, in restricted custody: absent from the directory, profiles, search, reports and exports. Only the owner reads them; EEO values also need EEO compliance.</p>
<section class="card">${data.records.length ? table(['Person', 'Record', 'Class', 'Until', 'Values'], data.records.map(r => [r.person, r.table, r.class ?? '—', r.hold ? 'Hold' : r.expiry ? formatDate(r.expiry) : '—', r.values ? h`<details><summary>Read retained values</summary><pre>${JSON.stringify(r.values, null, 2)}</pre></details>` : r.restricted])) : h`<p>No retained records.</p>`}</section>`, { current: PATH, url })
}

export function retentionReviewPage(actor: Actor, data: Awaited<ReturnType<typeof reviewList>>, url?: URL) {
  return page('Records past retention', actor, h`<p class="back"><a href="${PATH}">← Retention and erasure</a></p><h1>Records past retention</h1>
<p>People who are not being erased whose retention period has run out for some records. Nothing here is purged silently: you confirm one person's purge by its digest.</p>
<section class="card">${data.records.length ? table(['Person', 'Records', 'Classes', ''], data.records.map(r => [r.person.name, r.rows, [...new Set(r.expired.map(item => item.class))].join(', '), r.purgeable ? form('retention.purge', `${PATH}/review`, [hidden('person', r.person.id), hidden('digest', r.digest)], 'Purge these records', { secondary: true }) : h`Blocked: ${r.blockers.join(', ').replace(/_/g, ' ')}`])) : h`<p>No records are past their retention period.</p>`}</section>`, { current: PATH, url })
}
