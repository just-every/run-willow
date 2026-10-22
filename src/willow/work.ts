// Persistent accountability and reviewed scheduling. Work completion belongs to its source.
import type { Bindings } from '../auth.server'
import { employerZone, requirePermission, type Actor } from './actor'
import { all, commit, guard, insist, json, newId, now, one, stmt, type Row } from './core'
import { displayName } from './people'
import { requireDate, today } from './dates'
import type { Input } from './input'
import { workMembers, workSources } from './work-sources'
import { approvalAssignments, workAuthority } from './work-approval'

export async function workPolicy(env: Bindings) {
 const row = await one<Row>(env,'SELECT * FROM wl_work_policy WHERE singleton=1')
 return row ? { quiet_start: row.quiet_start as number, quiet_end: row.quiet_end as number, default_days: row.default_days as number, revision: row.revision as string, offsets: json<number[]>(row.offsets,[]) } : null
}
export const workHistory = (env: Bindings, source: string, actor: string, kind: string, detail: unknown, at=now()) => stmt(env,'INSERT INTO wl_work_history(source,at,actor,kind,detail) VALUES(?,?,?,?,?)',source,at,actor,kind,JSON.stringify(detail))

export async function approveWorkPolicy(env: Bindings, actor: Actor, input: Input) {
 requirePermission(actor,'people.manage')
 const offsets = input.text('offsets',{max:100}).split(',').map(s=>Number(s.trim()))
 insist(offsets.length>0 && offsets.length<=12 && offsets.every((v,i)=>Number.isSafeInteger(v) && v>=0 && v<=365 && (i===0 || v>offsets[i-1])), 'invalid_cadence')
 const start = input.integer('quietStart',{max:23})!, end = input.integer('quietEnd',{max:23})!, days = input.integer('defaultDays',{max:90})!
 const revision = newId()
 await commit(env,[stmt(env,`INSERT INTO wl_work_policy(singleton,offsets,quiet_start,quiet_end,default_days,revision,approved_by,approved_at) VALUES(1,?,?,?,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET offsets=excluded.offsets,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,default_days=excluded.default_days,revision=excluded.revision,approved_by=excluded.approved_by,approved_at=excluded.approved_at`,JSON.stringify(offsets),start,end,days,revision,actor.id,now()),workHistory(env,'policy',actor.id,'policy.approved',{offsets,quietStart:start,quietEnd:end,defaultDays:days})],{actor:actor.id,action:'work.policy.approve',subject:revision})
 for (const source of await workSources(env,days)) {
  if (['proposal','policy','opening','model','receipt','model-failure','notice-failure','identity-failure','identity-token-failure'].includes(source.kind)) await stmt(env,"UPDATE wl_work_schedule SET due_date=?,revision=? WHERE source=? AND updated_by='system'",source.due,newId(),source.key).run()
 }
 return {id:revision}
}

export async function workState(env: Bindings) {
 const snapshot = (await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const policy = await workPolicy(env), sources = await workSources(env,policy?.default_days ?? 1), members = await workMembers(env)
 for (const source of sources) {
  const owner = members.find(a=>a.id===source.preferred && source.responsible(a)) ?? members.find(source.responsible) ?? (source.approval ? undefined : members.find(source.visible))
  const substitute = members.find(a=>a.id!==owner?.id && workAuthority(source,a))
  const created = await stmt(env,`INSERT OR IGNORE INTO wl_work_schedule(source,owner,substitute,due_date,next_action,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?)`,source.key,owner?.id??null,substitute?.id??null,source.due,source.next,newId(),'system',now()).run()
  if (created.meta.changes) await workHistory(env,source.key,'system','work.opened',{owner:owner?.id??null,substitute:substitute?.id??null,dueDate:source.due}).run()
 }
 const schedules = new Map((await all(env,'SELECT * FROM wl_work_schedule')).map(r=>[r.source,r]))
 const reroutes: D1PreparedStatement[] = []
 for (const source of sources.filter(source=>source.approval || source.kind==='change-request')) {
  const current = schedules.get(source.key)!, next = approvalAssignments(source,members,current)
  if (current.owner===next.owner && current.substitute===next.substitute) continue
  const revision = newId()
  reroutes.push(guard(env,'work_changed','EXISTS(SELECT 1 FROM wl_work_schedule WHERE source=? AND revision=?)',source.key,current.revision),
   stmt(env,'UPDATE wl_work_schedule SET owner=?,substitute=?,revision=?,updated_by=?,updated_at=? WHERE source=?',next.owner,next.substitute,revision,'system',now(),source.key),
   workHistory(env,source.key,'system','approval.routed',{before:{owner:current.owner,substitute:current.substitute},after:next,orphaned:next.owner===null}))
  schedules.set(source.key,{...current,...next,revision,updated_by:'system'})
 }
 if(reroutes.length) await commit(env,[guard(env,'access_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),...reroutes],{actor:'system',action:'work.approval.route',subject:'employer',detail:{routes:reroutes.length/3}})
 return {policy,sources,members,schedules}
}

export async function memberUnavailable(env: Bindings, actor: Actor, date: string) {
 if (!actor.personId) return false
 const employed = await one(env,`SELECT 1 FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?)`,actor.personId,date,date)
 if (!employed) return true
 return !!await one(env,"SELECT 1 FROM wl_leave_requests WHERE person_id=? AND status='approved' AND start_date<=? AND end_date>=?",actor.personId,date,date)
}

export async function workList(env: Bindings, actor: Actor) {
 const state = await workState(env), timezone = await employerZone(env), date = today(timezone)
 const items = []
 for (const source of state.sources.filter(s=>s.visible(actor))) {
  const schedule = state.schedules.get(source.key)!
  const owner = state.members.find(a=>a.id===schedule.owner), substitute = state.members.find(a=>a.id===schedule.substitute)
  const unavailable = !owner || !workAuthority(source,owner) || await memberUnavailable(env,owner,date)
  const covered = unavailable && schedule.due_date<date && substitute && workAuthority(source,substitute) && !await memberUnavailable(env,substitute,date)
  const effective = covered ? substitute : unavailable ? null : owner
  const person = source.personId ? await one(env,'SELECT legal_name,preferred_name FROM wl_people WHERE id=?',source.personId) : null
  items.push({person: person ? displayName(person) : null,source:source.key,kind:source.kind,title:source.title,path:source.path,progress:source.progress,dueDate:schedule.due_date,nextAction:schedule.next_action,revision:schedule.revision,owner:schedule.owner,ownerName:owner?.name??(await one(env,'SELECT name FROM wl_members WHERE id=?',schedule.owner))?.name??'No member assigned',substitute:schedule.substitute,substituteName:substitute?.name??null,effectiveOwner:effective?.id??null,coverage:covered?'covered':unavailable?'blocked':'assigned',overdue:schedule.due_date<date,
   orphaned:!!source.approval&&!state.members.some(source.responsible),
   candidates:state.members.filter(member=>workAuthority(source,member)).map(a=>({id:a.id,name:a.name})),
   history:await all(env,'SELECT at,kind,detail FROM wl_work_history WHERE source=? ORDER BY seq',source.key),
   deliveries:await all(env,'SELECT id,step,recipient,status,failure,created_at FROM wl_work_deliveries WHERE source=? ORDER BY created_at,id',source.key)})
 }
 return {policy:state.policy,timezone,items}
}

export async function scheduleWork(env: Bindings, actor: Actor, input: Input) {
 requirePermission(actor,'people.manage')
 const state = await workState(env), key = input.text('source'), source = state.sources.find(s=>s.key===key)
 insist(source && source.visible(actor),'not_found',404)
 const current = state.schedules.get(key)!, revision = input.text('revision'), owner = input.text('owner'), substitute = input.text('substitute',{optional:true})
 insist(state.members.some(a=>a.id===owner && workAuthority(source,a)),'unauthorized_owner',403)
 insist(!substitute || substitute!==owner && state.members.some(a=>a.id===substitute && workAuthority(source,a)),'unauthorized_substitute',403)
 const due = requireDate(input.text('dueDate'),'invalid_dueDate'), next = input.text('nextAction',{max:300})
 await commit(env,[guard(env,'stale','EXISTS(SELECT 1 FROM wl_work_schedule WHERE source=? AND revision=?)',key,revision),stmt(env,'UPDATE wl_work_schedule SET owner=?,substitute=?,due_date=?,next_action=?,revision=?,updated_by=?,updated_at=? WHERE source=?',owner,substitute||null,due,next,newId(),actor.id,now(),key),...(source.kind==='task'?[stmt(env,"UPDATE wl_case_tasks SET due_date=? WHERE id=? AND status='open'",due,source.key.slice(5))]:[]),workHistory(env,key,actor.id,'schedule.changed',{before:{owner:current.owner,substitute:current.substitute,dueDate:current.due_date,nextAction:current.next_action},after:{owner,substitute:substitute||null,dueDate:due,nextAction:next}})],{actor:actor.id,action:'work.schedule',subject:key})
 return {id:key}
}

// Re-read source and member immediately before a delivery. Merely owning work grants no source rights.
export async function freshWork(env: Bindings, key: string, recipient: string, expected: Row) {
 const policy = await workPolicy(env)
 const source = (await workSources(env,policy?.default_days??1)).find(s=>s.key===key)
 const schedule = await one(env,'SELECT * FROM wl_work_schedule WHERE source=?',key)
 const member = (await workMembers(env)).find(a=>a.id===recipient)
 return source && schedule?.revision===expected.revision && member && workAuthority(source,member) ? {source,schedule,member} : null
}
