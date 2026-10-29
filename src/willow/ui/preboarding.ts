import { msg } from '../locale/runtime'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { packets } from '../preboarding'
import { applicantRecordsList } from '../eeo-applicants'
import { field, form, h, hidden, page, table } from './html'

export async function preboardingPage(env: Bindings,actor: Actor,url: URL) {
 const rows=await packets(env,actor)
 return page(msg('Preboarding'),actor,h`<h1>Preboarding</h1><p>Send a private invitation for the voluntary self-identification step. This invitation grants no employee or hiring access. Answering and declining both complete the step.</p>
 <section class="card"><h2>Send an invitation</h2>${form('preboarding.send','/app/preboarding',[field('Hire name','name'),field('Personal email','email',{type:'email'}),field('Expires at start of date (employer time)','expiresOn',{type:'date',required:false,hint:'Leave blank for 14 days. Choose no more than 30 days ahead.'})],'Send private invitation')}</section>
 <section class="card"><h2>Packets</h2>${rows.length ? table(['Hire','Invitation','Self-identification','Delivery','Actions'],rows.map(row=>[row.name,row.status,row.step,row.delivery.status,h`${actor.permissions.has('eeo.individual') ? h`<a href="/app/eeo/preboarding/${row.id}">EEO record</a>` : ''} ${row.status==='active' ? h`<a href="/app/people?preboarding=${row.id}">Start employment</a>${form('preboarding.withdraw','/app/preboarding',[hidden('packet',row.id)],'Withdraw invitation',{secondary:true})}` : ''}`])) : h`<p>No packets have been sent.</p>`}</section>`,{current:'/app/preboarding',url})
}
export async function applicantRecordsPage(env: Bindings,actor: Actor,url: URL) {
 const rows=await applicantRecordsList(env,actor)
 return page(msg('Closed application EEO records'),actor,h`<p class="back"><a href="/app/eeo/person">← EEO compliance</a></p><h1>Closed application EEO records</h1><p>Only closed applications outside your current hiring teams appear. Reads of individual answers are audited.</p><section class="card">${rows.length ? table(['Applicant','Opening','Outcome','EEO record'],rows.map(row=>[row.name,row.opening,row.outcome,h`<a href="/app/eeo/applicants/${row.id}">Open EEO record</a>`])) : h`<p>No eligible closed application records.</p>`}</section>`,{current:'/app/eeo/person',url})
}
