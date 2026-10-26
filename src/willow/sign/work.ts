import type { Bindings } from '../../auth.server'
import { can } from '../actor'
import { readsCategory } from '../access'
import { all, now } from '../core'
import { addDays, today } from '../dates'
import { employerZone } from '../actor'
import type { WorkSource } from '../work-sources'
import { pendingSignature } from './cohort-access'

/** Work ownership never substitutes for a named signer's own consent or session. */
export async function signatureWork(env:Bindings,defaultDays:number):Promise<WorkSource[]> {
 const result:WorkSource[]=[],zone=await employerZone(env),instant=now()
 for(const row of await all(env,"SELECT id FROM wl_sign_requests WHERE state IN ('sent','viewed') AND expires_at>?",instant)) {
  const pending=await pendingSignature(env,row.id,instant)
  if(!pending)continue
  const {request,recipient,signer,cohort,category}=pending
  const due=addDays(today(zone,request.created_at),defaultDays)
  const hr=(a:Parameters<WorkSource['visible']>[0])=>can(a,'people.manage')&&readsCategory(a,request.person_id,category)
  result.push({key:`signature:${request.id}:${signer}`,kind:'signature',title:'Sign reviewed document',path:'/app/signatures/'+request.id,due,personId:request.person_id,preferred:recipient.id,next:'Review and sign the exact document',progress:signer===0?'Employee signature pending':'Named employer countersignature pending',approval:true,notificationAllowed:!!cohort.notify,visible:a=>a.id===recipient.id||hr(a),responsible:a=>a.id===recipient.id})
  result.push({key:`signature-escalation:${request.id}:${signer}`,kind:'signature-escalation',title:'Resolve overdue signature request',path:'/app/signatures/'+request.id,due:addDays(due,1),personId:request.person_id,preferred:cohort.initiator,next:'Contact the named signer if the request remains pending',progress:'Escalates after the signer deadline; only the named signer can sign',approval:true,notificationAllowed:!!cohort.notify,visible:hr,responsible:hr})
 }
 return result
}
