// SIGN-002: status metadata only. A report's admission actor never owns signing rights.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { readsCategory } from '../access'
import { all, now } from '../core'
import { today } from '../dates'

export const SIGNATURE_STATES = ['sent','viewed','signed','declined','expired','voided','cancelled','withdrawn','unknown'] as const
export type SignatureState = typeof SIGNATURE_STATES[number]
export const SIGNATURE_COLUMNS: Record<string,string> = {
 signatureRequests:'Signature requests',signaturePending:'Pending signatures',signatureViewed:'Viewed signature requests',
 signatureSigned:'Completed signatures',signatureDeclined:'Declined signatures',signatureExpired:'Expired signatures',
 signatureVoided:'Voided signatures',signatureCancelled:'Cancelled signatures',signatureWithdrawn:'Withdrawn signatures',signatureUnknown:'Unknown signature state',
}
export interface SignatureSource {
 id:string;personId:string;template:string;title:string;cohort:string;state:SignatureState
 createdAt:number;expiresAt:number;viewedAt:number|null;completedAt:number|null;closedAt:number|null;lastEventAt:number
 source:string
}
export const readsSignatureStatus = (actor:Actor,person:string) => can(actor,'people.manage') || actor.personId===person || actor.reports.has(person)

/** Reconstruct the employer-local day's observed state without loading signing values or certificates. */
export async function datedSignatureSources(env:Bindings,actor:Actor,asOf:string,zone:string):Promise<SignatureSource[]> {
 const observedAt=now(),included=(at:number)=>at<=observedAt&&today(zone,at)<=asOf
 const requests=await all(env,`SELECT r.id,r.person_id,r.template_id,r.cohort,r.created_at,r.expires_at,r.state,r.closure_reason,
 t.title,t.signers_json,t.category_id,c.subject_reads,c.manager_reads
 FROM wl_sign_requests r JOIN wl_sign_templates t ON t.id=r.template_id JOIN wl_doc_categories c ON c.id=t.category_id
 ORDER BY r.created_at,r.id`)
 const readable=requests.filter(r=>included(r.created_at)&&readsSignatureStatus(actor,r.person_id)&&readsCategory(actor,r.person_id,r))
 if(!readable.length)return []
 const ids=new Set(readable.map(r=>r.id))
 const events=await all<{request_id:string;kind:string;signer:number|null;at:number}>(env,'SELECT request_id,kind,signer,at FROM wl_sign_events ORDER BY at,signer,id')
 const byRequest=new Map<string,typeof events>()
 for(const event of events)if(ids.has(event.request_id)&&included(event.at)) {
  const entries=byRequest.get(event.request_id)??[];entries.push(event);byRequest.set(event.request_id,entries)
 }
 // Earlier native cohorts recorded cancellation atomically in audit, before per-request events existed.
 const cancellations=await all<{subject:string;at:number}>(env,"SELECT subject,at FROM wl_audit WHERE action='signature.cohort.cancel' ORDER BY at,seq")
 return readable.map(row=> {
  const history=byRequest.get(row.id)??[],signers=new Set<number>(),required=JSON.parse(row.signers_json).length
  let state:SignatureState='sent',viewedAt:number|null=null,completedAt:number|null=null,closedAt:number|null=null,lastEventAt=row.created_at
  const transitions=[...history,...cancellations.filter(e=>e.subject===row.cohort&&included(e.at)).map(e=>({kind:'cancelled',signer:null,at:e.at,request_id:row.id}))].sort((a,b)=>a.at-b.at)
  for(const event of transitions) {
   if(!['sent','viewed'].includes(state))continue
   lastEventAt=event.at
   if(event.kind==='view'||event.kind==='sign') {
    viewedAt??=event.at;state='viewed'
    if(event.kind==='sign'&&event.signer!==null)signers.add(event.signer)
    if(signers.size===required) {state='signed';completedAt=event.at;closedAt=event.at}
   } else {
    const terminal:Record<string,SignatureState>={decline:'declined',withdraw:'withdrawn',void:'voided',cancelled:'cancelled',expired:'expired'}
    if(terminal[event.kind]) {state=terminal[event.kind];closedAt=event.at}
   }
  }
  if(['sent','viewed'].includes(state)&&included(row.expires_at)) {state='expired';closedAt=row.expires_at;lastEventAt=Math.max(lastEventAt,row.expires_at)}
  // Missing immutable history is unknown, never inferred as a completed signature from a mutable row.
  if(asOf>=today(zone,observedAt)&&state!==(row.state==='voided'&&row.closure_reason==='cohort-cancelled'?'cancelled':row.state)&&!(state==='expired'&&['sent','viewed'].includes(row.state)))state='unknown'
  return {id:row.id,personId:row.person_id,template:row.template_id,title:row.title,cohort:row.cohort,state,
   createdAt:row.created_at,expiresAt:row.expires_at,viewedAt,completedAt,closedAt,lastEventAt,
   source:`/app/signatures/${row.id}?asOf=${asOf}`}
 })
}
