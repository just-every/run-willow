// REPORT-001: definitions describe a report, never grant permission to its rows or columns.
import { SIGNATURE_COLUMNS, SIGNATURE_STATES } from './signatures'
import { isReporter, selectedReport } from '../levels/reports'
import type { Bindings } from '../../auth.server'
import { can, hasScopedGrant, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one } from '../core'
import { stmt } from '../core'
import { isDate } from '../dates'
import type { Input } from '../input'
import { effectiveFieldDefinitions } from '../custom-fields/store'
export interface ReportDefinition { name:string; columns:string[]; asOf:string; from:string; to:string; department:string; location:string; status:'active'|'all'; signatureTemplate?:string; signatureCohort?:string; signatureState?:string }
export const STANDARD_COLUMNS: Record<string,string>={name:'Name',employeeNumber:'Employee number',jobTitle:'Job title',department:'Department',location:'Location',employmentType:'Employment type',fte:'FTE',tenureDays:'Tenure (days)',leaveHours:'Leave balance (hours)',leaveLiability:'Leave liability',payAmount:'Pay amount',phone:'Private phone',personal_email:'Personal email',openExceptions:'Open exceptions',overdueWork:'Overdue work',...SIGNATURE_COLUMNS}
export function requireReporter(a:Actor) { insist(can(a,'reports.read')||hasScopedGrant(a,'reports.read')||a.reports.size>0,'forbidden',403) }
export async function reportDefinition(env:Bindings,raw:unknown,date:string):Promise<ReportDefinition> {
 insist(raw && typeof raw==='object'&&!Array.isArray(raw),'invalid_report')
 const d=raw as Record<string,any>
 insist(Object.keys(d).every(k=>['name','columns','asOf','from','to','department','location','status','signatureTemplate','signatureCohort','signatureState'].includes(k)),'unexpected_report_field')
 insist(typeof d.name==='string'&&d.name.trim().length>0&&d.name.length<=160,'invalid_report_name')
 const asOf=d.asOf||date,anchor=asOf==='today'?date:asOf,from=d.from||anchor.slice(0,7)+'-01',to=d.to||anchor
 insist((asOf==='today'||isDate(asOf))&&isDate(from)&&isDate(to)&&from<=to,'invalid_report_dates')
 const custom=(await effectiveFieldDefinitions(env,asOf==='today'?date:asOf)).map(f=>'custom.'+f.key)
 insist(Array.isArray(d.columns)&&d.columns.length>0&&d.columns.length<=40&&new Set(d.columns).size===d.columns.length&&d.columns.every((k:unknown)=>typeof k==='string'&&(Object.hasOwn(STANDARD_COLUMNS,k)||custom.includes(k))),'invalid_report_columns')
 for(const k of ['department','location','signatureTemplate','signatureCohort']) insist(d[k]===undefined||typeof d[k]==='string'&&d[k].length<=160,'invalid_report_filter')
 insist(d.signatureState===undefined||d.signatureState===''||SIGNATURE_STATES.includes(d.signatureState),'invalid_signature_state')
 insist(!d.status||['active','all'].includes(d.status),'invalid_report_status')
 return {name:d.name.trim(),columns:d.columns,asOf,from,to,department:d.department||'',location:d.location||'',status:d.status||'active',signatureTemplate:d.signatureTemplate||'',signatureCohort:d.signatureCohort||'',signatureState:d.signatureState||''}
}
export async function savedReports(env:Bindings,actor:Actor) {
 insist(isReporter(actor)||actor.reportGrants.length>0,'forbidden',403)
 const rows=await all(env,`SELECT r.*,v.id AS version_id,v.version,v.definition_json,v.recorded_at FROM wl_saved_reports r JOIN wl_report_versions v ON v.report_id=r.id WHERE v.version=(SELECT MAX(version) FROM wl_report_versions WHERE report_id=r.id) AND (r.created_by=? OR ?=1 OR r.id IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM wl_report_schedules s,json_each(s.recipients_json) p WHERE s.report_id=r.id AND p.value=?)) ORDER BY v.recorded_at DESC`,actor.id,+can(actor,'reports.read'),JSON.stringify(actor.reportGrants.flatMap(g=>g.reports)),actor.id)
 return rows.filter(r=>isReporter(actor)||selectedReport(actor,r.id)).map(r=>({id:r.id,versionId:r.version_id,version:r.version,definition:JSON.parse(r.definition_json) as ReportDefinition,createdBy:r.created_by,createdAt:r.created_at}))
}
export async function savedReport(env:Bindings,actor:Actor,id:string) {
 const report=(await savedReports(env,actor)).find(r=>r.id===id);insist(report,'not_found',404);return report
}
export async function saveReport(env:Bindings,actor:Actor,input:Input) {
 requireReporter(actor)
 const raw=input.has('definition')?input.json('definition'):{name:input.text('name'),columns:input.list('columns'),asOf:input.text('asOf',{optional:true})||actor.today,from:input.text('from',{optional:true}),to:input.text('to',{optional:true}),department:input.text('department',{optional:true}),location:input.text('location',{optional:true}),status:input.text('status',{optional:true}),signatureTemplate:input.text('signatureTemplate',{optional:true}),signatureCohort:input.text('signatureCohort',{optional:true}),signatureState:input.text('signatureState',{optional:true})}
 const definition=await reportDefinition(env,raw,actor.today),existing=input.has('report')?await savedReport(env,actor,input.text('report')):null
 insist(!existing||existing.createdBy===actor.id||actor.owner,'forbidden',403)
 const id=existing?.id??newId(),version=(existing?.version??0)+1,versionId=newId(),at=now(),statements=[]
 if(!existing)statements.push(stmt(env,'INSERT INTO wl_saved_reports VALUES (?,?,?)',id,actor.id,at))
 statements.push(guard(env,'stale','(SELECT COUNT(*) FROM wl_report_versions WHERE report_id=?)=?',id,version-1),stmt(env,'INSERT INTO wl_report_versions VALUES (?,?,?,?,?,?)',versionId,id,version,JSON.stringify(definition),actor.id,at))
 await commit(env,statements,{actor:actor.id,action:'report.save',subject:id,detail:{version}})
 return {id,version,versionId}
}
