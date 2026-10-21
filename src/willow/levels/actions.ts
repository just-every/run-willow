// Reviews bind the owner, the complete audited snapshot, the exact change and one use.
import { operatorAuth, type Bindings } from '../../auth.server'
import { PERMISSIONS, requireOwner, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt } from '../core'
import type { Input } from '../input'
import { effectivePermissions, levels } from './store'
import { bulkSelection } from './selection'
import { revertPlan, type RevertPlan } from './revert'
import { combineSelfRules, readSelfRules, SELF_FIELDS, type SelfRules } from './personal'

type Plan = { kind: 'level'; level: string; name: string; permissions: string[]; selfFields: SelfRules; followOwnChanges: boolean } | { kind: 'assignment'; member: string; levels: string[] } | { kind: 'bulk-assignment'; members: string[]; levels: string[]; filter?: Record<string,string> } | RevertPlan

export async function previewLevel(env: Bindings, actor: Actor, input: Input) {
 requireOwner(actor)
 input.only(['kind','level','name','permissions','member','members','levels','returnTo','selfFields','followOwnChanges','selection','q','location','department','role','status','batch',...SELF_FIELDS.map(field=>`selfMode.${field}`)])
 const snapshot=(await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const data=await levels(env,actor), kind=input.text('kind')
 let plan: Plan
 if(kind==='level') {
  const level=input.text('level',{optional:true}) || newId(), name=input.text('name',{max:120})
  const permissions=[...new Set(input.list('permissions'))].sort()
  insist(permissions.every(p=>(PERMISSIONS as readonly string[]).includes(p)),'invalid_permissions')
  insist(!data.levels.some(row=>row.name===name && row.id!==level),'level_name_used',409)
  if(input.has('level')) insist(data.levels.some(row=>row.id===level),'level_not_found',404)
  const selfFields=readSelfRules(input) ?? data.levels.find(row=>row.id===level)?.selfFields ?? {}
  const followOwnChanges=input.provided('followOwnChanges') ? input.flag('followOwnChanges') : data.levels.find(row=>row.id===level)?.followOwnChanges ?? false
  plan={kind,level,name,permissions,selfFields,followOwnChanges}
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
 const affected=data.members.filter(m=>plan.kind==='level' ? !m.owner && data.assignments.some(a=>a.member_id===m.id && a.level_id===plan.level) : plan.kind==='assignment' ? m.id===plan.member : plan.kind==='revert' ? plan.assignments.some(a=>a.member===m.id) : plan.members.includes(m.id))
 const impact=[]
 for(const member of affected) {
  const before=await effectivePermissions(env,member.id)
  const beforeLevels=data.assignments.filter(a=>a.member_id===member.id).map(a=>a.level_id).sort()
  const ids=plan.kind==='revert' ? plan.assignments.find(a=>a.member===member.id)!.levels : plan.kind!=='level' ? plan.levels : data.assignments.filter(a=>a.member_id===member.id).map(a=>a.level_id)
  const direct=await all(env,'SELECT permission FROM wl_permissions WHERE member_id=?',member.id)
  const after=[...new Set([...direct.map(p=>p.permission), ...ids.flatMap(id=>plan.kind==='level'&&id===plan.level ? plan.permissions : data.levels.find(l=>l.id===id)!.permissions)])].sort()
  const beforeSelf=combineSelfRules(data.assignments.filter(a=>a.member_id===member.id).map(a=>data.levels.find(l=>l.id===a.level_id)!.selfFields))
  const afterSelf=combineSelfRules(ids.map(id=>plan.kind==='level'&&id===plan.level ? plan.selfFields : data.levels.find(l=>l.id===id)!.selfFields))
  const beforeFollow=beforeLevels.some(id=>data.levels.find(l=>l.id===id)!.followOwnChanges)
  const afterFollow=ids.some(id=>plan.kind==='level'&&id===plan.level ? plan.followOwnChanges : data.levels.find(l=>l.id===id)!.followOwnChanges)
  impact.push({beforeFollow,afterFollow,beforeLevels,afterLevels:ids,levelVersions:Object.fromEntries([...new Set([...beforeLevels,...ids])].map(id=>[id,data.levels.find(l=>l.id===id)!.version])),beforeSelf,afterSelf,changedFields:SELF_FIELDS.filter(field=>beforeSelf[field]!==afterSelf[field]),member:member.id,name:member.name,before,after,added:after.filter(p=>!before.includes(p)),removed:before.filter(p=>!after.includes(p))})
 }
 const id=newId()
 await env.DB.batch([guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),stmt(env,'INSERT INTO wl_level_reviews(id,actor,snapshot,plan,impact) VALUES(?,?,?,?,?)',id,actor.id,snapshot,JSON.stringify(plan),JSON.stringify(impact)),stmt(env,'DELETE FROM wl_guard')])
 return {id,plan,impact}
}

export async function levelReview(env: Bindings, actor: Actor, id: string) {
 requireOwner(actor)
 const row=await one<{id:string;actor:string;snapshot:number;consumed:number;plan:string;impact:string}>(env,'SELECT * FROM wl_level_reviews WHERE id=? AND actor=?',id,actor.id)
 insist(row,'review_not_found',404)
 return {...row,plan:JSON.parse(row.plan),impact:JSON.parse(row.impact)}
}

export async function applyLevel(env: Bindings, actor: Actor, input: Input, request: Request) {
 requireOwner(actor)
 input.only(['review','returnTo'])
 const review=await levelReview(env,actor,input.text('review')), plan=review.plan as Plan
 insist(!review.consumed,'review_consumed',409)
 // A pre-field-rules preview cannot authorize replacing rules it never showed.
 insist(plan.kind!=='level'||(plan.selfFields && typeof plan.followOwnChanges==='boolean'),'review_stale',409)
 insist((await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq===review.snapshot,'review_stale',409)
 if(plan.kind==='revert') await revertPlan(env,actor,plan.batch,await levels(env,actor))
 // Base administration follows the existing people.manage grant; Base revokes
 // sessions on an admin-role transition just as member.permissions does.
 const operators=await operatorAuth(env).listOperators(request)
 for(const impact of review.impact) {
  const member=await one(env,'SELECT email FROM wl_members WHERE id=?',impact.member)
  const operator=operators.find(o=>o.email.toLowerCase()===member!.email)
  if(operator && operator.role!=='owner') {
   const role=impact.after.includes('people.manage')?'admin':'member'
   if(operator.role!==role) await operatorAuth(env).setRole(request,operator.id,role)
  }
 }
 const statements=[guard(env,'stale','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',review.snapshot),guard(env,'stale','EXISTS(SELECT 1 FROM wl_level_reviews WHERE id=? AND consumed=0)',review.id)]
 if(plan.kind==='level') statements.push(
  stmt(env,'INSERT INTO wl_levels(id,name,follow_own_changes) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,follow_own_changes=excluded.follow_own_changes,version=version+1',plan.level,plan.name,plan.followOwnChanges?1:0),
  stmt(env,'DELETE FROM wl_level_permissions WHERE level_id=?',plan.level),
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
 await commit(env,statements,{actor:actor.id,action:`level.${plan.kind}`,subject:id,detail:{plan,impact:review.impact}})
 return {id}
}
