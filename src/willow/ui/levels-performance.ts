import { PERFORMANCE_FIELDS, PERFORMANCE_LABELS, type PerformanceRules } from '../levels/performance'
import { h, select, table } from './html'
export function performanceLevelInputs(rules?: PerformanceRules) {
 return h`<h4>Performance rights</h4><p>Grant released reviews, goals and published engagement themes separately. Engagement View requires the entire fixed cohort within current reach and supplies only HR-published themes and plans. Other-person reads follow this level's scope; a named succession withholding still applies. Goal Edit allows native goal entry and check-ins; Edit with HR approval queues an exact request before anything changes. Only the named development owner or HR may complete a development action. These rights add no raw feedback, HR notes, anonymous comments, individual participation, raw survey results or review editing. Existing authored inputs and delivered releases retain their native boundaries.</p>${(['self','others'] as const).map(relation=>PERFORMANCE_FIELDS.map(field=>select(`Performance ${relation==='self'?'about themselves':'about others'}: ${PERFORMANCE_LABELS[field]}`,`performanceMode.${relation}.${field}`,[{value:'none',label:'No additional access'},{value:'view',label:'View'},...field==='goals'?[{value:'approval',label:'Edit with HR approval'},{value:'edit',label:'Edit'}]:[]],rules?.[relation][field]??'none')))}`
}
export function performanceRulesText(rules: PerformanceRules) {
 return (['self','others'] as const).map(relation=>`${relation==='self'?'About themselves':'About others'}: ${PERFORMANCE_FIELDS.filter(field=>rules?.[relation]?.[field]&&rules[relation][field]!=='none').map(field=>PERFORMANCE_LABELS[field]+' '+rules[relation][field]).join(', ')||'No additional access'}`).join('; ')
}
export function performanceLevelReview(review: Record<string,any>) {
 const describe=(rows:Record<string,any>[])=>rows.map(row=>`${row.name}: ${performanceRulesText(row.fields)}; others scope: ${row.scope.kind}`).join('; ')||'No additional access'
 return h`<h4>Performance rights in this review</h4>${review.plan.kind==='level'?h`<p>${performanceRulesText(review.plan.performanceFields)}</p>`:''}${table(['Member','Before','After'],review.impact.map((item:Record<string,any>)=>[item.name,describe(item.beforePerformance??[]),describe(item.afterPerformance??[])]))}`
}
