import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import type { Input } from '../input'
import { insist } from '../core'
import { doorCall } from './door'
import { undoLegacyImport } from './bamboohr'

/** Form transport only. All new jobs are created/applied/undone by the Base handler. */
export async function importForm(env: Bindings, actor: Actor, request: Request, input: Input) {
  insist(actor.owner, 'owner_required', 403)
  const action=input.text('action',{max:20})
  if(action==='legacy-undo') return undoLegacyImport(env,actor,input.text('job',{max:100}))
  insist(['apply','undo','reconcile'].includes(action),'invalid_import_action')
  const body={planId:input.text('planId',{max:100}),...(action==='apply'?{reviewedFingerprint:input.text('fingerprint',{max:100})}:{})}
  // Bounded Base requests are resumable; a response lost mid-loop is safely replayed by this same form.
  let result
  for(let batch=0;batch<100;batch++) {
    result=await doorCall(env,request,action,body)
    if(!result.job || ['completed','undone'].includes(result.job.state)) return result
    insist(['queued','applying','undoing'].includes(result.job.state),'import_not_completed',409)
  }
  return result
}
