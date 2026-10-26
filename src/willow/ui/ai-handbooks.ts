import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { HANDBOOK_ATTESTATION, HANDBOOK_TOPICS, handbookSources, type HandbookClause, type HandbookSource } from '../ai-handbooks'
import { area, field, form, h, hidden, select, tag } from './html'

const topicOptions = HANDBOOK_TOPICS.map(value => ({ value, label: value.split('-').join(' ').replace(/^./, letter => letter.toUpperCase()) }))

function clauseFields(clauses: HandbookClause[]) {
 const rows: Partial<HandbookClause>[] = [...clauses, ...(clauses.length < 24 ? [{}] : [])]
 return rows.map((clause, index) => h`<fieldset><legend>Clause ${index + 1}${index === clauses.length ? ' (new)' : ''}</legend>
  ${field('Clause number', 'clauseId', { type: 'number', value: clause.clauseId ?? '', required: false })}
  ${select('Topic', 'topic', topicOptions, clause.topic ?? '', { required: false, blank: 'Choose a topic' })}
  ${field('Applies from', 'applicableFrom', { type: 'date', value: clause.applicableFrom ?? '', required: false })}
  ${area('Plain-text policy clause', 'text', clause.text ?? '', false)}</fieldset>`)
}

function draftForm(source?: HandbookSource) {
 return form('ai.handbook.write', '/app/settings', [
  ...(source ? [hidden('handbook', source.handbookId), hidden('revision', source.revision)] : []),
  field('Handbook title', 'title', { value: source?.title ?? '' }),
  h`<p>Use general employer policy only. Each numbered clause needs a topic, an effective date and plain text. Leave the new clause empty when it is not needed. To remove a clause, clear all four fields.</p>`,
  clauseFields(source?.clauses ?? []),
 ], source ? 'Create revised draft' : 'Create handbook draft')
}

function versionDetails(source: HandbookSource, actor: Actor, newest: boolean) {
 const active = source.withdrawnAt === null
 return h`<details><summary>Version ${source.version} · ${source.approvedAt ? source.current ? 'Published' : 'Prior approved version' : 'Draft'}</summary>
  <p>${source.title} · Version ID: ${source.versionId}</p>
  ${source.clauses.map(clause => h`<article><h4>Clause ${clause.clauseId} · ${topicOptions.find(option => option.value === clause.topic)!.label}</h4><p>Applies from ${clause.applicableFrom}</p><blockquote>${clause.text}</blockquote></article>`)}
  ${active && newest && !source.approvedAt ? form('ai.handbook.approve', '/app/settings', [
   hidden('version', source.versionId), hidden('revision', source.revision),
   h`<p>Review the exact title and clauses above. Approval publishes this immutable version to every active member. Any change needs a new draft and a new HR approval.</p>
   <label class="check"><input type="checkbox" name="sourceAttestation" value="true" required> ${HANDBOOK_ATTESTATION}</label>`,
  ], 'Approve and publish exact version') : ''}
  ${active && source.current ? h`<p>${source.included ? 'Included as an assistant source.' : 'Excluded from assistant sources.'} HR inclusion applies only to this HR-approved version. Assistant activation and provider consent remain separate.</p>${form('ai.handbook.include', '/app/settings', [hidden('version', source.versionId), hidden('revision', source.revision), hidden('included', !source.included)], source.included ? 'Remove assistant inclusion' : 'Include approved version')}` : ''}
 </details>`
}

export async function handbookSourcesSection(env: Bindings, actor: Actor) {
 if (!can(actor, 'people.manage')) return h``
 const sources = await handbookSources(env, actor, { manage: true })
 const groups = new Map<string, HandbookSource[]>()
 for (const source of sources) groups.set(source.handbookId, [...(groups.get(source.handbookId) ?? []), source])
 return h`<section class="card"><h2>General handbook sources</h2>
  <details><summary>Create handbook source</summary><p>Draft general policy clauses here. Only current HR source administrators can approve publication after reviewing the exact version. Source titles and text confer no access rights.</p>${draftForm()}</details>
  ${[...groups.values()].map(versions => {
   const latest = versions[0], withdrawn = latest.withdrawnAt !== null
   return h`<details><summary>${latest.title} · ${withdrawn ? 'Withdrawn' : `Version ${latest.version}`}</summary>
    ${withdrawn ? h`<p>${tag('withdrawn')} Ordinary reading and assistant inclusion have ended. Retained history is available only to authorized source managers.</p>` : ''}
    ${versions.map((source, index) => versionDetails(source, actor, index === 0))}
    ${!withdrawn ? h`<details><summary>Revise handbook</summary><p>Creating a draft preserves the current publication. Approving a newer version removes the earlier assistant inclusion; HR must include the newly approved version separately.</p>${draftForm(latest)}</details>
    <details><summary>Withdraw handbook</summary><p>Withdrawal stops ordinary reading and assistant use for this entire handbook. Approved history stays immutable. To publish a replacement later, create a new handbook.</p>${form('ai.handbook.withdraw', '/app/settings', [hidden('handbook', latest.handbookId), hidden('revision', latest.revision)], 'Withdraw handbook source')}</details>` : ''}
   </details>`
  })}
 </section>`
}
