// Native forms use Willow's existing accessible fields and frame.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { signatureRequest, signatureRequests, CONSENT } from '../sign/requests'
import { signatureTemplates } from '../sign/templates'
import { settings } from '../employer'
import { directory } from '../profile'
import { all } from '../core'
import { field,form,h,hidden,page,select,table } from './html'

export async function signaturesPage(env:Bindings,actor:Actor,url:URL) {
 const rows=await signatureRequests(env,actor)
 const admin=can(actor,'people.manage')
 const templates=admin?(await signatureTemplates(env,actor)).filter(t=>t.current&&t.approvedAt):[]
 const people=await directory(env,actor)
 const look=admin?await settings(env):null
 const levels=admin?await all(env,'SELECT id,name FROM wl_levels'):[]
 const members=admin?await all(env,"SELECT id,name FROM wl_members WHERE status='active'"):[]
 return page('Signatures',actor,h`<h1>Signatures</h1><p>Requests appear in the portal. No email is sent automatically.</p><section class="card"><h2>Document requests</h2><p><a href="/app/signatures.csv">Download status CSV</a></p>${table(['Document','Person','State'],rows.map(r=>[h`<a href="/app/signatures/${r.id}">${r.title}</a>`,people.find(p=>p.id===r.person)?.name??'Employee',r.state]))}</section>
 ${admin?h`<section class="card"><h2>Prepare requests</h2><p>Choose an approved PDF template and an active cohort. Use the checkboxes only for named people. Review every recipient before creating requests.</p>${templates.length?form('signature.preview','/app/signatures',[select('Cohort','cohortSelection',[{value:'named',label:'Named people'},{value:'everyone',label:'Everyone'},...(look?.locations??[]).map(l=>({value:'location:'+l.id,label:'Location: '+l.name})),...(look?.departments??[]).map(d=>({value:'department:'+d.id,label:'Department: '+d.name})),...['full_time','part_time','casual','contractor'].map(value=>({value:'employment_type:'+value,label:'Employment type: '+value.replaceAll('_',' ')})),...levels.map(l=>({value:'access_level:'+l.id,label:'Access level: '+l.name}))]),select('Approved template','template',templates.map(t=>({value:t.id,label:t.title}))),h`<fieldset><legend>Recipients</legend>${people.filter(p=>p.status==='active').map(p=>h`<label class="check"><input type="checkbox" name="people" value="${p.id}"> ${p.name}</label>`)}</fieldset>`,select('HR countersigner','hr',members.map(m=>({value:m.id,label:m.name}))),field('Days to sign (1 to 90)','expiryDays',{type:'number',value:7})],'Review recipients'):h`<p>No approved current PDF templates.</p>`}</section>`:''}`,{url,current:'/app/signatures'})
}
export function signaturePreviewPage(actor:Actor,result:any,url:URL) {
 return page('Review signature requests',actor,h`<h1>Review signature requests</h1><section class="card"><h2>${result.title}</h2><p>Every recipient receives a separate request for this exact approved version. No outbound message will be sent.</p><p>Template digest: <code style="overflow-wrap:anywhere">${result.templateDigest}</code></p><ul>${result.recipients.map((r:any)=>h`<li>${r.name} · <a href="/app/signature-reviews/${result.id}?person=${r.id}">Preview exact document</a></li>`)}</ul>${form('signature.send','/app/signatures',[hidden('review',result.id),hidden('digest',result.digest),h`<label class="check"><input type="checkbox" name="approved" value="yes" required> I approve this exact document and recipient list</label>`],'Create portal requests')}</section>`,{url,current:'/app/signatures'})
}
export async function signaturePage(env:Bindings,actor:Actor,id:string,url:URL) {
 const r=await signatureRequest(env,actor,id),back='/app/signatures/'+id
 const bound=[hidden('request',id),hidden('revision',r.revision),hidden('digest',r.digest)]
 return page('Signature request',actor,h`<p class="back"><a href="/app/signatures">← Signatures</a></p><h1>${r.title}</h1><section class="card"><h2>${r.state}</h2>${r.participant?h`<p><a href="/app/signatures/${id}.pdf">Download exact document</a></p><p>SHA-256: <code style="overflow-wrap:anywhere">${r.digest}</code></p>`:''}
 ${r.canSign?h`<h3>Signer ${r.signer+1} of ${r.signers.length}</h3><p>Download and read the exact document before signing. You need a PDF reader and may retain a copy. Withdraw or decline below before completion.</p><ul>${r.fields.filter((f:any)=>f.signer===r.signer).map((f:any)=>h`<li>${f.kind} · page ${f.page}</li>`)}</ul>${form('signature.act',back,[...bound,hidden('action','sign'),field('Signature name','name'),...(r.fields.some((f:any)=>f.signer===r.signer&&f.kind==='initial')?[field('Initials','initial')]:[]),...(r.fields.some((f:any)=>f.signer===r.signer&&f.kind==='text')?[field('Text field','text')]:[]),h`<label class="check"><input type="checkbox" name="consent" value="yes" required> ${CONSENT}</label>`],'Sign exact document')}`:''}
 ${r.participant&&['sent','viewed'].includes(r.state)?h`<details><summary>Request actions</summary>${['view','decline','withdraw',...(r.canManage?['void']:[])].map(action=>form('signature.act',back,[...bound,hidden('action',action)],action==='withdraw'?'Withdraw electronic consent':action==='view'?'Mark viewed':action==='void'?'Void request':'Decline signing'))}</details>`:''}
 ${r.sealedVersion?h`<p><a href="/app/files/document/${r.sealedVersion}?download=1">Download filed sealed copy</a></p>`:''}
 ${r.certificate?h`<h3>Audit certificate</h3><p>Authentication: active session. Consent and completion are recorded for each signer.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${JSON.stringify(r.certificate,null,2)}</pre>`:''}</section>`,{url,current:'/app/signatures'})
}
