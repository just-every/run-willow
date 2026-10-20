import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor, type Permission } from '../actor'
import { all } from '../core'
import type { SelfRules } from './personal'

export async function levels(env: Bindings, actor: Actor) {
 requireOwner(actor)
 const [rows, grants, assignments, members, migration, fields] = await Promise.all([
  all<{id:string;name:string;version:number}>(env,'SELECT * FROM wl_levels ORDER BY name'),
  all(env,'SELECT level_id,permission FROM wl_level_permissions ORDER BY permission'),
  all(env,'SELECT * FROM wl_member_levels ORDER BY member_id,level_id'),
  all(env,`SELECT m.id,m.name,m.status, o.role='owner' AS owner FROM wl_members m LEFT JOIN oa_operators o ON lower(o.email)=m.email ORDER BY m.name`),
  all(env,'SELECT * FROM wl_level_migration ORDER BY name'),
  all(env,'SELECT * FROM wl_level_self_fields ORDER BY field'),
 ])
 return { levels: rows.map(row=>({...row, selfFields: Object.fromEntries(fields.filter(f=>f.level_id===row.id).map(f=>[f.field,f.mode])) as SelfRules, permissions: grants.filter(p=>p.level_id===row.id).map(p=>p.permission as Permission), members: assignments.filter(a=>a.level_id===row.id).map(a=>a.member_id)})), assignments, members, migration }
}

export async function effectivePermissions(env: Bindings, member: string) {
 return (await all(env,'SELECT permission FROM wl_effective_permissions WHERE member_id=? ORDER BY permission',member)).map(p=>p.permission as Permission)
}
