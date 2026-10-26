import type { Bindings } from '../../auth.server'
import { all, commit, guard, newId, stmt } from '../core'

/** The scheduled instant is the sole expiry boundary, including after restart. */
export async function expireSignatures(env:Bindings,instant:number) {
 const requests=await all(env,"SELECT id,revision FROM wl_sign_requests WHERE state IN ('sent','viewed') AND expires_at<=?",instant)
 for(const row of requests) {
  await commit(env,[guard(env,'signature_changed',"EXISTS(SELECT 1 FROM wl_sign_requests WHERE id=? AND revision=? AND state IN ('sent','viewed') AND expires_at<=?)",row.id,row.revision,instant),
   stmt(env,"UPDATE wl_sign_requests SET state='expired',revision=revision+1 WHERE id=?",row.id),
   stmt(env,"INSERT INTO wl_sign_events(id,request_id,member_id,kind,at,detail) VALUES(?,?,?,'expired',?,?)",newId(),row.id,'scheduler',instant,JSON.stringify({state:'expired',revisionBefore:row.revision,revisionAfter:row.revision+1}))],
   {actor:'scheduler',action:'signature.expired',subject:row.id,detail:{state:'expired',revisionBefore:row.revision,revisionAfter:row.revision+1,scheduledAt:instant}})
 }
 return requests.length
}
