// ROLE-001/012: selected saved and built-in definitions grant only scoped report reads.
import { BUILTIN_REPORTS } from '../reporting/builtin-catalog'
import type { Bindings } from '../../auth.server'
import { can, hasScopedGrant, type Actor } from '../actor'
import { all, insist } from '../core'
import { EVERYONE, levelScopes, scopeMembers, type Scope } from './scope'
export interface ReportGrant {level:string;reports:string[];scope:Scope;people:Set<string>}
export const isReporter=(a:Actor)=>can(a,'reports.read')||hasScopedGrant(a,'reports.read')||a.reports.size>0
export const selectedReport=(a:Actor,id:string)=>a.reportGrants.some(g=>g.reports.includes(id))
export const requireReportReader=(a:Actor,id?:string)=>insist(isReporter(a)||!!id&&selectedReport(a,id),'forbidden',403)
export async function reportGrants(env:Bindings,member:string,person:string|null,date:string):Promise<ReportGrant[]> {
 const rows=await all<{level_id:string;report_id:string}>(env,`SELECT r.level_id,r.report_id FROM wl_level_reports r JOIN wl_member_levels a ON a.level_id=r.level_id WHERE a.member_id=?
 UNION SELECT r.level_id,r.report_id FROM wl_level_builtin_reports r JOIN wl_member_levels a ON a.level_id=r.level_id WHERE a.member_id=?`,member,member)
 if(!rows.length)return []
 const scopes=await levelScopes(env),everyone=new Set((await all<{id:string}>(env,'SELECT id FROM wl_people')).map(p=>p.id))
 return Promise.all([...new Set(rows.map(r=>r.level_id))].map(async level=>{
  const scope=scopes.get(level)??EVERYONE
  return {level,reports:rows.filter(r=>r.level_id===level).map(r=>r.report_id),scope,people:scope.kind==='everyone'?everyone:await scopeMembers(env,date,scope,person)}
 }))
}
/** This actor is used only to admit a report's people; field reads and work stay on the real actor. */
export const reportAdmission=(a:Actor,id?:string):Actor=>!id?a:{...a,scoped:[...a.scoped,...a.reportGrants.filter(g=>g.reports.includes(id)).map(g=>({...g,permissions:new Set<'reports.read'>(['reports.read'])}))]}
export async function reportChoices(env:Bindings,actor:Actor) {
 const saved=(await all<{id:string;name:string;created_by:string;recipient:number}>(env,`SELECT r.id,r.created_by,json_extract(v.definition_json,'$.name') AS name,EXISTS(SELECT 1 FROM wl_report_schedules s,json_each(s.recipients_json) p WHERE s.report_id=r.id AND p.value=?) AS recipient FROM wl_saved_reports r JOIN wl_report_versions v ON v.report_id=r.id WHERE v.version=(SELECT MAX(version) FROM wl_report_versions WHERE report_id=r.id) ORDER BY name`,actor.id)).filter(r=>can(actor,'reports.read')||selectedReport(actor,r.id)||isReporter(actor)&&(r.created_by===actor.id||!!r.recipient)).map(({id,name})=>({id,name}))
 const builtins=BUILTIN_REPORTS.filter(report=>isReporter(actor)||selectedReport(actor,report.id)).map(({id,name})=>({id,name}))
 return [...saved,...builtins].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id))
}
