import { sendFixedNotice } from './locale/notices'
import { reconcileRecipients } from './performance/store'
import { expireSignatures } from './sign/expiry'
import { enrollSignatureJoiners } from './sign/cohorts'
import { dispatchCohortNotices } from './sign/delivery'
// A durable attempt claim precedes mail. Uncertain attempts are visible and never retried blindly.
import type { Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'
import { employerZone, requireOwner, type Actor } from './actor'
import { connectionSettings } from './connections'
import { commit, newId, now, stmt } from './core'
import { addDays, today } from './dates'
import { esc } from './ui/html'
import { freshWork, memberUnavailable, workHistory, workPolicy, workState } from './work'
import { runDateAlerts } from './date-alerts/alerts'

export async function runWorkScheduler(env: Bindings, instant=now()) {
 await expireSignatures(env,instant)
 await enrollSignatureJoiners(env,instant)
 await dispatchCohortNotices(env,undefined,instant)
 await reconcileRecipients(env,today(await employerZone(env),instant))
 // PEOPLE-004 alerts fire first, in any hour; their review tasks then follow the FLOW-002 cadence.
 await runDateAlerts(env, instant)
 const state = await workState(env), policy = state.policy
 if (!policy) return {attempted:0,reason:'policy_not_approved'}
 const zone = await employerZone(env), date = today(zone,instant)
 const hour = Number(new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',hourCycle:'h23'}).format(instant))
 const start=policy.quiet_start,end=policy.quiet_end
 const quiet = start===end ? false : start<end ? hour>=start && hour<end : hour>=start || hour<end
 if (quiet) return {attempted:0,reason:'quiet_hours'}
 let attempted=0
 for (const source of state.sources) {
  if(source.notificationAllowed===false)continue
  const schedule = state.schedules.get(source.key)!
  const owner = state.members.find(a=>a.id===schedule.owner)
  const unavailable = !owner || !source.visible(owner) || await memberUnavailable(env,owner,date)
  const substitute = state.members.find(a=>a.id===schedule.substitute)
  const covered = unavailable && schedule.due_date<date && substitute && source.visible(substitute) && !await memberUnavailable(env,substitute,date)
  const recipient = covered ? substitute : unavailable ? null : owner
  if (!recipient) continue
  for (const [step,offset] of policy.offsets.entries()) {
   if (addDays(schedule.due_date,offset)>date) continue
   const id = newId()
   const claim = await stmt(env,`INSERT OR IGNORE INTO wl_work_deliveries(id,source,schedule_revision,policy_revision,step,recipient,status,created_at) VALUES(?,?,?,?,?,?,'claimed',?)`,id,source.key,schedule.revision,policy.revision,offset,recipient.id,instant).run()
   if (!claim.meta.changes) continue
   attempted++
   await workHistory(env,source.key,'scheduler',covered?'coverage.escalated':'reminder.claimed',{delivery:id,step,recipient:recipient.id},instant).run()
   let status='refused', failure:string|null='recipient_or_source_changed'
   const fresh = await freshWork(env,source.key,recipient.id,schedule)
   const currentPolicy = await workPolicy(env)
   if (fresh && fresh.source.notificationAllowed!==false && currentPolicy?.revision===policy.revision && !await memberUnavailable(env,fresh.member,date)) {
    const enabled = (await connectionSettings(env))?.notices
    if (!enabled) {status='disabled';failure='notices_disabled'}
    else {
     const sender = operatorMail(env)
     if (!sender || !env.MAIL_FROM) {status='failed';failure='mail_unavailable'}
     else try {
      // Fixed content and authenticated link only; never send the title, person, date or next-action text.
      const path=env.AUTH_ORIGIN+'/app/tasks'
      const result=await sendFixedNotice(env,'member',fresh.member.id,sender,{deliveryId:id,from:env.MAIL_FROM,to:[fresh.member.email],subject:'Willow: assigned work needs attention',html:`<p>There is assigned work to review in Willow.</p><p><a href="${esc(path)}">Sign in to Willow</a></p>`,text:`There is assigned work to review in Willow.\n\nSign in to Willow: ${path}\n`,headers:{'Auto-Submitted':'auto-generated'}})
      if (result?.status==='accepted' || result?.status==='development' && env.AUTH_LOCAL==='true') {status=result.status;failure=null}
      else if (result?.status==='uncertain') {status='uncertain';failure='mail_outcome_uncertain'}
      else if (result?.status==='rate_limited') {status='failed';failure='mail_rate_limited'}
      else {status='refused';failure='mail_refused'}
     } catch {status='uncertain';failure='mail_outcome_uncertain'}
    }
   }
   await commit(env,[stmt(env,'UPDATE wl_work_deliveries SET status=?,failure=? WHERE id=?',status,failure,id)],{actor:'scheduler',action:'work.reminder',subject:source.key,detail:{delivery:id,offset,recipient:recipient.id,status,failure}})
  }
 }
 return {attempted}
}
const clock = (zone: string, instant: number) => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(instant)

/** What a manual check did, in Willow's own words, and when it checks next. */
function checkOutcome(result: { attempted: number; reason?: string }, zone: string, quietEnd: number | null, instant: number) {
 const at = `I checked at ${clock(zone, instant)}.`
 if (result.reason === 'policy_not_approved') return `${at} Reminders are paused until HR approves a reminder cadence and quiet hours, so I sent none.`
 if (result.reason === 'quiet_hours') { const end = `${(quietEnd! + 11) % 12 + 1}:00 ${quietEnd! < 12 ? 'AM' : 'PM'}`; return `${at} Quiet hours run until ${end}, so I sent no reminders; I check again at ${end}.` }
 if (!result.attempted) return `${at} Nothing was due, so I sent no reminders; I check again within 15 minutes.`
 return `${at} ${result.attempted} reminder${result.attempted === 1 ? ' was' : 's were'} due and I handled ${result.attempted === 1 ? 'it' : 'them'}; I check again within 15 minutes.`
}

export async function runWorkNow(env: Bindings,actor:Actor) {
 requireOwner(actor)
 const instant = now(), result = await runWorkScheduler(env, instant)
 const policy = (await workState(env)).policy
 return { ...result, notice: checkOutcome(result, await employerZone(env), policy?.quiet_end ?? null, instant) }
}
