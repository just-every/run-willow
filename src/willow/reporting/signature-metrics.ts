import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import type { ReportDefinition } from './definitions'
import { datedSignatureSources, readsSignatureStatus, SIGNATURE_COLUMNS, type SignatureSource } from './signatures'
import { today } from '../dates'

export const usesSignatures=(definition:ReportDefinition)=>definition.columns.some(key=>Object.hasOwn(SIGNATURE_COLUMNS,key))||!!(definition.signatureTemplate||definition.signatureCohort||definition.signatureState)
export const signatureMeasures=(sources:SignatureSource[])=>({
 signatureRequests:sources.length,signaturePending:sources.filter(s=>['sent','viewed'].includes(s.state)).length,
 signatureViewed:sources.filter(s=>s.state==='viewed').length,signatureSigned:sources.filter(s=>s.state==='signed').length,
 signatureDeclined:sources.filter(s=>s.state==='declined').length,signatureExpired:sources.filter(s=>s.state==='expired').length,
 signatureVoided:sources.filter(s=>s.state==='voided').length,signatureWithdrawn:sources.filter(s=>s.state==='withdrawn').length,
 signatureUnknown:sources.filter(s=>s.state==='unknown').length,
})
export async function signatureMetrics(env:Bindings,actor:Actor,definition:ReportDefinition,asOf:string,zone:string) {
 const sources=(await datedSignatureSources(env,actor,asOf,zone)).filter(s=>
  today(zone,s.createdAt)>=definition.from&&today(zone,s.createdAt)<=definition.to&&
  (!definition.signatureTemplate||s.template===definition.signatureTemplate)&&
  (!definition.signatureCohort||s.cohort===definition.signatureCohort)&&
  (!definition.signatureState||s.state===definition.signatureState))
 return (person:string)=> {
  const permitted=readsSignatureStatus(actor,person),records=permitted?sources.filter(s=>s.personId===person):[]
  return {permitted,sources:records,measures:permitted?signatureMeasures(records):null}
 }
}
export const SIGNATURE_BASIS='Readable native signature requests issued in the inclusive report range, reconstructed from immutable signing events at the as-of employer-local date and capped at the latest observed time. Current signing-status and category rights apply; other categories are excluded. Pending includes sent and viewed requests, including those awaiting countersignature. Completed means every required native signer was observed. Missing history is unknown. No count proves email delivery, a provider outcome or legal validity.'
