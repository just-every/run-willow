// Reviews bind the owner, the complete audited snapshot, the exact change and one use.
import { operatorAuth, type Bindings } from '../../auth.server'
import { PERMISSIONS, requireOwner, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt } from '../core'
import type { Input } from '../input'
import { effectivePermissions, levels } from './store'

type Plan = { kind: 'level'; level: string; name: string; permissions: string[] } | { kind: 'assignment'; member: string; levels: string[] }

export async function previewLevel(env: Bindings, actor: Actor, input: Input) {
 requireOwner(actor)
 input.only(['kind','level','name','permissions','member','levels','returnTo'])
 const snapshot=(await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const data=await levels(env,actor), kind=input.text('kind')
 let plan: Plan
 if(kind==='level') {
  const level=input.text('level',{optional:true}) || newId(), name=input.text('name',{max:120})
  const permissions=[...new Set(input.list('permissions'))].sort()
  insist(permissions.every(p=>(PERMISSIONS as readonly string[]).includes(p)),'invalid_permissions')
  insist(!data.levels.some(row=>row.name===name && row.id!==level),'level_name_used',409)
  if(input.has('level')) insist(data.levels.some(row=>row.id===level),'level_not_found',404)
  plan={kind,level,name,permissions}
 } else {
  insist(kind==='assignment','invalid_kind')
  const member=input.text('member'), assigned=[...new Set(input.list('levels'))].sort()
  const target=data.members.find(m=>m.id===member)
  insist(target,'member_not_found',404)
  insist(target.status==='active','access_ended',409)
  insist(!target.owner,'owner_permissions_fixed',409)
  insist(assigned.every(id=>data.levels.some(row=>row.id===id)),'level_not_found',404)
  plan={kind,member,levels:assigned}
 }
 const affected=plan.kind==='assignment' ? data.members.filter(m=>m.id===plan.member) : data.members.filter(m=>data.assignments.some(a=>a.member_id===m.id && a.level_id===plan.level))
 const impact=[]
 for(const member of affected) {
  const before=await effectivePermissions(env,member.id)
  const ids=plan.kind==='assignment' ? plan.levels : data.assignments.filter(a=>a.member_id===member.id).map(a=>a.level_id)
  const direct=await all(env,'SELECT permission FROM wl_permissions WHERE member_id=?',member.id)
  const after=[...new Set([...direct.map(p=>p.permission), ...ids.flatMap(id=>plan.kind==='level'&&id===plan.level ? plan.permissions : data.levels.find(l=>l.id===id)!.permissions)])].sort()
  impact.push({member:member.id,name:member.name,before,after,added:after.filter(p=>!before.includes(p)),removed:before.filter(p=>!after.includes(p))})
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
 insist((await one(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq===review.snapshot,'review_stale',409)
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
  stmt(env,'INSERT INTO wl_levels(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=version+1',plan.level,plan.name),
  stmt(env,'DELETE FROM wl_level_permissions WHERE level_id=?',plan.level),
  ...plan.permissions.map(p=>stmt(env,'INSERT INTO wl_level_permissions(level_id,permission,granted_by,granted_at) VALUES(?,?,?,?)',plan.level,p,actor.id,now())),
 )
 else statements.push(stmt(env,'DELETE FROM wl_member_levels WHERE member_id=?',plan.member),...plan.levels.map(level=>stmt(env,'INSERT INTO wl_member_levels(member_id,level_id) VALUES(?,?)',plan.member,level)))
 statements.push(stmt(env,'UPDATE wl_level_reviews SET consumed=1 WHERE id=?',review.id))
 await commit(env,statements,{actor:actor.id,action:`level.${plan.kind}`,subject:plan.kind==='level'?plan.level:plan.member,detail:{plan,impact:review.impact}})
 return {id:plan.kind==='level'?plan.level:plan.member}
}
