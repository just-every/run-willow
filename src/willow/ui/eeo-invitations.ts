import { msg,locale } from '../locale/runtime'
import { CONSENT } from '../sign/custody'
// Scoped invitation pages reuse the employee form and Willow's existing page primitives.
import { DISCLOSURES } from '../eeo/forms'
import type { EeoRevision } from '../eeo/types'
import { eeoFields, eeoHistoryRow, HISTORY_HEADERS } from './eeo'
import { h, page, table,field,hidden } from './html'
import type { Actor } from '../actor'

type Invitation = { current: EeoRevision | null; history: EeoRevision[]; expiresAt: number; form: { contractor: boolean }; phase?: 'pre-offer'|'post-offer';signature?:any;consentDigest?:string }
export function invitationPage(kind: 'preboarding'|'applicant', data: Invitation, path: string, url: URL) {
 const applicant = kind === 'applicant'
 const disclosures = applicant ? DISCLOSURES.slice(0,2) : DISCLOSURES
 const response = page(msg('Voluntary self-identification'), null, h`<h1>Voluntary self-identification</h1>
 <p>${msg(applicant ? msg('This is a separate step for one submitted application. Answering does not affect selection. Your hiring team never sees your answers.') : msg('This invitation opens only your own voluntary EEO answers. HR sees that this step is done whether you answer or decline.'))}</p>
 <ul>${disclosures.map(text=>h`<li>${msg(text)}</li>`)}</ul>
 <p>Invitation expires ${new Date(data.expiresAt).toISOString()}. ${applicant ? msg(data.phase==='pre-offer'?'Pre-offer invitation.':'Post-offer invitation.') : msg('When employment starts, your answers become your employee EEO record unchanged.')}</p>
 <section class="card"><h2>Your answers</h2><p>Choose “I do not wish to self-identify” to decline. Each save keeps a new version of your answers.</p>
 <form method="post" action="${path}">${eeoFields(data.current,data.form.contractor,data.phase ?? 'post-offer')}<button type="submit">Save my answers</button></form></section>
 <section class="card"><h2>Your submission history</h2>${data.history.length ? table(HISTORY_HEADERS,data.history.map(eeoHistoryRow)) : h`<p>You have not submitted answers.</p>`}</section>${!applicant?h`<section class="card"><h2>Preboarding acknowledgement</h2><p>Read the document before signing. You can download and keep a copy.</p><p><a href="${path}?document=preview">Download acknowledgement</a></p>${data.signature?h`<p>Your signature is recorded.</p><p><a href="${path}?document=signed">Download signed copy</a></p><h3>Audit certificate</h3>${table(['Language','Signed at','Consent'],[[data.signature.language,new Date(data.signature.signedAt).toISOString(),data.signature.certificate.consent]])}`:h`<form method="post" action="${path}">${hidden('localeAction','sign')}${hidden('signingLanguage',locale())}${hidden('consentDigest',data.consentDigest)}${field('Signature name','name')}<label class="check"><input type="checkbox" name="consent" value="yes" required> ${msg(CONSENT)}</label><button type="submit">Sign acknowledgement</button></form>`}</section>`:''}`, {url,showNav:false})
 response.headers.set('referrer-policy','strict-origin')
 return response
}
export function invitationRecordPage(actor: Actor, title: string, data: {history: EeoRevision[]}, url: URL) {
 return page(title,actor,h`<p class="back"><a href="/app/eeo/person">← EEO compliance</a></p><h1>${title}</h1><p>Individual self-identified answers. This read is audited; the source and submission time stay with each version.</p>
 <section class="card"><h2>Self-identification history</h2>${data.history.length ? table(HISTORY_HEADERS,data.history.map(eeoHistoryRow)) : h`<p>No self-identified answers.</p>`}</section>`,{current:'/app/eeo/person',url})
}
