import { COMPENSATION_FIELDS, COMPENSATION_LABELS, type CompensationRules } from '../levels/compensation'
import { h, select, table } from './html'

export function compensationLevelInputs(rules?: CompensationRules) {
 return h`<h4>Compensation fields</h4><p>Compensation reads require an explicit grant, including about themselves. Pay history grants dated versions independently of pay in force. Award history also needs its bonus or equity right. Other-person rights follow this level's scope. People cannot edit their own compensation. Edit with approval starts the compensation approval chain; cycle approval remains a separate permission. Maintaining employer-wide bands and cycles requires everyone scope.</p>${(['self', 'others'] as const).map(relation => COMPENSATION_FIELDS.map(field => select(`Compensation ${relation === 'self' ? 'about themselves' : 'about others'}: ${COMPENSATION_LABELS[field]}`, `compensationMode.${relation}.${field}`, [{ value: 'none', label: 'No additional access' }, { value: 'view', label: 'View' }, ...(relation === 'others' ? [{ value: 'approval', label: 'Edit with approval chain' }, { value: 'edit', label: 'Edit' }] : [])], rules?.[relation][field] ?? 'none')))}`
}

export function compensationRulesText(rules: CompensationRules) {
 return (['self', 'others'] as const).map(relation => `${relation === 'self' ? 'About themselves' : 'About others'}: ${COMPENSATION_FIELDS.filter(field => rules?.[relation]?.[field] && rules[relation][field] !== 'none').map(field => `${COMPENSATION_LABELS[field]} ${rules[relation][field]}`).join(', ') || 'No additional access'}`).join('; ')
}

export function compensationLevelReview(review: Record<string, any>) {
 const describe = (rows: Record<string, any>[]) => rows.map(row => `${row.name}: ${compensationRulesText(row.fields)}; others scope: ${row.scope.kind}${row.scope.kind === 'group' ? ` (${Object.entries(row.scope.dimensions).map(([dimension, values]) => `${dimension}: ${(values as string[]).join(', ')}`).join('; ')})` : ''}`).join('; ') || 'No additional access'
 return h`<h4>Compensation rights in this review</h4>${review.plan.kind === 'level' ? h`<p>${compensationRulesText(review.plan.compensationFields)}</p>` : ''}${table(['Member', 'Before', 'After'], review.impact.map((item: Record<string, any>) => [item.name, describe(item.beforeCompensation ?? []), describe(item.afterCompensation ?? [])]))}`
}
