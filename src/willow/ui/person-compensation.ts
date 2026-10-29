import { msg } from '../locale/runtime'
// Every displayed value comes from personView; current rights govern the native forms.
import type { Actor } from '../actor'
import { canEditCompensation, canRequestCompensation } from '../levels/compensation'
import { formatMoney, formatPay } from '../money'
import { formatDate } from '../dates'
import { area, field, form, h, hidden, select, table, tag, type Html } from './html'

type View = Record<string, any>
type Kind = 'bonus' | 'equity'
const bases = [{ value: 'salary', label: msg('Salary per year') }, { value: 'hourly', label: msg('Hourly rate') }, { value: 'unknown', label: msg('Not known yet') }]
const date = (value: string | undefined) => value === undefined ? 'Withheld' : formatDate(value)
const payText = (terms: View) => !Object.hasOwn(terms, 'pay') ? 'Withheld' : terms.pay ? formatPay(terms.pay.basis, terms.pay.amountCents, terms.pay.currency) : 'Not recorded'

function payChange(actor: Actor, person: string, view: View, historical=false): Html {
 const period = view.employment?.find((item: View) => item.id === view.selectedPeriod)
 if (!period || actor.personId === person) return h``
 const right=historical?'history':'pay'
 const edit = canEditCompensation(actor, person, right)
 if (!edit && !canRequestCompensation(actor, person, right)) return h``
 const current = period.terms.find((terms: View) => terms.inForce)?.pay
 return h`<details><summary>${historical?msg('Correct historical pay'):edit ? msg('Schedule a pay change') : msg('Request a pay change')}</summary>${historical?h`<p>Choose a date before the pay version currently in force. This right cannot change current pay.</p>`:''}
 ${edit ? h`<p>The change creates a dated pay version. Previous versions stay in the record.</p>` : h`<p>The current pay stays in force until the configured compensation approval chain approves this request.</p>`}
 ${form(edit ? 'compensation.pay' : 'change.request', edit ? `/app/people/${person}` : '/app/changes/{id}', [
  hidden('person', person), ...(edit ? [hidden('period', period.id), hidden('revision', period.revision)] : []),
  field('Effective from', 'effectiveFrom', { type: 'date', value: historical?'':actor.today }),
  ...((historical?view.compensationFields.history:view.compensationFields.pay) ? [select('Pay basis', 'payBasis', bases, current?.basis ?? 'salary'), field('Pay amount', 'payAmount', { required: false, value: current?.amountCents == null ? '' : (current.amountCents / 100).toFixed(2), hint: 'Amount in the employment currency. An unknown basis may leave the amount empty.' })]
   : [field('Pay increase percent', 'payIncreasePercent', { hint: 'The request can be reviewed without revealing the current amount.' })]),
  area('Reason', 'reason'),
 ], edit ? msg('Schedule pay change') : msg('Submit pay request'), { layout: 'columns' })}</details>`
}

function awardForm(actor: Actor, person: string, kind: Kind, record?: View): Html {
 if (actor.personId === person) return h``
 const edit = canEditCompensation(actor, person, kind)
 if (!edit && !canRequestCompensation(actor, person, kind)) return h``
 const correcting = !!record
 return h`<details><summary>${correcting ? `Correct ${kind} record from ${formatDate(record!.effectiveDate)}` : `Record ${kind}`}${edit ? '' : ' · approval required'}</summary>
 ${correcting ? h`<p>A correction appends a complete version and preserves this award’s earlier versions.</p>` : ''}
 ${form(edit ? 'compensation.record' : 'compensation.record.propose', edit ? `/app/people/${person}` : '/app/changes/{id}', [
  hidden('person', person), hidden('kind', kind), ...(record ? [hidden('record', record.id), hidden('revision', record.revision)] : []),
  field('Effective date', 'effectiveDate', { type: 'date', value: record?.effectiveDate ?? actor.today }),
  ...(kind === 'bonus' ? [field('Bonus amount', 'amount', { value: record ? (record.amountCents / 100).toFixed(2) : '' }), field('Currency', 'currency', { value: record?.currency ?? '', hint: 'Three-letter currency code, such as USD or AUD.' })]
   : [field('Equity units', 'units', { value: record?.units ?? '', hint: 'Exact units; up to six decimal places.' }), field('Security or share class', 'security', { value: record?.security ?? '' })]),
  area('Award note', 'note', record?.note ?? '', false), ...(!edit ? [area('Reason for approval', 'reason')] : []),
 ], edit ? `Save ${kind} ${correcting ? 'correction' : 'record'}` : `Request ${kind} ${correcting ? 'correction' : 'record'}`, { layout: 'columns' })}</details>`
}

function awards(actor: Actor, person: string, view: View, kind: Kind, dated: boolean): Html {
 const readable = view.compensationFields[kind]
 const records: View[] = view.compensationRecords[kind]
 const latest = records.filter(record => record.source === 'native' && !records.some(other => other.id === record.id && other.version > record.version))
 return h`<h3>${kind === 'bonus' ? msg('Bonus records') : msg('Equity records')}</h3>${!readable ? h`<p>Withheld</p>` : records.length ? table(
  ['Effective', ...(kind === 'bonus' ? ['Amount'] : ['Units', 'Security']), 'Version', 'Note', 'Source'],
  records.map(record => [date(record.effectiveDate), ...(kind === 'bonus' ? [formatMoney(record.amountCents, record.currency)] : [record.units, record.security]), record.version, record.note ?? '—', record.source === 'cycle' ? msg('Published compensation cycle') : msg('Native award')]),
 ) : h`<p class="muted">No ${kind} records.</p>`}
 ${!dated ? awardForm(actor, person, kind) : ''}${!dated && readable ? latest.map(record => awardForm(actor, person, kind, record)) : ''}`
}

export function personCompensationSection(actor: Actor, person: string, view: View, dated: boolean): Html {
 const fields = view.compensationFields
 const periods: View[] = view.employment ?? []
 const inForce = view.compensation.payRecords.find((terms:View)=>terms.inForce)
 const history:View[] = view.compensation.payRecords
 return h`<section class="card private facet-compensation"><h2>Compensation</h2>
 ${actor.personId === person ? h`<p>View only. Your own compensation cannot be changed here.</p>` : ''}
 <dl class="facts"><dt>Pay in force</dt><dd>${!fields.pay ? msg('Withheld') : inForce ? payText(inForce) : msg('No pay in force')}</dd></dl>
 ${!dated ? payChange(actor, person, view) : ''}${!dated&&(canEditCompensation(actor,person,'history')||canRequestCompensation(actor,person,'history'))?payChange(actor,person,view,true):''}
 <h3>Pay history</h3>${!fields.history ? h`<p>Withheld</p>` : history.length ? table(['Effective', 'Pay', 'Status'], history.map(terms => [date(terms.effectiveFrom), payText(terms), tag(terms.status === 'cancelled' ? 'cancelled' : terms.inForce ? 'in force' : 'past or scheduled')])) : h`<p class="muted">No pay history.</p>`}
 ${awards(actor, person, view, 'bonus', dated)}${awards(actor, person, view, 'equity', dated)}
 <h3>Compensation bands</h3>${!fields.bands ? h`<p>Withheld</p>` : view.compensation.bands.length ? table(['Role', 'Level', 'Effective', 'Basis', 'Minimum', 'Maximum'], view.compensation.bands.map((band: View) => [band.job_title, band.level, date(band.effective_from), band.basis, formatMoney(band.minimum_cents, 'USD'), formatMoney(band.maximum_cents, 'USD')])) : h`<p class="muted">No matching compensation bands.</p>`}
 <h3>Compensation cycles</h3>${!fields.cycles ? h`<p>Withheld</p>` : view.compensation.cycles.length ? table(['Cycle', 'Kind', 'Effective', 'Status', 'Proposed amount'], view.compensation.cycles.map((cycle: View) => [cycle.name, cycle.kind, date(cycle.effective_from), tag(cycle.status), Object.hasOwn(cycle, 'amount_cents') ? formatMoney(cycle.amount_cents, 'USD') : msg('Withheld')])) : h`<p class="muted">No compensation cycle participation.</p>`}
 </section>`
}
