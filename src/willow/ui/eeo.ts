import type { Actor } from '../actor'
import { RACE_ETHNICITY, SEX, type DiversityCell, type DiversityReport, type EeoSelf } from '../eeo'
import { field, form, h, page, select, table } from './html'

const SELF_PATH = '/app/eeo/self'
const REPORT_PATH = '/app/eeo/report'

function answerLabel(value: string | null, choices: readonly { value: string; label: string }[]) {
  return choices.find(choice => choice.value === value)?.label ?? 'Not recorded'
}

/** Render only the explicit self-ID projection, never a general person profile. */
export function eeoSelfPage(actor: Actor, data: EeoSelf, url?: URL): Response {
  return page('Voluntary self-identification', actor, h`<p class="back"><a href="/app">← Home</a></p>
<h1>Voluntary self-identification</h1>
<p>Sharing this information is optional. You may leave either answer blank or choose “Prefer not to answer.” Only you can submit your answers. Authorized reporting members see aggregate counts with small groups protected.</p>
<section class="card"><h2>Your answers</h2>
<p>Each save records a new version. Clearing an answer makes it unrecorded in the new version; your earlier submissions remain in your history.</p>
${form('eeo.self.write', SELF_PATH, [
    select('Race / ethnicity (optional)', 'raceEthnicity', [...RACE_ETHNICITY], data.current?.raceEthnicity ?? '', { required: false, blank: 'Not recorded' }),
    select('Sex (optional)', 'sex', [...SEX], data.current?.sex ?? '', { required: false, blank: 'Not recorded' }),
  ], 'Save my answers')}
</section>
<section class="card"><h2>Your submission history</h2>${data.history.length ? table(['Version', 'Recorded', 'Race / ethnicity', 'Sex'], data.history.map(version => [
    version.sequence, new Date(version.recordedAt).toISOString(), answerLabel(version.raceEthnicity, RACE_ETHNICITY), answerLabel(version.sex, SEX),
  ])) : h`<p>You have not submitted any answers.</p>`}</section>`, { current: SELF_PATH, url })
}

function categoryTable(cells: DiversityCell[]) {
  return table(['Category', 'People'], cells.map(cell => [cell.label, cell.suppressed ? 'Suppressed' : cell.count]))
}

/** HTML uses the same aggregate-only object as the JSON report door. */
export function diversityReportPage(actor: Actor, report: DiversityReport, url?: URL): Response {
  return page('Diversity report', actor, h`<p class="back"><a href="/app/reports">← Reports</a></p>
<h1>Diversity report</h1><p>Voluntary self-identification across the complete active employer population.</p>
<form method="get" action="${REPORT_PATH}">${field('As of', 'asOf', { type: 'date', value: report.asOf })}<button type="submit">View report</button></form>
<section class="card"><h2>Population and privacy</h2><p>${report.calculation}</p>
<p>Total people: <strong>${report.suppressed ? 'Suppressed' : report.total}</strong></p>
${report.suppressed ? h`<p role="status">Small groups are present. Counts in both tables and the total are suppressed together to prevent reconstruction.</p>` : ''}
</section><section class="card"><h2>Race / ethnicity</h2>${categoryTable(report.raceEthnicity)}</section>
<section class="card"><h2>Sex</h2>${categoryTable(report.sex)}</section>`, { current: '/app/reports', url })
}
