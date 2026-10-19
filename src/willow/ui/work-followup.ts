// Follow-up controls use Willow's established cards, forms and responsive tables.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { workList } from '../work'
import { area, field, form, h, hidden, select, table, tag, when } from './html'

function scheduleHistory(detail: string) {
 const {before,after}=JSON.parse(detail)
 return h`<p>Deadline: ${before.dueDate} → ${after.dueDate}</p><p>Next action: ${before.nextAction} → ${after.nextAction}</p>`
}

export async function followupPanel(env: Bindings, actor: Actor) {
 const data=await workList(env,actor), manage=can(actor,'people.manage')
 return h`<section class="card"><h2>Work follow-up</h2><p>Accountable owners follow the next action. Assignment does not grant permission to approve or complete the underlying work.</p>
${data.policy?h`<p>Reminders: ${data.policy.offsets.join(', ')} day(s) from the deadline. Quiet hours: ${data.policy.quiet_start}:00–${data.policy.quiet_end}:00 in the employer’s time zone.</p>`:h`<p>Reminders are paused until HR approves a cadence and quiet hours.</p>`}
${manage?h`<details><summary>Approve reminder policy</summary>${form('work.policy','/app/tasks',[field('Cadence (days from deadline, comma separated)','offsets',{value:data.policy?.offsets.join(', ')??'0, 2, 5'}),field('Quiet hours start (0–23)','quietStart',{type:'number',value:data.policy?.quiet_start??20}),field('Quiet hours end (0–23; same hour means none)','quietEnd',{type:'number',value:data.policy?.quiet_end??8}),field('Default deadline (days after creation for undated approvals/receipts)','defaultDays',{type:'number',value:data.policy?.default_days??1})],'Approve cadence')}</details>`:''}
${actor.owner?form('work.run','/app/tasks',[],'Check due work now',{secondary:true}):''}
${data.items.length?table(['Due','Work and next action','Accountable owner','Progress'],data.items.map(item=>[h`${item.dueDate}${item.overdue?h` ${tag('overdue')}`:''}`,h`<a href="${item.path}">${item.title}</a>${item.person?h`<p>${item.person}</p>`:''}<p>${item.nextAction}</p>${manage?h`<details><summary>Schedule and cover</summary>${form('work.schedule','/app/tasks',[hidden('source',item.source),hidden('revision',item.revision),select('Accountable owner','owner',item.candidates.map(a=>({value:a.id,label:a.name})),item.owner??''),select('Substitute owner','substitute',item.candidates.filter(a=>a.id!==item.owner).map(a=>({value:a.id,label:a.name})),item.substitute??'',{required:false,blank:'No substitute'}),field('Deadline','dueDate',{type:'date',value:item.dueDate}),area('Next action','nextAction',item.nextAction)],'Save follow-up')}</details>`:''}`,h`${item.ownerName}<br>${tag(item.coverage)}${item.substituteName?h`<br>Cover: ${item.substituteName}`:''}`,h`${item.progress}<details><summary>History and delivery (${item.history.length+item.deliveries.length})</summary>${item.history.length?h`<ul>${item.history.map(event=>h`<li>${when(event.at,data.timezone)} · ${event.kind.replaceAll('.',' ')}${event.kind==='schedule.changed'?scheduleHistory(event.detail):''}</li>`)}</ul>`:''}${item.deliveries.length?h`<ul>${item.deliveries.map(d=>h`<li>Day ${d.step}: ${tag(d.status==='claimed'?'uncertain':d.status)}${d.failure?h` · ${d.failure.replaceAll('_',' ')}`:''}</li>`)}</ul>`:h`<p>No delivery attempted.</p>`}</details>`])):h`<p>No open follow-up in your scope.</p>`}</section>`
}
