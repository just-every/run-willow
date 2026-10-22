import { approvalImpact } from './approval-impact'
import { APPROVAL_INPUTS, readApprovals } from './approvals'
import { builtinReport } from '../reporting/builtin-catalog'
import { LEAVE_INPUTS, readLeaveRules, emptyLeaveRules, type LeaveRules } from './leave'
import { COMPENSATION_INPUTS, readCompensationRules, emptyCompensationRules, type CompensationRules } from './compensation'
import { JOB_INPUTS, readJobRules, emptyJobRules, type JobRules } from './job'
// Reviews bind the owner, the complete audited snapshot, the exact change and one use.
import { operatorAuth, type Bindings } from '../../auth.server'
import { PERMISSIONS, requireLevelAdmin, type Actor } from '../actor'
import { all, auditRead, commit, guard, insist, newId, now, one, stmt, WillowError } from '../core'
import type { Input } from '../input'
import { effectivePermissions, levels } from './store'
import { bulkSelection } from './selection'
import { revertPlan, type RevertPlan } from './revert'
import { readDocumentRules, emptyDocumentRules, type DocumentRules } from './documents'
import { readOtherRules, type OtherRules } from './other-personal'
import { combineSelfRules, readSelfRules, SELF_FIELDS, type SelfRules } from './personal'
import { EVERYONE, SCOPE_INPUTS, readScope, scopeMembers, validateScope, type Scope } from './scope'

export type Plan = { kind: 'level'; level: string; name: string; permissions: string[]; approvals: string[]; jobFields: JobRules; leaveFields: LeaveRules; compensationFields: CompensationRules; reports: string[]; documentCategories: DocumentRules; otherFields: OtherRules; selfFields: SelfRules; followOwnChanges: boolean; scope: Scope } | { kind: 'assignment'; member: string; levels: string[] } | { kind: 'bulk-assignment'; members: string[]; levels: string[]; filter?: Record<string,string> } | RevertPlan

import { currentLevelAdmin, delegatedPayReview, levelSessionFence, validateDelegation } from './delegation'

export async function previewLevel(env: Bindings, actor: Actor, input: Input) {
 try { return await prepareLevelReview(env,actor,input) }
 catch(error) {if(!actor.owner && error instanceof WillowError) await auditRead(env,actor.id,'level.denied',actor.id,{code:error.code,operation:'preview'});throw error}
}
async function prepareLevelReview(env: Bindings, actor: Actor, input: Input) {
 actor=await currentLevelAdmin(env,actor)
 const categories=await all<{id:string}>(env,'SELECT id FROM wl_doc_categories')
 input.only([...APPROVAL_INPUTS,...LEAVE_INPUTS,...COMPENSATION_INPUTS,...JOB_INPUTS,'reports','reportSelection','documentCategories',...categories.flatMap(category=>['self','others'].map(relation=>`documentMode.${relation}.${category.id}`)),'kind','level','name','permissions','member','members','levels','returnTo','selfFields','otherFields',...SELF_FIELDS.map(field=>`otherMode.${field}`),'followOwnChanges','selection','q','location','department','role','status','batch',...SCOPE_INPUTS,...SELF_FIELDS.map(field=>`selfMode.${field}`)])
 const snapshot=(await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const data=await levels(env,actor), kind=input.text('kind')
 let plan: Plan
 if(kind==='level') {
  const level=input.text('level',{optional:true}) || newId(), name=input.text('name',{max:120})
  const permissions=[...new Set(input.list('permissions'))].sort()
  insist(permissions.every(p=>(PERMISSIONS as readonly string[]).includes(p)),'invalid_permissions')
  insist(!data.levels.some(row=>row.name===name && row.id!==level),'level_name_used',409)
  if(input.has('level')) insist(data.levels.some(row=>row.id===level),'level_not_found',404)
  const reports=input.provided('reports')||input.provided('reportSelection') ? [...new Set(input.list('reports'))].sort() : data.levels.find(row=>row.id===level)?.reports??[]
  insist(reports.every(id=>data.reportChoices.some(r=>r.id===id)),'report_unavailable',403)
  const approvals=readApprovals(input,data.approvalChoices) ?? data.levels.find(row=>row.id===level)?.approvals ?? []
  const jobFields=readJobRules(input) ?? data.levels.find(row=>row.id===level)?.jobFields ?? emptyJobRules()
  const leaveFields=readLeaveRules(input) ?? data.levels.find(row=>row.id===level)?.leaveFields ?? emptyLeaveRules()
  const compensationFields=readCompensationRules(input) ?? data.levels.find(row=>row.id===level)?.compensationFields ?? emptyCompensationRules()
  const selfFields=readSelfRules(input) ?? data.levels.find(row=>row.id===level)?.selfFields ?? {}
  const documentCategories=readDocumentRules(input,categories) ?? data.levels.find(row=>row.id===level)?.documentCategories ?? emptyDocumentRules()
  const otherFields=readOtherRules(input) ?? data.levels.find(row=>row.id===level)?.otherFields ?? {}
  const followOwnChanges=input.provided('followOwnChanges') ? input.flag('followOwnChanges') : data.levels.find(row=>row.id===level)?.followOwnChanges ?? false
  const scope=readScope(input) ?? data.levels.find(row=>row.id===level)?.scope ?? EVERYONE
  await validateScope(env,scope,permissions)
  plan={kind,level,name,permissions,approvals,jobFields,leaveFields,compensationFields,reports,selfFields,otherFields,documentCategories,followOwnChanges,scope}
 } else if(kind==='revert') {
  plan=await revertPlan(env,actor,input.text('batch'),data)
 } else {
  insist(kind==='assignment'||kind==='bulk-assignment','invalid_kind')
  const selection=kind==='bulk-assignment' ? await bulkSelection(env,actor,input,data.members) : null
  const members=selection?.members ?? [input.text('member')]
  insist(members.length>0,'missing_members')
  const assigned=[...new Set(input.list('levels'))].sort()
  for(const member of members) {
   const target=data.members.find(m=>m.id===member)
   insist(target,'member_not_found',404)
   insist(target.status==='active','access_ended',409)
   insist(!target.owner,'owner_permissions_fixed',409)
  }
  insist(assigned.every(id=>data.levels.some(row=>row.id===id)),'level_not_found',404)
  plan=kind==='assignment' ? {kind,member:members[0],levels:assigned} : {kind,members,levels:assigned,...(selection?.filter?{filter:selection.filter}:{})}
 }
 await validateDelegation(env,actor,plan,data)
 const needsApproval=await delegatedPayReview(env,actor,plan,data)
 const affected=data.members.filter(m=>plan.kind==='level' ? !m.owner && data.assignments.some(a=>a.member_id===m.id && a.level_id===plan.level) : plan.kind==='assignment' ? m.id===plan.member : plan.kind==='revert' ? plan.assignments.some(a=>a.member===m.id) : plan.members.includes(m.id))
 const impact=[]
 // A level's rights are employer-wide only at scope everyone; a scoped level's rights reach the people its scope names.
 const define=(id: string)=>{const row=data.levels.find(l=>l.id===id)!;return plan.kind==='level'&&id===plan.level ? {permissions:plan.permissions,approvals:plan.approvals,jobFields:plan.jobFields,leaveFields:plan.leaveFields,compensationFields:plan.compensationFields,reports:plan.reports,documentCategories:plan.documentCategories,otherFields:plan.otherFields,selfFields:plan.selfFields,followOwnChanges:plan.followOwnChanges,scope:plan.scope,name:plan.name} : row}
 const scopedRights=async(member: Record<string,any>,ids: string[],stored=false)=>Promise.all(ids.map(id=>stored ? data.levels.find(l=>l.id===id)! : define(id)).filter(l=>l.scope.kind!=='everyone'&&l.permissions.length).map(async l=>({name:l.name,scope:l.scope,permissions:[...l.permissions].sort(),reach:(await scopeMembers(env,actor.today,l.scope,member.person_id)).size})))
 for(const member of affected) {
  const before=await effectivePermissions(env,member.id)
  const beforeLevels=data.assignments.filter(a=>a.member_id===member.id).map(a=>a.level_id).sort()
  const ids=plan.kind==='revert' ? plan.assignments.find(a=>a.member===member.id)!.levels : plan.kind!=='level' ? plan.levels : data.assignments.filter(a=>a.member_id===member.id).map(a=>a.level_id)
  const direct=await all(env,'SELECT permission FROM wl_permissions WHERE member_id=?',member.id)
  const after=[...new Set([...direct.map(p=>p.permission), ...ids.map(define).filter(l=>l.scope.kind==='everyone').flatMap(l=>l.permissions)])].sort()
  const beforeScoped=await scopedRights(member,beforeLevels,true), afterScoped=await scopedRights(member,ids)
  const beforeSelf=combineSelfRules(data.assignments.filter(a=>a.member_id===member.id).map(a=>data.levels.find(l=>l.id===a.level_id)!.selfFields))
  const afterSelf=combineSelfRules(ids.map(id=>define(id).selfFields))
  const beforeFollow=beforeLevels.some(id=>data.levels.find(l=>l.id===id)!.followOwnChanges)
  const afterFollow=ids.some(id=>define(id).followOwnChanges)
  const otherRights=async(stored: boolean, selected: string[])=>Promise.all(selected.map(id=>stored ? data.levels.find(l=>l.id===id)! : define(id)).filter(l=>Object.values(l.otherFields).some(mode=>mode!=='none')).map(async l=>({name:l.name,fields:l.otherFields,scope:l.scope,reach:l.scope.kind==='everyone' ? 'everyone except themselves' : (await scopeMembers(env,actor.today,l.scope,member.person_id)).size})))
  const beforeOther=await otherRights(true,beforeLevels), afterOther=await otherRights(false,ids)
  const docs=(selected:string[],stored=false)=>selected.map(id=>stored?data.levels.find(l=>l.id===id)!:define(id)).filter(l=>Object.values(l.documentCategories.self).some(mode=>mode!=='none')||Object.values(l.documentCategories.others).some(mode=>mode!=='none')).map(l=>({name:l.name,scope:l.scope,rules:l.documentCategories}))
  const beforeDocuments=docs(beforeLevels,true),afterDocuments=docs(ids)
  const selectedReports=(selected:string[],stored=false)=>selected.map(id=>stored?data.levels.find(l=>l.id===id)!:define(id)).filter(l=>l.reports.length).map(l=>({name:l.name,reports:l.reports,scope:l.scope}))
  const jobs=(selected:string[],stored=false)=>selected.map(id=>stored?data.levels.find(l=>l.id===id)!:define(id)).filter(l=>Object.values(l.jobFields.self).some(mode=>mode!=='none')||Object.values(l.jobFields.others).some(mode=>mode!=='none')).map(l=>({name:l.name,scope:l.scope,fields:l.jobFields}))
  const leaveRights=(selected:string[],stored=false)=>selected.map(id=>stored?data.levels.find(l=>l.id===id)!:define(id)).filter(l=>Object.values(l.leaveFields.self).some(mode=>mode!=='none')||Object.values(l.leaveFields.others).some(mode=>mode!=='none')).map(l=>({name:l.name,scope:l.scope,fields:l.leaveFields}))
  const compensationRights=(selected:string[],stored=false)=>selected.map(id=>stored?data.levels.find(l=>l.id===id)!:define(id)).filter(l=>Object.values(l.compensationFields.self).some(mode=>mode!=='none')||Object.values(l.compensationFields.others).some(mode=>mode!=='none')).map(l=>({name:l.name,scope:l.scope,fields:l.compensationFields}))
  const approvalRights=(selected:string[],stored=false)=>selected.map(id=>({id,definition:stored?data.levels.find(l=>l.id===id)!:define(id)})).filter(({definition})=>definition.approvals.length).map(({id,definition})=>({level:id,name:definition.name,scope:definition.scope,approvals:definition.approvals}))
  const beforeApprovalGrants=approvalRights(beforeLevels,true),afterApprovalGrants=approvalRights(ids)
  const beforeApprovals=[...new Set(beforeApprovalGrants.flatMap(grant=>grant.approvals))].sort(),afterApprovals=[...new Set(afterApprovalGrants.flatMap(grant=>grant.approvals))].sort()
  impact.push({beforeApprovals,afterApprovals,beforeApprovalGrants,afterApprovalGrants,addedApprovals:afterApprovals.filter(key=>!beforeApprovals.includes(key)),removedApprovals:beforeApprovals.filter(key=>!afterApprovals.includes(key)),beforeLeave:leaveRights(beforeLevels,true),afterLeave:leaveRights(ids),beforeCompensation:compensationRights(beforeLevels,true),afterCompensation:compensationRights(ids),beforeJob:jobs(beforeLevels,true),afterJob:jobs(ids),beforeReports:selectedReports(beforeLevels,true),afterReports:selectedReports(ids),beforeDocuments,afterDocuments,beforeOther,afterOther,beforeFollow,afterFollow,beforeScoped,afterScoped,beforeLevels,afterLevels:ids,levelVersions:Object.fromEntries([...new Set([...beforeLevels,...ids])].map(id=>[id,data.levels.find(l=>l.id===id)!.version])),beforeSelf,afterSelf,changedFields:SELF_FIELDS.filter(field=>beforeSelf[field]!==afterSelf[field]),member:member.id,name:member.name,before,after,added:after.filter(p=>!before.includes(p)),removed:before.filter(p=>!after.includes(p))})
 }
 const pendingApprovalImpact=await approvalImpact(env,actor,plan,data)
 const id=newId()
 await env.DB.batch([guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),stmt(env,'INSERT INTO wl_level_reviews(id,actor,snapshot,plan,impact,needs_approval,approval_impact) VALUES(?,?,?,?,?,?,?)',id,actor.id,snapshot,JSON.stringify(plan),JSON.stringify(impact),needsApproval?1:0,JSON.stringify(pendingApprovalImpact)),stmt(env,'DELETE FROM wl_guard')])
 return {id,plan,impact,needsApproval,approvalImpact:pendingApprovalImpact}
}

export async function levelReview(env: Bindings, actor: Actor, id: string) {
 requireLevelAdmin(actor)
 const row=await one<{id:string;actor:string;snapshot:number;consumed:number;plan:string;impact:string;needs_approval:number;approval_impact:string}>(env,'SELECT * FROM wl_level_reviews WHERE id=?',id)
 insist(row && (row.actor===actor.id || row.needs_approval),'review_not_found',404)
 return {...row,needsApproval:!!row.needs_approval,plan:JSON.parse(row.plan),impact:JSON.parse(row.impact),approvalImpact:JSON.parse(row.approval_impact)}
}

export async function applyLevel(env: Bindings, actor: Actor, input: Input, request: Request) {
 try {return await applyReviewedLevel(env,actor,input,request)}
 catch(error) {if(!actor.owner && error instanceof WillowError) await auditRead(env,actor.id,'level.denied',actor.id,{code:error.code,operation:'apply'});throw error}
}
async function applyReviewedLevel(env: Bindings, actor: Actor, input: Input, request: Request) {
 actor=await currentLevelAdmin(env,actor)
 input.only(['review','returnTo'])
 const review=await levelReview(env,actor,input.text('review')), plan=review.plan as Plan
 insist(!review.consumed,'review_consumed',409)
 // A pre-field-rules preview cannot authorize replacing rules it never showed.
 insist(plan.kind!=='level'||(Array.isArray(plan.approvals) && plan.leaveFields && plan.compensationFields && plan.jobFields && Array.isArray(plan.reports) && plan.documentCategories && plan.otherFields && plan.selfFields && typeof plan.followOwnChanges==='boolean' && plan.scope),'review_stale',409)
 insist(review.impact.every((item:Record<string,unknown>)=>Array.isArray(item.beforeApprovals)&&Array.isArray(item.afterApprovals)&&Array.isArray(item.beforeLeave)&&Array.isArray(item.afterLeave)&&Array.isArray(item.beforeCompensation)&&Array.isArray(item.afterCompensation)),'review_stale',409)
 insist((await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq===review.snapshot,'review_stale',409)
 const data=await levels(env,actor)
 insist(plan.kind!=='level'||plan.reports.every(id=>data.reportChoices.some(report=>report.id===id)),'review_stale',409)
 const creator=review.actor===actor.id ? actor : await currentLevelAdmin(env,{...actor,id:review.actor})
 await validateDelegation(env,creator,plan,data)
 await validateDelegation(env,actor,plan,data)
 insist(!review.needsApproval || actor.owner || actor.id!==review.actor,'second_administrator_required',403)
 if(plan.kind==='revert') await revertPlan(env,actor,plan.batch,await levels(env,actor))
 // Native grants and Base administrator transitions share one transaction.
 // Base's version/last-owner triggers remain authoritative and revoke prior sessions on transitions.
 const operators=await operatorAuth(env).listOperators(request)
 const statements=[levelSessionFence(env,actor),guard(env,'access_changed',"EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=? AND m.status='active' AND o.status='active')",creator.id),guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',review.snapshot),guard(env,'stale','EXISTS(SELECT 1 FROM wl_level_reviews WHERE id=? AND consumed=0)',review.id)]
 for(const impact of review.impact) {
  const member=data.members.find(m=>m.id===impact.member)!
  const operator=operators.find(o=>o.email.toLowerCase()===member.email)
  if(operator && operator.role!=='owner') {
   const role=impact.after.includes('people.manage')?'admin':'member'
   if(operator.role!==role) statements.push(guard(env,'access_changed',"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role!='owner')",operator.id,operator.version),stmt(env,"UPDATE oa_operators SET role=? WHERE id=? AND role!='owner'",role,operator.id))
  }
 }
 if(plan.kind==='level') statements.push(
  stmt(env,'INSERT INTO wl_levels(id,name,follow_own_changes,scope_kind) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,follow_own_changes=excluded.follow_own_changes,scope_kind=excluded.scope_kind,version=version+1',plan.level,plan.name,plan.followOwnChanges?1:0,plan.scope.kind),
  stmt(env,'DELETE FROM wl_level_scope_values WHERE level_id=?',plan.level),
  ...(plan.scope.kind==='group' ? Object.entries(plan.scope.dimensions).flatMap(([dimension,values])=>values.map(value=>stmt(env,'INSERT INTO wl_level_scope_values(level_id,dimension,value) VALUES(?,?,?)',plan.level,dimension,value))) : []),
  stmt(env,'DELETE FROM wl_level_approvals WHERE level_id=?',plan.level),
  ...plan.approvals.map(approval=>stmt(env,'INSERT INTO wl_level_approvals(level_id,approval) VALUES(?,?)',plan.level,approval)),
  stmt(env,'DELETE FROM wl_level_leave_fields WHERE level_id=?',plan.level),
  ...(['self','others'] as const).flatMap(relation=>Object.entries(plan.leaveFields[relation]).map(([field,mode])=>stmt(env,'INSERT INTO wl_level_leave_fields(level_id,relation,field,mode) VALUES(?,?,?,?)',plan.level,relation,field,mode))),
  stmt(env,'DELETE FROM wl_level_compensation_fields WHERE level_id=?',plan.level),
  ...(['self','others'] as const).flatMap(relation=>Object.entries(plan.compensationFields[relation]).map(([field,mode])=>stmt(env,'INSERT INTO wl_level_compensation_fields(level_id,relation,field,mode) VALUES(?,?,?,?)',plan.level,relation,field,mode))),
  stmt(env,'DELETE FROM wl_level_job_fields WHERE level_id=?',plan.level),
  ...(['self','others'] as const).flatMap(relation=>Object.entries(plan.jobFields[relation]).map(([field,mode])=>stmt(env,'INSERT INTO wl_level_job_fields(level_id,relation,field,mode) VALUES(?,?,?,?)',plan.level,relation,field,mode))),
  stmt(env,'DELETE FROM wl_level_permissions WHERE level_id=?',plan.level),
  stmt(env,'DELETE FROM wl_level_reports WHERE level_id=?',plan.level),
  ...plan.reports.filter(report=>!builtinReport(report)).map(report=>stmt(env,'INSERT INTO wl_level_reports(level_id,report_id) VALUES(?,?)',plan.level,report)),
  stmt(env,'DELETE FROM wl_level_builtin_reports WHERE level_id=?',plan.level),
  ...plan.reports.filter(report=>!!builtinReport(report)).map(report=>stmt(env,'INSERT INTO wl_level_builtin_reports(level_id,report_id) VALUES(?,?)',plan.level,report)),
  stmt(env,'DELETE FROM wl_level_document_categories WHERE level_id=?',plan.level),
  ...(['self','others'] as const).flatMap(relation=>Object.entries(plan.documentCategories[relation]).map(([category,mode])=>stmt(env,'INSERT INTO wl_level_document_categories(level_id,relation,category_id,mode) VALUES(?,?,?,?)',plan.level,relation,category,mode))),
  stmt(env,'DELETE FROM wl_level_other_fields WHERE level_id=?',plan.level),
  ...Object.entries(plan.otherFields).map(([field,mode])=>stmt(env,'INSERT INTO wl_level_other_fields(level_id,field,mode) VALUES(?,?,?)',plan.level,field,mode)),
  stmt(env,'DELETE FROM wl_level_self_fields WHERE level_id=?',plan.level),
  ...Object.entries(plan.selfFields).map(([field,mode])=>stmt(env,'INSERT INTO wl_level_self_fields(level_id,field,mode) VALUES(?,?,?)',plan.level,field,mode)),
  ...plan.permissions.map(p=>stmt(env,'INSERT INTO wl_level_permissions(level_id,permission,granted_by,granted_at) VALUES(?,?,?,?)',plan.level,p,actor.id,now())),
 )
 else {
  const assignments=plan.kind==='revert' ? plan.assignments : (plan.kind==='assignment' ? [plan.member] : plan.members).map(member=>({member,levels:plan.levels}))
  for(const assignment of assignments) statements.push(stmt(env,'DELETE FROM wl_member_levels WHERE member_id=?',assignment.member),...assignment.levels.map(level=>stmt(env,'INSERT INTO wl_member_levels(member_id,level_id) VALUES(?,?)',assignment.member,level)))
 }
 statements.push(stmt(env,'UPDATE wl_level_reviews SET consumed=1 WHERE id=?',review.id))
 const id=plan.kind==='level'?plan.level:plan.kind==='assignment'?plan.member:plan.kind==='revert'?plan.batch:review.id
 await commit(env,statements,{actor:actor.id,action:`level.${plan.kind}`,subject:id,detail:{plan,impact:review.impact.map((item:Record<string,unknown>)=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='name'))),requestedBy:review.actor}})
 return {id}
}
