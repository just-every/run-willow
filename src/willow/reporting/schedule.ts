import { sendFixedNotice } from '../locale/notices'
// REPORT-001: immutable-version schedules, safe authenticated links and durable one-attempt custody.
import { isReporter, requireReportReader } from '../levels/reports'
import type { Bindings } from '../../auth.server'
import { actorFor, employerZone, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt } from '../core'
import { addDays, daysBetween, isDate, today } from '../dates'
import type { Input } from '../input'
import { operatorMail } from '../../mail.server.mjs'
import { connectionSettings } from '../connections'
import { workMembers } from '../work-sources'
import { requireReporter, savedReport } from './definitions'
import { runReport } from './execute'
export async function scheduleStatus(env:Bindings,actor:Actor,id:string) {
 const report=await savedReport(env,actor,id),r=await one(env,'SELECT * FROM wl_report_schedules WHERE report_id=?',id)
 return {schedule:r&&isReporter(actor)?{firstDate:r.first_date,cadenceDays:r.cadence_days,enabled:!!r.enabled,recipients:JSON.parse(r.recipients_json) as string[],versionId:r.version_id}:null,
  deliveries:(isReporter(actor)&&(report.createdBy===actor.id||actor.owner)?await all(env,'SELECT * FROM wl_report_deliveries WHERE report_id=? ORDER BY created_at DESC',id):await all(env,'SELECT * FROM wl_report_deliveries WHERE report_id=? AND recipient=? ORDER BY created_at DESC',id,actor.id)).map(d=>({id:d.id,occurrence:d.occurrence,recipient:d.recipient,status:d.status,failure:d.failure,createdAt:d.created_at}))}
}
export async function scheduleReport(env:Bindings,actor:Actor,input:Input) {
 requireReporter(actor)
 const report=await savedReport(env,actor,input.text('report'))
 insist(report.createdBy===actor.id||actor.owner,'forbidden',403)
 insist(input.text('version')===report.versionId,'report_version_changed',409)
 const first=input.text('firstDate'),cadence=input.integer('cadenceDays',{min:1,max:366})!,recipients=input.list('recipients'),enabled=input.flag('enabled')
 insist(isDate(first),'invalid_firstDate')
 insist(recipients.length>0&&recipients.length<=50&&new Set(recipients).size===recipients.length,'invalid_recipients')
 const members=await workMembers(env)
 for(const id of recipients){const member=members.find(a=>a.id===id);insist(member,'recipient_unavailable');requireReportReader(member,report.id);await runReport(env,member,report.definition,report.id)}
 const revision=newId()
 await commit(env,[guard(env,'report_version_changed','(SELECT id FROM wl_report_versions WHERE report_id=? ORDER BY version DESC LIMIT 1)=?',report.id,report.versionId),stmt(env,`INSERT INTO wl_report_schedules VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(report_id) DO UPDATE SET version_id=excluded.version_id,recipients_json=excluded.recipients_json,first_date=excluded.first_date,cadence_days=excluded.cadence_days,enabled=excluded.enabled,revision=excluded.revision,approved_by=excluded.approved_by,approved_at=excluded.approved_at`,report.id,report.versionId,JSON.stringify(recipients),first,cadence,+enabled,revision,actor.id,now())],{actor:actor.id,action:'report.schedule',subject:report.id,detail:{version:report.versionId,enabled}})
 return {id:report.id,revision}
}
async function activeMember(env:Bindings,id:string) {
 const row=await one(env,`SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active'`,id)
 if(!row)return null
 try{return await actorFor(env,{id:row.id,email:row.email,name:row.name,personId:row.person_id,owner:row.role==='owner',sessionId:''})}catch{return null}
}
export async function runReportScheduler(env:Bindings,instant=now()) {
 const zone=await employerZone(env),date=today(zone,instant);let attempted=0
 for(const schedule of await all(env,'SELECT * FROM wl_report_schedules WHERE enabled=1 AND first_date<=?',date)) {
  const occurrence=addDays(schedule.first_date,Math.floor(daysBetween(schedule.first_date,date)/schedule.cadence_days)*schedule.cadence_days)
  for(const recipient of JSON.parse(schedule.recipients_json) as string[]) {
   const id=newId(),claim=await stmt(env,"INSERT OR IGNORE INTO wl_report_deliveries (id,report_id,version_id,schedule_revision,occurrence,recipient,status,created_at) VALUES (?,?,?,?,?,?,'claimed',?)",id,schedule.report_id,schedule.version_id,schedule.revision,occurrence,recipient,instant).run()
   if(!claim.meta.changes)continue
   attempted++
   let status='refused',failure:string|null='authority_or_definition_changed'
   const [author,member,fresh]=await Promise.all([activeMember(env,schedule.approved_by),activeMember(env,recipient),one(env,`SELECT s.*,v.definition_json FROM wl_report_schedules s JOIN wl_report_versions v ON v.id=s.version_id WHERE s.report_id=? AND s.enabled=1 AND s.revision=? AND s.version_id=(SELECT id FROM wl_report_versions WHERE report_id=s.report_id ORDER BY version DESC LIMIT 1)`,schedule.report_id,schedule.revision)])
   if(author&&member&&fresh) {
    try {
     requireReporter(author);requireReportReader(member,schedule.report_id)
     await runReport(env,{...member,today:date},JSON.parse(fresh.definition_json),schedule.report_id)
     if(!(await connectionSettings(env))?.notices){status='disabled';failure='notices_disabled'}
     else {
      const sender=operatorMail(env),link=env.AUTH_ORIGIN+'/app/reports/custom/'+schedule.report_id
      if(!sender||!env.MAIL_FROM){status='refused';failure='mail_unavailable'}
      else {
       try {
        const result=await sendFixedNotice(env,'member',member.id,sender,{deliveryId:id,from:env.MAIL_FROM,to:[member.email],subject:'Willow: scheduled report ready',html:`<p>A scheduled report is ready.</p><p><a href="${link}">Sign in to view your permitted report</a></p>`,text:`A scheduled report is ready. Sign in to view your permitted report: ${link}`,headers:{'Auto-Submitted':'auto-generated'}})
        status=result?.status==='accepted'?'accepted':result?.status==='development'&&env.AUTH_LOCAL==='true'?'development':result?.status==='uncertain'?'uncertain':'refused'
        failure=['accepted','development'].includes(status)?null:status==='uncertain'?'mail_outcome_uncertain':'mail_refused'
       }catch{status='uncertain';failure='mail_outcome_uncertain'}
      }
     }
    }catch{status='refused';failure='authority_or_definition_changed'}
   }
   await commit(env,[stmt(env,'UPDATE wl_report_deliveries SET status=?,failure=?,completed_at=? WHERE id=?',status,failure,instant,id)],{actor:'scheduler',action:'report.dispatch',subject:schedule.report_id,detail:{delivery:id,recipient,status,failure,occurrence}})
  }
 }
 return {attempted}
}
