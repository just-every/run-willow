import { JOB_FIELDS, JOB_LABELS, type JobRules } from '../levels/job'
import { h, select, table } from './html'

export function jobLevelInputs(rules?:JobRules) {
 return h`<h4>Job and employment fields</h4><p>Grant fields separately. No additional access preserves independent directory, self-service and manager reads. People cannot edit their own job. Approval-required changes follow the job approval chain.</p>${(['self','others'] as const).map(relation=>JOB_FIELDS.map(field=>select(`Job ${relation==='self'?'about themselves':'about others'}: ${JOB_LABELS[field]}`,`jobMode.${relation}.${field}`,[{value:'none',label:'No additional access'},{value:'view',label:'View'},...(relation==='others'?[{value:'approval',label:'Edit with approval chain'},{value:'edit',label:'Edit immediately'}]:[])],rules?.[relation][field]??'none')))}`
}
export function jobRulesText(rules:JobRules) {
 return (['self','others'] as const).map(relation=>`${relation==='self'?'About themselves':'About others'}: ${JOB_FIELDS.filter(field=>rules?.[relation][field]&&rules[relation][field]!=='none').map(field=>`${JOB_LABELS[field]} ${rules[relation][field]}`).join(', ')||'No additional access'}`).join('; ')
}
export function jobLevelReview(review:Record<string,any>) {
 return h`<h4>Job rights in this review</h4>${review.plan.kind==='level'?h`<p>${jobRulesText(review.plan.jobFields)}</p>`:''}${table(['Member','Before','After'],review.impact.map((item:Record<string,any>)=>[item.name,(item.beforeJob??[]).map((r:any)=>`${r.name}: ${jobRulesText(r.fields)}`).join('; ')||'No additional access',(item.afterJob??[]).map((r:any)=>`${r.name}: ${jobRulesText(r.fields)}`).join('; ')||'No additional access']))}`
}
