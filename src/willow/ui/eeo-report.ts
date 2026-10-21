// EEO-002 pages: HR's mappings, EEO compliance's snapshot runs with reconciliation, flags and drill-down,
// and the per-table suppressed aggregate view for `eeo.read` plus `reports.read`.
import type { Actor } from '../actor'
import { formatDate } from '../dates'
import { JOB_CATEGORIES } from '../eeo/categories'
import { mappingsView, runAggregate, runPeople, eeoRunReport, runs } from '../eeo'
import { field, form, h, page, select, table, tag } from './html'

type View<T extends (...args: any) => any> = Awaited<ReturnType<T>>
const RUNS = '/app/eeo/runs'
const FLAGS: Record<string, string> = {
  unmapped_title: 'Job title has no category', missing_establishment: 'No work location', establishment_incomplete: 'Establishment address or NAICS code missing', missing_self_id: 'No self-identification',
  declined_race: 'Declined ethnicity and race', declined_sex: 'Declined sex', missing_race: 'No ethnicity and race answer', missing_sex: 'No sex answer', no_category_in_rule_race: 'Ethnicity and race has no category in the rule version',
  no_category_in_rule_sex: 'Sex has no category in the rule version', headquarters_missing: 'No headquarters establishment', multiple_headquarters: 'More than one headquarters establishment', empty_roster: 'No one on payroll in this period',
}
const flagText = (flag: string) => FLAGS[flag] ?? flag

export function eeoMappingsPage(actor: Actor, data: View<typeof mappingsView>, url?: URL) {
  const editable = actor.permissions.has('people.manage') || actor.owner
  const titleForm = editable ? form('eeo.title', '/app/eeo/mappings', [field('Job title', 'title'), select('EEO-1 job category', 'category', JOB_CATEGORIES.map(c => ({ value: c.value, label: c.label }))), field('Effective from', 'effectiveFrom', { type: 'date', required: false })], 'Map title') : ''
  const sites = editable && data.establishments.length ? form('eeo.establishment', '/app/eeo/mappings', [select('Location', 'location', data.establishments.map(e => ({ value: e.location.id, label: e.location.name }))), field('Establishment address', 'address'), field('NAICS code (six digits)', 'naics'),
    h`<label class="check"><input type="checkbox" name="headquarters" value="yes"> Headquarters</label>`, field('Effective from', 'effectiveFrom', { type: 'date', required: false })], 'Save establishment') : ''
  return page('EEO-1 mappings', actor, h`<h1>EEO-1 mappings</h1><p>Each job title maps to one of the ten EEO-1 categories and each location to an establishment, effective-dated. Mappings hold no EEO values.</p>
<section class="card"><h2>Job titles</h2>${data.titles.length ? table(['Title', 'Category', 'Since'], data.titles.map(t => [t.title, t.category ? t.label : tag('unmapped'), t.effectiveFrom ? formatDate(t.effectiveFrom) : '—'])) : h`<p>No job titles yet.</p>`}${titleForm}</section>
<section class="card"><h2>Establishments</h2>${table(['Location', 'Address', 'NAICS', 'Headquarters'], data.establishments.map(e => [e.location.name, e.address ?? tag('missing'), e.naics ?? tag('missing'), e.headquarters ? 'Yes' : 'No']))}${sites}</section>`, { current: '/app/eeo/mappings', url })
}

export function eeoRunsPage(actor: Actor, list: View<typeof runs>, url?: URL) {
  const create = actor.permissions.has('eeo.individual') ? form('eeo.run', RUNS, [field('Snapshot from', 'from', { type: 'date' }), field('Snapshot to', 'to', { type: 'date' })], 'Run snapshot') : ''
  return page('EEO-1 snapshot', actor, h`<h1>EEO-1 snapshot</h1><p>A snapshot is one pay period in the fourth quarter (October 1 to December 31) of a year. A run freezes its roster, mappings and filing values; a later change needs a new run.</p>
<section class="card"><h2>Runs</h2>${list.length ? table(['Snapshot', 'Pay period', 'Rule version', ''], list.map(run => [`${formatDate(run.from)} to ${formatDate(run.to)}`, run.payPeriod, run.ruleVersion, actor.permissions.has('eeo.individual') ? h`<a href="${RUNS}/${run.id}">Open</a>` : h`<a href="${RUNS}/${run.id}/aggregate">Aggregate</a>`])) : h`<p>No runs yet.</p>`}${create}</section>`, { current: RUNS, url })
}

export function eeoRunPage(actor: Actor, run: View<typeof eeoRunReport>, url?: URL) {
  return page('EEO-1 run', actor, h`<p class="back"><a href="${RUNS}">← EEO-1 snapshot</a></p><h1>EEO-1 snapshot ${formatDate(run.from)} to ${formatDate(run.to)}</h1>
<p>${run.notice}</p><p>Pay period: ${run.payPeriod}. Rule version ${run.ruleVersion}. Each read is audited.</p>
<section class="card"><h2>Reconciliation</h2><p>${run.roster} people on the frozen roster; ${run.reconciles ? 'every count below reconciles to it' : 'the counts do not reconcile'}. ${run.noFilingValue} have no filing value for at least one question.</p>
${table(['Establishment', 'People'], run.establishments.map(e => [h`<a href="${RUNS}/${run.id}/people?establishment=${e.id}">${e.name}</a>`, e.count]))}</section>
<section class="card"><h2>Pre-filing check</h2>${run.flags.length || run.runFlags.length ? table(['Flag', 'People'], [...run.runFlags.map(flag => [flagText(flag), '—']), ...run.flags.map(f => [h`<a href="${RUNS}/${run.id}/people?flag=${f.flag}">${flagText(f.flag)}</a>`, f.count])]) : h`<p>No flags.</p>`}</section>
<section class="card"><h2>Counts by establishment, job category, sex and race/ethnicity</h2>${table(['Establishment', 'Job category', 'Sex', 'Race / ethnicity', 'People'], run.cells.map(c => [c.establishmentName, c.categoryLabel, c.sexLabel, c.raceLabel,
    h`<a href="${RUNS}/${run.id}/people?establishment=${c.establishment}&category=${c.category}&sex=${c.sex}&race=${c.race}">${c.count}</a>`]))}</section>
<section class="card"><h2>Outside this period</h2>${run.excluded.length ? table(['Person', 'Reason'], run.excluded.map(e => [e.person.name, 'Not on payroll in the snapshot period'])) : h`<p>No one is outside the period.</p>`}</section>`, { current: RUNS, url })
}

export function eeoRunPeoplePage(actor: Actor, data: View<typeof runPeople>, url?: URL) {
  return page('EEO-1 drill-down', actor, h`<p class="back"><a href="${RUNS}/${data.run}">← Run</a></p><h1>People behind this count</h1><p>Each read is audited.</p>
<section class="card">${table(['Person', 'Title', 'Category', 'Ethnicity and race', 'Sex', 'Flags'], data.people.map(p => [p.name, p.title, p.category ?? 'Unmapped', p.race ? `${p.race.value} (${p.race.source})` : 'No filing value', p.sex ? `${p.sex.value} (${p.sex.source})` : 'No filing value', p.flags.map(flagText).join('; ') || '—']))}</section>`, { current: RUNS, url })
}

export function eeoAggregatePage(actor: Actor, data: View<typeof runAggregate>, url?: URL) {
  return page('EEO-1 aggregate', actor, h`<p class="back"><a href="${RUNS}">← EEO-1 snapshot</a></p><h1>EEO-1 aggregate ${formatDate(data.from)} to ${formatDate(data.to)}</h1><p>${data.notice}</p><p>${data.calculation}</p>
${data.tables.map(t => h`<section class="card"><h2>${t.name}</h2>${t.suppressed ? h`<p role="status">Small groups are present. Every cell and the total of this table are withheld.</p>` : h`<p>Total: <strong>${t.total}</strong></p>${table(['Job category', 'Sex', 'Race / ethnicity', 'People'], t.cells.map(c => [c.category, c.sex, c.race, c.count]))}`}</section>`)}`, { current: RUNS, url })
}
