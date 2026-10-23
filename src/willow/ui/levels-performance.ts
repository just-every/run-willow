import { PERFORMANCE_FIELDS, PERFORMANCE_LABELS, type PerformanceRules } from '../levels/performance'
import { h, select, table } from './html'
export function performanceLevelInputs(rules?: PerformanceRules) {
 return h`<h4>Performance reads</h4><p>Grant released reviews and goals separately. Other-person reads follow this level's scope; a named succession withholding still applies. This adds no raw feedback, HR notes, anonymous results, work ownership or editing rights. Existing authored inputs and delivered releases retain their native boundaries.</p>${(['self','others'] as const).map(relation=>PERFORMANCE_FIELDS.map(field=>select(`Performance ${relation==='self'?'about themselves':'about others'}: ${PERFORMANCE_LABELS[field]}`,`performanceMode.${relation}.${field}`,[{value:'none',label:'No additional access'},{value:'view',label:'View'}],rules?.[relation][field]??'none')))}`
}
export function performanceRulesText(rules: PerformanceRules) {
 return (['self','others'] as const).map(relation=>`${relation==='self'?'About themselves':'About others'}: ${PERFORMANCE_FIELDS.filter(field=>rules?.[relation]?.[field]==='view').map(field=>PERFORMANCE_LABELS[field]+' View').join(', ')||'No additional access'}`).join('; ')
}
export function performanceLevelReview(review: Record<string,any>) {
 const describe=(rows:Record<string,any>[])=>rows.map(row=>`${row.name}: ${performanceRulesText(row.fields)}; others scope: ${row.scope.kind}`).join('; ')||'No additional access'
 return h`<h4>Performance rights in this review</h4>${review.plan.kind==='level'?h`<p>${performanceRulesText(review.plan.performanceFields)}</p>`:''}${table(['Member','Before','After'],review.impact.map((item:Record<string,any>)=>[item.name,describe(item.beforePerformance??[]),describe(item.afterPerformance??[])]))}`
}
