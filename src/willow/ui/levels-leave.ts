import { LEAVE_FIELDS, LEAVE_LABELS, type LeaveRules } from '../levels/leave'
import { h, select, table } from './html'

export function leaveLevelInputs(rules?: LeaveRules) {
 return h`<h4>Time off and absence</h4><p>Grant balances, ledger, requests, calendars and policies separately. Other-person rights follow this level's scope. Existing self-service and manager rights remain. Requests follow native leave approval; balance adjustments require owner approval. These rights grant no confidential reasons or policy settings.</p>${(['self', 'others'] as const).map(relation => LEAVE_FIELDS.map(field => select(`Leave ${relation === 'self' ? 'about themselves' : 'about others'}: ${LEAVE_LABELS[field]}`, `leaveMode.${relation}.${field}`, [{ value: 'none', label: 'No additional access' }, { value: 'view', label: 'View' }, ...(relation === 'others' || field === 'requests' || field === 'calendar' ? [{ value: 'approval', label: 'Edit with approval' }, { value: 'edit', label: 'Edit' }] : [])], rules?.[relation][field] ?? 'none')))}`
}

export function leaveRulesText(rules: LeaveRules) {
 return (['self', 'others'] as const).map(relation => `${relation === 'self' ? 'About themselves' : 'About others'}: ${LEAVE_FIELDS.filter(field => rules?.[relation]?.[field] && rules[relation][field] !== 'none').map(field => `${LEAVE_LABELS[field]} ${rules[relation][field]}`).join(', ') || 'No additional access'}`).join('; ')
}

export function leaveLevelReview(review: Record<string, any>) {
 const describe = (rows: Record<string, any>[]) => rows.map(row => `${row.name}: ${leaveRulesText(row.fields)}; others scope: ${row.scope.kind}${row.scope.kind === 'group' ? ` (${Object.entries(row.scope.dimensions).map(([dimension, values]) => `${dimension}: ${(values as string[]).join(', ')}`).join('; ')})` : ''}`).join('; ') || 'No additional access'
 return h`<h4>Leave rights in this review</h4>${review.plan.kind === 'level' ? h`<p>${leaveRulesText(review.plan.leaveFields)}</p>` : ''}${table(['Member', 'Before', 'After'], review.impact.map((item: Record<string, any>) => [item.name, describe(item.beforeLeave ?? []), describe(item.afterLeave ?? [])]))}`
}
