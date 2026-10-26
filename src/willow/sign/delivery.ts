import type { Bindings } from '../../auth.server'
import { operatorMail } from '../../mail.server.mjs'
import { connectionSettings } from '../connections'
import { all, commit, newId, now, stmt } from '../core'
import { esc } from '../ui/html'
import { pendingSignature } from './cohort-access'

/** Policy-approved issue mail uses the same fixed authenticated link for each independent request. */
export async function dispatchCohortNotices(env:Bindings,cohort?:string,instant=now()) {
 let attempted=0
 const rows=await all(env,`SELECT r.id FROM wl_sign_requests r JOIN wl_sign_cohorts c ON c.id=r.cohort WHERE c.notify=1 AND c.stopped_at IS NULL AND r.state IN ('sent','viewed') AND r.expires_at>? ${cohort?'AND c.id=?':''} ORDER BY r.created_at,r.id`,...(cohort?[instant,cohort]:[instant]))
 for(const row of rows) {
  const current=await pendingSignature(env,row.id,instant)
  if(!current||!current.cohort.notify)continue
  const id=newId(),recipient=current.recipient.id,signer=current.signer
  const claim=await stmt(env,"INSERT OR IGNORE INTO wl_sign_notifications(id,request_id,signer,recipient,status,created_at,updated_at) VALUES(?,?,?,?,'claimed',?,?)",id,row.id,signer,recipient,instant,instant).run()
  if(!claim.meta.changes)continue
  attempted++
  let status='refused',failure:string|null='recipient_or_source_changed'
  const fresh=await pendingSignature(env,row.id,instant)
  if(fresh?.cohort.notify&&fresh.recipient.id===recipient&&fresh.signer===signer) {
   if(!(await connectionSettings(env))?.notices){status='disabled';failure='notices_disabled'}
   else {
    const sender=operatorMail(env)
    if(!sender||!env.MAIL_FROM){status='failed';failure='mail_unavailable'}
    else try {
     const path=env.AUTH_ORIGIN+'/app/signatures/'+row.id
     const result=await sender.send({deliveryId:id,from:env.MAIL_FROM,to:[fresh.recipient.email],subject:'Willow: signature request',html:`<p>A signature request is ready in Willow.</p><p><a href="${esc(path)}">Sign in to Willow</a></p>`,text:`A signature request is ready in Willow.\n\nSign in to Willow: ${path}\n`,headers:{'Auto-Submitted':'auto-generated'}})
     if(result?.status==='accepted'||result?.status==='development'&&env.AUTH_LOCAL==='true'){status=result.status;failure=null}
     else if(result?.status==='uncertain'){status='uncertain';failure='mail_outcome_uncertain'}
     else if(result?.status==='rate_limited'){status='failed';failure='mail_rate_limited'}
     else {status='refused';failure='mail_refused'}
    } catch {status='uncertain';failure='mail_outcome_uncertain'}
   }
  }
  await commit(env,[stmt(env,'UPDATE wl_sign_notifications SET status=?,failure=?,updated_at=? WHERE id=?',status,failure,instant,id)],{actor:'scheduler',action:'signature.notice',subject:row.id,detail:{delivery:id,signer,recipient,status,failure}})
 }
 return {attempted}
}
