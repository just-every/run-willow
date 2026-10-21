// Restore only an original, still-independent batch. Never reconstruct prior rights from today's presets.
import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { all, insist, one } from '../core'
import type { levels } from './store'

export type RevertPlan = {kind:'revert';batch:string;assignments:{member:string;levels:string[]}[]}
const mentions=(value:unknown, ids:Set<string>):boolean=>typeof value==='string' ? ids.has(value) : Array.isArray(value) ? value.some(item=>mentions(item,ids)) : !!value&&typeof value==='object'&&Object.values(value).some(item=>mentions(item,ids))
const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort())

export async function revertPlan(env:Bindings,actor:Actor,batch:string,data:Awaited<ReturnType<typeof levels>>):Promise<RevertPlan> {
 requireOwner(actor)
 const original=await one(env,`SELECT r.*,a.seq FROM wl_level_reviews r JOIN wl_audit a ON a.subject=r.id AND a.action='level.bulk-assignment' WHERE r.id=? AND r.consumed=1`,batch)
 insist(original,'batch_not_found',404)
 const plan=JSON.parse(original.plan), impact=JSON.parse(original.impact)
 insist(plan.kind==='bulk-assignment'&&impact.length&&impact.every((item:any)=>Array.isArray(item.beforeLevels)&&Array.isArray(item.afterLevels)&&item.levelVersions),'batch_not_revertible',409)
 const ids=new Set<string>([batch])
 for(const item of impact) {
  const member=data.members.find(m=>m.id===item.member)
  insist(member?.status==='active'&&!member.owner,'batch_dependency',409)
  ids.add(item.member)
  if(member.person_id) ids.add(member.person_id)
  insist(same(data.assignments.filter(a=>a.member_id===item.member).map(a=>a.level_id),item.afterLevels),'batch_dependency',409)
  for(const [id,version] of Object.entries(item.levelVersions)) {
   insist(data.levels.find(level=>level.id===id)?.version===version,'batch_dependency',409)
  }
 }
 const later=await all(env,'SELECT actor,action,subject,detail FROM wl_audit WHERE seq>? ORDER BY seq',original.seq)
 for(const event of later) {
  // Public read/download/export audits preserve chronology but do not create business dependencies.
  if(/\.(read|download|export)$/.test(event.action)) continue
  insist(!ids.has(event.actor)&&!ids.has(event.subject)&&!mentions(JSON.parse(event.detail),ids),'batch_dependency',409)
 }
 return {kind:'revert',batch,assignments:impact.map((item:any)=>({member:item.member,levels:item.beforeLevels}))}
}
