// Scoped invitation pages reuse the employee form and Willow's existing page primitives.
import { DISCLOSURES } from '../eeo/forms'
import type { EeoRevision } from '../eeo/types'
import { eeoFields, eeoHistoryRow, HISTORY_HEADERS } from './eeo'
import { h, page, table } from './html'
import type { Actor } from '../actor'

type Invitation = { current: EeoRevision | null; history: EeoRevision[]; expiresAt: number; form: { contractor: boolean }; phase?: 'pre-offer'|'post-offer' }
export function invitationPage(kind: 'preboarding'|'applicant', data: Invitation, path: string, url: URL) {
 const applicant = kind === 'applicant'
 const disclosures = applicant ? DISCLOSURES.slice(0,2) : DISCLOSURES
 const response = page('Voluntary self-identification', null, h`<h1>Voluntary self-identification</h1>
 <p>${applicant ? 'This is a separate step for one submitted application. Answering does not affect selection. Your hiring team never sees your answers.' : 'This invitation opens only your own voluntary EEO answers. HR sees that this step is done whether you answer or decline.'}</p>
 <ul>${disclosures.map(text=>h`<li>${text}</li>`)}</ul>
 <p>Invitation expires ${new Date(data.expiresAt).toISOString()}. ${applicant ? `${data.phase === 'pre-offer' ? 'Pre-offer' : 'Post-offer'} invitation.` : 'When employment starts, your answers become your employee EEO record unchanged.'}</p>
 <section class="card"><h2>Your answers</h2><p>Choose “I do not wish to self-identify” to decline. Each save keeps a new version of your answers.</p>
 <form method="post" action="${path}">${eeoFields(data.current,data.form.contractor,data.phase ?? 'post-offer')}<button type="submit">Save my answers</button></form></section>
 <section class="card"><h2>Your submission history</h2>${data.history.length ? table(HISTORY_HEADERS,data.history.map(eeoHistoryRow)) : h`<p>You have not submitted answers.</p>`}</section>`, {url,showNav:false})
 response.headers.set('referrer-policy','strict-origin')
 return response
}
export function invitationRecordPage(actor: Actor, title: string, data: {history: EeoRevision[]}, url: URL) {
 return page(title,actor,h`<p class="back"><a href="/app/eeo/person">← EEO compliance</a></p><h1>${title}</h1><p>Individual self-identified answers. This read is audited; the source and submission time stay with each version.</p>
 <section class="card"><h2>Self-identification history</h2>${data.history.length ? table(HISTORY_HEADERS,data.history.map(eeoHistoryRow)) : h`<p>No self-identified answers.</p>`}</section>`,{current:'/app/eeo/person',url})
}
