import { msg } from '../locale/runtime'
import type { Actor } from '../actor'
import { CC305, DISABILITY, DISCLOSURES, HISPANIC, RACES, VETERAN_CHOICES, VETERAN_CLASSES, VETERAN_INVITATION } from '../eeo/forms'
import { RACE_ETHNICITY, SEX, type DiversityCell, type DiversityReport, type EeoPerson, type EeoRevision, type EeoSelf } from '../eeo'
import { FILING_RACE_ETHNICITY, FILING_SEX } from '../eeo/rule'
import { excludesText } from '../retention/excluded'
import { checks, field, form, h, hidden, page, select, table } from './html'

const SELF_PATH = '/app/eeo/self'
const REPORT_PATH = '/app/eeo/report'
const PERSON_PATH = '/app/eeo/person'

function answerLabel(value: string | null, choices: readonly { value: string; label: string }[]) {
  return msg(choices.find(choice => choice.value === value)?.label ?? 'Not recorded')
}
const raceNames = (races: string[] | null) => races?.length ? races.map(race => answerLabel(race, RACES)).join(', ') : 'Not recorded'
const instant = (value: number) => new Date(value).toISOString()

export function eeoHistoryRow(version: EeoRevision) {
  return [version.sequence, instant(version.recordedAt), h`Form version ${version.formVersion} · ${msg(version.source === 'preboarding/self-identified' ? 'preboarding self-identification' : version.source === 'applicant self-identification' ? 'applicant self-identification' : 'employee self-identification')}`,
    version.formVersion === 2 ? `${answerLabel(version.hispanic, HISPANIC)}; ${raceNames(version.races)}` : answerLabel(version.raceEthnicity, RACE_ETHNICITY),
    answerLabel(version.sex, SEX), version.veteran ? answerLabel(version.veteran, VETERAN_CHOICES) + (version.veteranClasses?.length ? ` (${version.veteranClasses.map(value => answerLabel(value, VETERAN_CLASSES)).join(', ')})` : '') : '—', version.disability ? answerLabel(version.disability, DISABILITY) : '—']
}
export const HISTORY_HEADERS = ['Version', 'Recorded', 'Form', 'Ethnicity and race', 'Sex', 'Protected veteran', 'Disability']

export function contractorForms(current: EeoRevision | null, phase: 'pre-offer' | 'post-offer' = 'post-offer') {
  const veteran = VETERAN_INVITATION
  return h`<section class="card"><h2>${msg(phase === 'pre-offer' ? 'Pre-offer protected veteran invitation to self-identify' : veteran.title)}</h2><p class="muted">${veteran.source.url} (read ${veteran.source.read})</p>
${veteran.intro.map(text => h`<p>${msg(text)}</p>`)}<ul>${veteran.definitions.map(text => h`<li>${msg(text)}</li>`)}</ul>
${phase === 'post-offer' ? h`<p>${msg(veteran.userra)}</p>` : ''}
<p>${msg(phase === 'pre-offer' ? 'If you believe you belong to any of these protected veteran categories, please identify yourself below. You do not need to identify a particular classification before an offer.' : veteran.ask)}</p>
${select('Protected veteran status', 'veteran', [...VETERAN_CHOICES].map(o=>({...o,label:msg(o.label)})), current?.veteran ?? '', { required: false, blank: 'Not recorded' })}
${phase === 'post-offer' ? checks(veteran.classesHeading, 'veteranClasses', [...VETERAN_CLASSES].map(o=>({...o,label:msg(o.label)})), current?.veteranClasses ?? []) : ''}
${phase === 'post-offer' ? h`<p>${msg(veteran.accommodation)}</p>` : ''}<p>${msg(veteran.voluntary)}</p>${phase === 'post-offer' ? h`<p>${msg(veteran.confidential)}</p>` : h`<p>Your answers are confidential and never shown to the hiring team.</p>`}</section>
<section class="card"><h2>${msg(CC305.title)}</h2><p class="muted">${msg(CC305.formNumber)} · ${msg(CC305.omb)} · ${msg(CC305.expires)}</p>${CC305.why.map(text => h`<p>${msg(text)}</p>`)}
<h3>${msg(CC305.howTitle)}</h3><p>${msg(CC305.how)}</p><ul>${CC305.examples.map(text => h`<li>${msg(text)}</li>`)}</ul><p>${msg(CC305.choose)}</p>
${select('Disability', 'disability', [...DISABILITY].map(o=>({...o,label:msg(o.label)})), current?.disability ?? '', { required: false, blank: 'Not recorded' })}<p class="muted">${msg(CC305.burden)}</p></section>`
}

export function eeoFields(current: EeoRevision | null, contractor: boolean, phase: 'pre-offer' | 'post-offer' = 'post-offer') {
  return [
    select('Are you Hispanic or Latino?', 'hispanic', [...HISPANIC].map(o=>({...o,label:msg(o.label)})), current?.formVersion === 2 ? current.hispanic ?? '' : '', { required: false, blank: 'Not recorded' }),
    checks('Race (choose one or more)', 'races', [...RACES].map(o=>({...o,label:msg(o.label)})), current?.formVersion === 2 ? current.races ?? [] : []),
    select('Sex', 'sex', [...SEX].map(o=>({...o,label:msg(o.label)})), current?.sex ?? '', { required: false, blank: 'Not recorded' }),
    ...(contractor ? [contractorForms(current, phase)] : []),
  ]
}

/** Render only the explicit self-ID projection, never a general person profile. */
export function eeoSelfPage(actor: Actor, data: EeoSelf, url?: URL): Response {
  const current = data.current
  const fields = eeoFields(current, data.form.contractor)
  return page(msg('Voluntary self-identification'), actor, h`<p class="back"><a href="/app">← Home</a></p>
<h1>Voluntary self-identification</h1>
<ul>${DISCLOSURES.map(text => h`<li>${msg(text)}</li>`)}</ul>
<section class="card"><h2>Your answers</h2>
<p>Each save records a new version. Clearing an answer makes it unrecorded in the new version; your earlier submissions remain in your history. Only you can submit your answers.</p>
${form('eeo.self.write', SELF_PATH, fields, 'Save my answers')}
</section>
<section class="card"><h2>Your submission history</h2>${data.history.length ? table(HISTORY_HEADERS, data.history.map(eeoHistoryRow)) : h`<p>You have not submitted any answers.</p>`}</section>
${data.recorded.length ? h`<section class="card"><h2>Recorded from employment records</h2><p>These are not your answers. They are labeled with their source and used only for EEO-1 reporting.</p>${table(['Recorded', 'Question', 'Category', 'Source'], data.recorded.map(row => [row.recordedOn, row.dimension === 'sex' ? 'Sex' : 'Ethnicity and race', answerLabel(row.category, [...RACE_ETHNICITY, ...SEX]), row.label]))}</section>` : ''}`, { current: SELF_PATH, url })
}

export function eeoPeoplePage(actor: Actor, people: { id: string; name: string }[], url?: URL): Response {
  return page(msg('EEO compliance'), actor, h`<h1>EEO compliance</h1><p>Open one person's EEO record at a time. Every read is audited with who read whose record and when, never the values.</p>
<p><a href="/app/eeo/applicants">Closed application EEO records</a></p><section class="card"><h2>People</h2><ul>${people.map(person => h`<li><a href="${PERSON_PATH}/${person.id}">${person.name}</a></li>`)}</ul></section>`, { current: PERSON_PATH, url })
}

export function eeoPersonPage(actor: Actor, data: EeoPerson, url?: URL): Response {
  const record = (dimension: 'race_ethnicity' | 'sex', categories: readonly string[], choices: readonly { value: string; label: string }[], allowed: boolean) => allowed ? form('eeo.record', `${PERSON_PATH}/${data.person.id}`, [hidden('person', data.person.id), hidden('dimension', dimension), hidden('ruleVersion', data.ruleVersion),
    select('Category from employment records', 'category', categories.map(value => ({ value, label: answerLabel(value, choices) }))), field('Employment record relied on', 'employmentRecord')], 'Record from employment records') : h`<p>A self-identified filing category exists, or none may be recorded.</p>`
  const filingRow = (name: string, value: EeoPerson['filing']['raceEthnicity']) => [name, value ? value.label : 'No filing category', value ? value.source : '—']
  return page(msg('EEO record'), actor, h`<p class="back"><a href="${PERSON_PATH}">← EEO compliance</a></p><h1>EEO record: ${data.person.name}</h1>
<p>This read is audited. Rule version ${data.ruleVersion}.</p>
<section class="card"><h2>Filing values and their source</h2>${table(['Question', 'Value', 'Source'], [filingRow('Ethnicity and race', data.filing.raceEthnicity), filingRow('Sex', data.filing.sex)])}</section>
<section class="card"><h2>Self-identified answers</h2>${data.history.length ? table(HISTORY_HEADERS, data.history.map(eeoHistoryRow)) : h`<p>No self-identified answers.</p>`}</section>
<section class="card"><h2>Recorded from employment records</h2>${data.recorded.length ? table(['Version', 'Question', 'Category', 'Record relied on', 'Recorded by', 'Date', 'Rule version', 'Source'], data.recorded.map(row => [row.sequence, row.dimension === 'sex' ? 'Sex' : 'Ethnicity and race', answerLabel(row.category, [...RACE_ETHNICITY, ...SEX]), row.employmentRecord, row.recordedBy ?? '—', row.recordedOn, row.ruleVersion, row.label])) : h`<p>Nothing recorded.</p>`}
<h3>Ethnicity and race</h3>${record('race_ethnicity', FILING_RACE_ETHNICITY, RACE_ETHNICITY, data.mayRecord.raceEthnicity)}<h3>Sex</h3>${record('sex', FILING_SEX, SEX, data.mayRecord.sex)}</section>`, { current: PERSON_PATH, url })
}

function categoryTable(cells: DiversityCell[]) {
  return table(['Category', 'People'], cells.map(cell => [cell.label, cell.suppressed ? 'Suppressed' : cell.count]))
}

/** HTML uses the same aggregate-only object as the JSON report door. */
export function diversityReportPage(actor: Actor, report: DiversityReport, url?: URL): Response {
  return page(msg('Diversity report'), actor, h`<p class="back"><a href="/app/reports">← Reports</a></p>
<h1>Diversity report</h1><p>Voluntary self-identification across the complete active employer population.</p>
<form method="get" action="${REPORT_PATH}">${field('As of', 'asOf', { type: 'date', value: report.asOf })}<button type="submit">View report</button></form>
<section class="card"><h2>Population and privacy</h2><p>${report.calculation}</p>
<p>Total people: <strong>${report.suppressed ? 'Suppressed' : report.total}</strong> ${excludesText(report.excludesErased)}</p>
${report.suppressed ? h`<p role="status">Small groups are present. Counts in both tables and the total are suppressed together to prevent reconstruction.</p>` : ''}
</section><section class="card"><h2>Race / ethnicity</h2>${categoryTable(report.raceEthnicity)}</section>
<section class="card"><h2>Sex</h2>${categoryTable(report.sex)}</section>`, { current: '/app/reports', url })
}
