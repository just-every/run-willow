import { leaveRuleRows, type LeaveRules } from './leave'
import { compensationRuleRows, type CompensationRules } from './compensation'
import { jobRuleRows, emptyJobRules } from './job'
import type { Bindings } from '../../auth.server'
import { requireLevelAdmin, type Actor, type Permission } from '../actor'
import { all } from '../core'
import { reportChoices } from './reports'
import { documentRuleRows } from './documents'
import type { OtherRules } from './other-personal'
import type { SelfRules } from './personal'
import { EVERYONE, levelScopes } from './scope'

export async function levels(env: Bindings, actor: Actor) {
 requireLevelAdmin(actor)
 const [rows, grants, assignments, members, migration, fields, scopes, otherFields, documentFields] = await Promise.all([
  all<{id:string;name:string;version:number;follow_own_changes:number}>(env,'SELECT * FROM wl_levels ORDER BY name'),
  all(env,'SELECT level_id,permission FROM wl_level_permissions ORDER BY permission'),
  all(env,'SELECT * FROM wl_member_levels ORDER BY member_id,level_id'),
  all(env,`SELECT m.id,m.email,m.name,m.status,m.person_id, o.role='owner' AS owner FROM wl_members m LEFT JOIN oa_operators o ON lower(o.email)=m.email ORDER BY m.name`),
  all(env,'SELECT * FROM wl_level_migration ORDER BY name'),
  all(env,'SELECT * FROM wl_level_self_fields ORDER BY field'),
  levelScopes(env),
  all(env,'SELECT * FROM wl_level_other_fields ORDER BY field'),
  documentRuleRows(env),
 ])
 const batches=await all<{id:string;impact:string;at:number;reverted:number}>(env,`SELECT r.id,r.impact,a.at,
  EXISTS(SELECT 1 FROM wl_audit undo WHERE undo.action='level.revert' AND undo.subject=r.id) AS reverted
  FROM wl_level_reviews r JOIN wl_audit a ON a.subject=r.id AND a.action='level.bulk-assignment'
  WHERE r.consumed=1 ORDER BY a.seq DESC LIMIT 20`)
 const [jobRows,leaveRows,compensationRows]=await Promise.all([jobRuleRows(env),leaveRuleRows(env),compensationRuleRows(env)])
 const reportRows=await all<{level_id:string;report_id:string}>(env,'SELECT * FROM wl_level_reports ORDER BY report_id')
 const approvals=await all<{id:string;name:string}>(env,`SELECT r.id,m.name FROM wl_level_reviews r JOIN wl_members m ON m.id=r.actor WHERE r.needs_approval=1 AND r.consumed=0 AND r.actor!=? ORDER BY r.rowid DESC LIMIT 30`,actor.id)
 return {reportChoices:await reportChoices(env,actor),approvals,batches:batches.map(batch=>({...batch,impact:JSON.parse(batch.impact)})), levels: rows.map(row=>({...row, leaveFields: {self:Object.fromEntries(leaveRows.filter(f=>f.level_id===row.id&&f.relation==='self').map(f=>[f.field,f.mode])),others:Object.fromEntries(leaveRows.filter(f=>f.level_id===row.id&&f.relation==='others').map(f=>[f.field,f.mode]))} as LeaveRules, compensationFields: {self:Object.fromEntries(compensationRows.filter(f=>f.level_id===row.id&&f.relation==='self').map(f=>[f.field,f.mode])),others:Object.fromEntries(compensationRows.filter(f=>f.level_id===row.id&&f.relation==='others').map(f=>[f.field,f.mode]))} as CompensationRules, jobFields: {self:Object.fromEntries(jobRows.filter(f=>f.level_id===row.id&&f.relation==='self').map(f=>[f.field,f.mode])),others:Object.fromEntries(jobRows.filter(f=>f.level_id===row.id&&f.relation==='others').map(f=>[f.field,f.mode]))} as ReturnType<typeof emptyJobRules>, followOwnChanges:!!row.follow_own_changes, reports:reportRows.filter(r=>r.level_id===row.id).map(r=>r.report_id), documentCategories: {self:Object.fromEntries(documentFields.filter(f=>f.level_id===row.id&&f.relation==='self').map(f=>[f.category_id,f.mode])),others:Object.fromEntries(documentFields.filter(f=>f.level_id===row.id&&f.relation==='others').map(f=>[f.category_id,f.mode]))}, otherFields: Object.fromEntries(otherFields.filter(f=>f.level_id===row.id).map(f=>[f.field,f.mode])) as OtherRules, scope:scopes.get(row.id) ?? EVERYONE, selfFields: Object.fromEntries(fields.filter(f=>f.level_id===row.id).map(f=>[f.field,f.mode])) as SelfRules, permissions: grants.filter(p=>p.level_id===row.id).map(p=>p.permission as Permission), members: assignments.filter(a=>a.level_id===row.id).map(a=>a.member_id)})), assignments, members, migration }
}

export async function effectivePermissions(env: Bindings, member: string) {
 return (await all(env,'SELECT permission FROM wl_effective_permissions WHERE member_id=? ORDER BY permission',member)).map(p=>p.permission as Permission)
}
