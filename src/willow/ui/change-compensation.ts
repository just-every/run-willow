import type { CompensationRecordPlan } from '../compensation/records'
import type { DefinitionPlan } from '../compensation/definitions'
import type { PayPlan } from '../change-requests/requests'
import { area, field, form, h, hidden, select } from './html'

type Proposal = { kind: 'record'; values: CompensationRecordPlan } | { kind: 'definition'; values: DefinitionPlan } | { kind: 'pay'; values: { pay: PayPlan; effectiveFrom: string } }
export function changeCompensationForm(request: { id: string; state: string; reason: string; person: { id: string }; editCompensation: Proposal },locations:{value:string;label:string}[]) {
 const proposal = request.editCompensation
 const common = [hidden('request', request.id), hidden('state', request.state), hidden('person', request.person.id), area('Reason', 'reason', request.reason)]
 if (proposal.kind === 'pay') {
  const pay = proposal.values.pay
  return form('change.edit', `/app/changes/${request.id}`, [
   ...common, field('Effective from', 'effectiveFrom', { type: 'date', value: proposal.values.effectiveFrom }),
   ...(pay.mode === 'percent' ? [field('Pay increase percent', 'payIncreasePercent', { value: pay.percent })]
    : [select('Pay basis', 'payBasis', [{ value: 'salary', label: 'Salary per year' }, { value: 'hourly', label: 'Hourly rate' }, { value: 'unknown', label: 'Not known yet' }], pay.basis), field('Pay amount', 'payAmount', { value: pay.amount })]),
  ], 'Resubmit compensation request', { layout: 'columns' })
 }
 if (proposal.kind === 'record') {
  const award = proposal.values
  return form('compensation.record.resubmit', `/app/changes/${request.id}`, [
   ...common, hidden('kind', award.kind), ...(award.record ? [hidden('record', award.record), hidden('revision', award.revision)] : []),
   field('Effective date', 'effectiveDate', { type: 'date', value: award.effectiveDate }),
   ...(award.kind === 'bonus' ? [field('Bonus amount', 'amount', { value: award.amount }), field('Currency', 'currency', { value: award.currency })]
    : [field('Equity units', 'units', { value: award.units }), field('Security or share class', 'security', { value: award.security })]),
   area('Award note', 'note', award.note, false),
  ], 'Resubmit compensation request', { layout: 'columns' })
 }
 const definition = proposal.values
 return form('compensation.definition.resubmit', `/app/changes/${request.id}`, [
  ...common, hidden('definitionKind', definition.kind), field('Effective date', 'effectiveFrom', { type: 'date', value: definition.values.effectiveFrom }),
  definition.kind === 'bands' ? h`${field('Job title', 'jobTitle', { value: definition.values.jobTitle })}${field('Job level', 'level', { value: definition.values.level })}${select('Location', 'location',locations,definition.values.location,{required:false,blank:'All locations'})}${select('Pay basis', 'basis', [{ value: 'salary', label: 'Annual salary' }, { value: 'hourly', label: 'Hourly rate' }], definition.values.basis)}${field('Minimum USD', 'minimum', { value: definition.values.minimum })}${field('Maximum USD', 'maximum', { value: definition.values.maximum })}`
   : h`${field('Cycle name', 'name', { value: definition.values.name })}${select('Kind', 'kind', ['merit', 'promotion', 'bonus'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })), definition.values.kind)}${field('Budget in USD', 'budget', { value: definition.values.budget })}`,
 ], 'Resubmit compensation request', { layout: 'columns' })
}
