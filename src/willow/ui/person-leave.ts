import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { canAdjustLeave, canRequestLeave } from '../levels/leave'
import { readablePolicies } from '../leave'
import { formatDate, hours } from '../dates'
import { accrualCalculations } from './accrual-calculations'
import { area, field, form, h, hidden, select, table, tag } from './html'
import { sentence } from './labels'

export async function personLeaveSection(env:Bindings,actor:Actor,id:string,view:Record<string,any>,live:Record<string,any>|undefined,availablePolicies:Record<string,any>[],dated:boolean) {
 const manage=!dated&&can(actor,'leave.manage'),policies=availablePolicies.filter(policy=>policy.versions.some((version:any)=>version.status==='approved'))
 const assigned=await readablePolicies(env,actor,id)
 return h`<section class="card facet-leave"><h2>Leave</h2>${view.leave.accounts.map((account:any)=>h`<h3>${account.policy?`${account.policy.name} · policy v${account.policy.version}`:'Leave account'}</h3>
${account.balanceMinutes!==undefined?h`<p>Balance: <strong>${hours(account.balanceMinutes)} hours</strong> · opening ${hours(account.openingMinutes)} h at ${formatDate(account.cutoverDate)} ${tag(account.openingStatus==='approved'?'signed off':'awaiting sign-off')} · accrued through ${formatDate(account.accruedThrough)}</p>`:h`<p>Balance: Withheld</p>`}
${manage&&account.openingStatus==='proposed'?form('account.approve',`/app/people/${id}`,[hidden('account',account.id)],'Sign off opening balance'):''}
${manage&&account.openingStatus==='approved'?h`<details><summary>Post accrual</summary>${form('leave.accrue',`/app/people/${id}`,[hidden('account',account.id),field('Accrue through','through',{type:'date',value:actor.today})],'Post accrual',{secondary:true})}</details>`:''}
${account.calculations?accrualCalculations(account.calculations,id):''}
${!dated&&canAdjustLeave(actor,id)&&account.openingStatus==='approved'?h`<details><summary>Propose balance override</summary><p>The owner approves every override. Keep medical information in protected cases.</p>${form('leave.adjust','/app/leave',[hidden('account',account.id),field('Adjustment (hours, signed)','hours'),field('Effective date','effectiveDate',{type:'date',value:actor.today}),field('Reason','note')],actor.owner?'Approve and post override':'Request owner approval',{secondary:true})}</details>`:''}
${account.ledger?h`<details id="ledger-${account.id}"><summary>Ledger (${account.ledger.length} entries)</summary>${table(['Date','Entry','Hours','Note'],account.ledger.map((entry:any)=>[formatDate(entry.effectiveDate),sentence(String(entry.kind).replace(/_/g,' ')),hours(entry.minutes),entry.note]))}</details>`:''}
${!dated&&canRequestLeave(actor,id)&&account.openingStatus==='approved'?h`<details><summary>${actor.personId===id?'Request leave':'Request leave on behalf'}</summary>${form('leave.request','/app/leave/{id}',[hidden('account',account.id),field('First day','startDate',{type:'date'}),field('Last day','endDate',{type:'date'}),area('Reason (confidential)','reason','',false)],'Submit leave request')}</details>`:''}`)}
${view.leave.requests.length?h`<h3>Requests</h3>${table(['Dates','Policy','Hours','Status',...(view.leave.requests[0].reason!==undefined?['Reason (confidential)']:[])],view.leave.requests.map((request:any)=>[h`<a href="/app/leave/${request.id}">${formatDate(request.startDate)} – ${formatDate(request.endDate)}</a>`,request.policy??'Withheld',request.hours,tag(request.status),...(request.reason!==undefined?[request.reason??'—']:[])]))}`:''}
${view.leave.calendar?.length?h`<h3>Absence calendar</h3>${table(['Person','Dates','Status'],view.leave.calendar.map((entry:any)=>[entry.name,`${formatDate(entry.startDate)} – ${formatDate(entry.endDate)}`,tag(entry.status)]))}`:''}
${assigned.length?h`<details><summary>Assigned leave policies</summary>${assigned.map(policy=>h`<h3>${policy.name}</h3>${policy.versions.map(version=>h`<p>Version ${version.version}: ${version.summary}</p>`)}`)}</details>`:''}
${manage&&live&&policies.length?h`<details><summary>Open a leave account</summary>${form('account.open',`/app/people/${id}`,[hidden('period',live.id),select('Policy','policy',policies.map(policy=>({value:policy.id,label:policy.name}))),field('Cutover date','cutoverDate',{type:'date',value:actor.today}),field('Opening balance (hours)','openingHours',{value:'0'}),area('Where the opening balance comes from','note')],'Propose opening balance',{secondary:true})}</details>`:''}</section>`
}
