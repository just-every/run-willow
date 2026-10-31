import { msg } from '../locale/runtime'
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { formatDate, hours } from '../dates'
import { protectedCase, protectedCases } from '../protected-leave/records'
import { directory } from '../profile'
import { area, field, form, h, hidden, page, select, table } from './html'
const ROOT='/app/protected-leave'

export async function protectedListPage(env:Bindings,actor:Actor,url:URL) {
 const cases=await protectedCases(env,actor),people=await directory(env,actor)
 return page(msg('Protected leave'),actor,h`<p class="back"><a href="/app/leave">← Leave</a></p><h1>Protected leave</h1><p>Employer-reviewed cases and recorded absences. Recording a case does not establish a legal entitlement or approval.</p>
<section class="card"><h2>Your permitted cases</h2>${cases.length?table(['Person','Case','Dates'],cases.map(c=>[people.find(p=>p.id===c.person)?.name??'Person',h`<a href="${ROOT}/${c.id}">${'title'in c?c.title:msg('Absence dates')}</a>`,'title'in c?`${formatDate(c.startDate)} – ${formatDate(c.endDate)}`:c.absences.map(a=>`${formatDate(a.startDate)} – ${formatDate(a.endDate)}`).join('; ')])):h`<p>No cases you can open.</p>`}</section>
${can(actor,'leave.manage')?h`<section class="card"><h2>Record a reviewed case</h2><p>Only leave administrators and the subject see the case and supporting material. The current manager sees recorded absence dates only.</p>${form('protected.open',ROOT+'/{id}',[
 select('Person','person',people.map(p=>({value:p.id,label:p.name}))),field('Case title','title'),field('First eligible date','startDate',{type:'date',value:actor.today}),field('Last eligible date','endDate',{type:'date',value:actor.today}),field('Entitlement (hours)','entitlementHours'),area('Employer review and policy reference','reviewNote'),field('Medical certification (optional, up to 10 MB)','certification',{type:'file',required:false}),
 ],'Record reviewed case',{multipart:true})}</section>`:''}`,{current:'/app/leave',url})
}

export async function protectedDetailPage(env:Bindings,actor:Actor,id:string,url:URL) {
 const data=await protectedCase(env,actor,id),path=ROOT+'/'+id
 if(data.entitlementMinutes===undefined||data.remainingMinutes===undefined)return page(msg('Absence dates'),actor,h`<p class="back"><a href="${ROOT}">← Protected leave</a></p><h1>Absence dates</h1><section class="card">${table(['First day','Last day'],data.absences.map(a=>[formatDate(a.startDate),formatDate(a.endDate)]))}</section>`,{current:'/app/leave',url})
 const history=data.absences as {id:string;startDate:string;endDate:string;minutes:number;note:string;reverses:string|null;reversed:boolean}[]
 return page(data.title,actor,h`<p class="back"><a href="${ROOT}">← Protected leave</a></p><h1>${data.title}</h1><p>Employer reviewed; this is not a legal approval.</p>
<section class="card"><h2>Entitlement</h2><dl class="facts"><dt>Eligible dates</dt><dd>${formatDate(data.startDate)} – ${formatDate(data.endDate)}</dd><dt>Recorded entitlement</dt><dd>${hours(data.entitlementMinutes)} hours</dd><dt>Remaining</dt><dd>${hours(data.remainingMinutes)} hours</dd><dt>Employer review</dt><dd>${data.reviewNote}</dd></dl></section>
<section class="card"><h2>Restricted certifications</h2>${data.certifications?.length?h`<ul>${data.certifications.map(c=>h`<li><a href="${path}?certificate=${c.id}">Download ${c.filename}</a> · ${c.size} bytes</li>`)}</ul>`:h`<p>No supporting certification recorded.</p>`}
${data.canManage?form('protected.certify',path,[hidden('case',id),field('Medical certification (up to 10 MB)','certification',{type:'file'})],'Add certification',{multipart:true}):''}</section>
<section class="card"><h2>Intermittent absences</h2>${history.length?table(['Dates','Hours used','Note','Correction'],history.map(a=>[`${formatDate(a.startDate)} – ${formatDate(a.endDate)}`,hours(a.minutes),a.note,a.reverses?msg('Reversal'):a.reversed?msg('Reversed'):data.canManage?form('protected.reverse',path,[hidden('case',id),hidden('entry',a.id),field('Reason for reversal','note')],'Reverse entry',{secondary:true}):''])):h`<p>No absences recorded.</p>`}
${data.canManage?form('protected.absence',path,[hidden('case',id),field('First day','startDate',{type:'date',value:actor.today}),field('Last day','endDate',{type:'date',value:actor.today}),field('Hours used','hours'),area('Case note (restricted)','note')],'Record absence'):''}</section>`,{current:'/app/leave',url})
}
