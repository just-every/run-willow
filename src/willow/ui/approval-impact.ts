import type { ApprovalImpact } from '../levels/approval-impact'
import { h,table } from './html'
export function renderApprovalImpact(rows:ApprovalImpact[]) {
 const names=(members:{id:string;name:string}[])=>members.length?members.map(member=>member.name).join(', '):'No eligible approver'
 const owner=(row:ApprovalImpact,id:string|null)=>id?[...row.before,...row.after].find(member=>member.id===id)?.name??'Previous approver':'Unassigned'
 return h`<h4>Pending approvals affected</h4>${rows.length?table(['Pending item','Eligible before','Eligible after','Routing'],rows.map(row=>[h`<a href="${row.path}">${row.title}</a>`,names(row.before),names(row.after),h`<p>${owner(row,row.beforeOwner)} → ${owner(row,row.afterOwner)}</p><small>${row.orphaned?'No eligible approver':row.reassigned?'Reassigned on next request':'Owner retained'}</small>`])):h`<p>No pending item changes its eligible approvers or routing.</p>`}`
}
