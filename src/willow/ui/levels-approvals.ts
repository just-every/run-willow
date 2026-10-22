import type { Scope } from '../levels/scope'
import type { ApprovalChoice } from '../levels/approvals'
import { checks, h, hidden, table } from './html'

export function approvalLevelInputs(choices: ApprovalChoice[], selected: string[] = []) {
 return h`<h4>Approval decisions</h4><p>Select the proposals this level may decide within its scope. Decision authority does not grant the person's other fields, editing rights or settings. Nobody decides a request about themselves or their own submission.</p>${hidden('approvalSelection', 'yes')}${checks('Approvals this level may decide', 'approvals', choices.map(choice => ({ value: choice.key, label: choice.label })), selected)}`
}

export function approvalLevelReview(review: Record<string, any>, choices: ApprovalChoice[], scopeText:(scope:Scope)=>string) {
 const labels = new Map(choices.map(choice => [choice.key as string, choice.label]))
 const names = (keys: string[]) => keys.map(key => labels.get(key) ?? key).join('; ') || 'None'
 const grants = (items: Record<string, any>[]) => items.map(item => `${item.name}: ${names(item.approvals)}; ${scopeText(item.scope)}`).join('; ') || 'None'
 return h`<h4>Approval decisions in this review</h4>${review.plan.kind === 'level' ? h`<p>${names(review.plan.approvals ?? [])}</p>` : ''}${table(['Member', 'Added approvals', 'Removed approvals', 'Before', 'After'], review.impact.map((item: Record<string, any>) => [item.name, names(item.addedApprovals ?? []), names(item.removedApprovals ?? []), grants(item.beforeApprovalGrants ?? []), grants(item.afterApprovalGrants ?? [])]))}`
}
