// A credential is its own principal, compiled from one native level, never an impersonated member.
import type { Bindings } from '../../auth.server'
import { employerZone, type Actor, type Permission } from '../actor'
import { all, insist } from '../core'
import { today } from '../dates'
import type { JobField } from '../levels/job'
import type { LeaveField } from '../levels/leave'
import type { CompensationField } from '../levels/compensation'
import type { SelfField } from '../levels/personal'
import { levelScopes, scopeMembers } from '../levels/scope'
import type { CredentialRow } from './store'

// These native permissions carry read facets. Write/decision/admin doors remain unavailable.
const READ_PERMISSIONS: readonly Permission[]=['people.manage','people.private','pay.read','leave.manage','documents.private','reports.read','payroll.handoff']
export interface CredentialContext {id:string;level:string;version:number;people:Set<string>|null;snapshot:number}
const principals=new WeakMap<Actor,CredentialContext>()
export const credentialContext=(actor:Actor)=>principals.get(actor)
export const isCredentialActor=(actor:Actor)=>principals.has(actor)
export const credentialPeople=(actor:Actor)=>principals.get(actor)?.people
export const credentialPersonAllowed=(actor:Actor,person:string)=>!principals.has(actor)||principals.get(actor)!.people===null||principals.get(actor)!.people!.has(person)

export async function compileCredentialPrincipal(env:Bindings,row:CredentialRow,snapshot:number):Promise<Actor> {
 const date=today(await employerZone(env)),scope=(await levelScopes(env)).get(row.level_id)
 insist(scope,'invalid_credential',401)
 // A non-person principal has no report hierarchy. Direct/indirect scopes therefore reach nobody.
 const members=scope.kind==='everyone'?new Set((await all<{id:string}>(env,'SELECT id FROM wl_people')).map(p=>p.id)):await scopeMembers(env,date,scope,null)
 const [permissions,jobs,leave,compensation,personal,documents,reports]=await Promise.all([
  all<{permission:Permission}>(env,'SELECT permission FROM wl_level_permissions WHERE level_id=?',row.level_id),
  all<{field:JobField;mode:string}>(env,"SELECT field,mode FROM wl_level_job_fields WHERE level_id=? AND relation='others'",row.level_id),
  all<{field:LeaveField;mode:string}>(env,"SELECT field,mode FROM wl_level_leave_fields WHERE level_id=? AND relation='others'",row.level_id),
  all<{field:CompensationField;mode:string}>(env,"SELECT field,mode FROM wl_level_compensation_fields WHERE level_id=? AND relation='others'",row.level_id),
  all<{field:SelfField;mode:string}>(env,'SELECT field,mode FROM wl_level_other_fields WHERE level_id=?',row.level_id),
  all<{category_id:string;mode:string}>(env,"SELECT category_id,mode FROM wl_level_document_categories WHERE level_id=? AND relation='others'",row.level_id),
  all<{report_id:string}>(env,'SELECT report_id FROM wl_level_builtin_reports WHERE level_id=?',row.level_id),
 ])
 const rights=new Set(permissions.map(p=>p.permission).filter(p=>READ_PERMISSIONS.includes(p)))
 const fine=<T extends string>(rules:{field:T;mode:string}[])=>Object.fromEntries(rules.filter(rule=>rule.mode!=='none').map(rule=>[rule.field,'view'])) as Partial<Record<T,'view'>>
 const level=row.level_id,people=scope.kind==='everyone'?null:members
 const actor:Actor={id:`credential:${row.id}`,sessionId:'',email:'',name:row.name,owner:false,personId:null,reports:new Set(),today:date,
  permissions:scope.kind==='everyone'?rights:new Set(),
  scoped:scope.kind==='everyone'?[]:[{level,scope,permissions:rights,people:members}],
  jobFields:[{level,scope,members,fields:{self:{},others:fine(jobs)}}],
  leaveFields:[{level,scope,members,fields:{self:{},others:fine(leave)}}],
  compensationFields:[{level,scope,members,fields:{self:{},others:fine(compensation)}}],
  otherPersonal:[{level,scope,people,fields:fine(personal)}],
  documentCategories:[{level,scope,people,rules:{self:{},others:Object.fromEntries(documents.filter(rule=>rule.mode!=='none').map(rule=>[rule.category_id,'view' as const]))}}],
  reportGrants:reports.length?[{level,scope,people:members,reports:reports.map(report=>report.report_id)}]:[],
  performanceFields:[],
  followOwnChanges:false,approvalGrants:[],settingsGrants:[],
 }
 principals.set(actor,{id:row.id,level,version:row.level_version,people,snapshot})
 return actor
}
