import type { Bindings } from '../../auth.server'
import { can, employerZone, type Actor } from '../actor'
import { policyEscalations } from '../ai-policy-escalations'
import { form, h, hidden, table, tag, when } from './html'

const route = '/app/policy-assistant#hr-policy-follow-up'

export async function policyEscalationSection(env: Bindings, actor: Actor) {
 const [requests, zone] = await Promise.all([policyEscalations(env, actor), employerZone(env)])
 const handlesHr = can(actor, 'people.manage') || can(actor, 'leave.manage')
 const waiting = requests.some(request => request.requestedBy === actor.id && request.status === 'open')
 const status = (value: 'open' | 'resolved') => value === 'open'
  ? h`${tag('open')} · Awaiting HR contact`
  : h`${tag('completed')} · HR follow-up complete`
 return h`<section class="card" id="hr-policy-follow-up" aria-labelledby="hr-policy-follow-up-heading"><h2 id="hr-policy-follow-up-heading">HR policy follow-up</h2>
 <p>Ask HR to contact you about a policy question. Your question and answer are not included. HR will ask you for details.</p>
 ${waiting ? h`<p role="status">Your contact request is open. HR will follow up with you.</p>` : ''}
 ${form('policy.escalate', route, [], 'Ask HR to contact me')}
 <h3>${handlesHr ? 'HR contact requests' : 'Your contact requests'}</h3>
 ${handlesHr ? h`<p>Mark a follow-up complete after contacting the requester. Completing this request records contact only; HR must separately confirm any policy or employment decision.</p>` : ''}
 ${requests.length ? table(handlesHr ? ['Requester', 'Requested', 'Status', 'Follow-up'] : ['Requested', 'Status'], requests.map(request => {
  const cells = [when(request.createdAt, zone), status(request.status)]
  return handlesHr ? [request.requester.id ? h`<a href="/app/people/${request.requester.id}">${request.requester.name}</a>` : request.requester.name, ...cells, request.canResolve && request.status === 'open' ? form('policy.escalation.resolve', route, [hidden('escalation', request.id)], 'Mark HR follow-up complete', { secondary: true }) : '—'] : cells
 })) : h`<p class="muted">${handlesHr ? 'No HR contact requests.' : 'You have no HR contact requests.'}</p>`}
 </section>`
}
