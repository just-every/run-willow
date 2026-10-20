// Goals and their evidence live independently of review cycles. Permission is
// always today's scope; a former manager never inherits a historical grant.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, commit, guard, insist, json, newId, now, one, stmt } from '../core'
import { requireDate } from '../dates'
import type { Input } from '../input'

const currentManagers = `WITH current_managers AS (
 SELECT p.person_id,t.manager_person_id FROM wl_periods p JOIN wl_terms t ON t.period_id=p.id
 WHERE p.start_date<=?1 AND (p.end_date IS NULL OR p.end_date>=?1)
 AND t.status='active' AND t.effective_from=(SELECT MAX(n.effective_from) FROM wl_terms n
 WHERE n.period_id=p.id AND n.status='active' AND n.effective_from<=?1)
)`
const activeMember = `EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email
 WHERE m.id=? AND m.status='active' AND o.status='active')`
const scopedOwner = `EXISTS(SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email
 WHERE m.id=? AND m.status='active' AND o.status='active' AND (m.person_id=? OR o.role='owner'
 OR EXISTS(SELECT 1 FROM wl_permissions permission WHERE permission.member_id=m.id AND permission.permission='people.manage')
 OR EXISTS(SELECT 1 FROM wl_periods p JOIN wl_terms t ON t.period_id=p.id
  WHERE p.person_id=? AND p.start_date<=? AND (p.end_date IS NULL OR p.end_date>=?)
  AND t.status='active' AND t.effective_from=(SELECT MAX(n.effective_from) FROM wl_terms n
   WHERE n.period_id=p.id AND n.status='active' AND n.effective_from<=?) AND t.manager_person_id=m.person_id)))`

function inScope(actor: Actor, person: string, manager: string | null) {
 return can(actor,'people.manage') || actor.personId===person || (!!actor.personId && actor.personId===manager)
}

// Recheck manager scope inside the business batch, including a transfer which
// commits after the page/read but before this write.
function scopeGuard(env: Bindings, actor: Actor, person: string) {
 return guard(env,'goal_scope_changed',`? OR EXISTS(SELECT 1 FROM wl_periods p JOIN wl_terms t ON t.period_id=p.id
 WHERE p.person_id=? AND p.start_date<=? AND (p.end_date IS NULL OR p.end_date>=?)
 AND t.status='active' AND t.effective_from=(SELECT MAX(n.effective_from) FROM wl_terms n
 WHERE n.period_id=p.id AND n.status='active' AND n.effective_from<=?) AND t.manager_person_id=?)`,
 can(actor,'people.manage') || actor.personId===person ? 1 : 0, person, actor.today, actor.today, actor.today, actor.personId)
}

async function scopedGoal(env: Bindings, actor: Actor, id: string) {
 const row=await one(env,`${currentManagers} SELECT g.*,m.manager_person_id FROM wl_goals g
 LEFT JOIN current_managers m ON m.person_id=g.person_id WHERE g.id=?2`,actor.today,id)
 insist(row && inScope(actor,row.person_id,row.manager_person_id),'not_found',404)
 return row
}

export async function goalHome(env: Bindings, actor: Actor) {
 const [people, members, rows]=await Promise.all([
  all(env,`${currentManagers} SELECT p.id,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS name,m.manager_person_id
   FROM wl_people p LEFT JOIN current_managers m ON m.person_id=p.id ORDER BY name`,actor.today),
  all(env,`SELECT m.id,m.name,m.person_id,(o.role='owner' OR EXISTS(SELECT 1 FROM wl_permissions permission
   WHERE permission.member_id=m.id AND permission.permission='people.manage')) AS manages_people
   FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email
   WHERE m.status='active' AND o.status='active' ORDER BY m.name`),
  all(env,`${currentManagers} SELECT g.*,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS person_name,
   owner.name AS owner_name,manager.manager_person_id,c.evidence,c.completed_by,c.completed_at
   FROM wl_goals g JOIN wl_people p ON p.id=g.person_id LEFT JOIN wl_members owner ON owner.id=g.owner_member
   LEFT JOIN current_managers manager ON manager.person_id=g.person_id
   LEFT JOIN wl_goal_completions c ON c.goal_id=g.id ORDER BY g.due_date,g.created_at,g.id`,actor.today),
 ])
 const scoped=rows.filter(g=>inScope(actor,g.person_id,g.manager_person_id))
 const ids=new Set(scoped.map(g=>g.id))
 const checkins=ids.size ? await all(env,`SELECT c.*,m.name AS author_name FROM wl_goal_checkins c
  JOIN wl_members m ON m.id=c.author WHERE c.goal_id IN (${[...ids].map(()=>'?').join(',')}) ORDER BY c.seq`,...ids) : []
 const activeActor=members.some(m=>m.id===actor.id)
 return {
  people:people.filter(p=>inScope(actor,p.id,p.manager_person_id)).map(p=>({id:p.id,name:p.name})),
  members:members.map(m=>({id:m.id,name:m.name,personId:m.person_id,managesPeople:!!m.manages_people})),
  goals:scoped.map(g=>({id:g.id,personId:g.person_id,personName:g.person_name,title:g.title,
   milestones:json<string[]>(g.milestones_json,[]),dueDate:g.due_date,development:!!g.development,
   owner:g.owner_member,ownerName:g.owner_name,createdAt:g.created_at,
   checkins:checkins.filter(c=>c.goal_id===g.id).map(c=>({id:c.id,progress:c.progress,note:c.note,author:c.author,authorName:c.author_name,createdAt:c.created_at})),
   completion:g.evidence===null ? null : {evidence:g.evidence,completedBy:g.completed_by,completedAt:g.completed_at},
   mayCheckin:g.evidence===null,
   mayComplete:!!g.development && g.evidence===null && (can(actor,'people.manage') || (activeActor && g.owner_member===actor.id)),
  })),
 }
}

export async function saveGoal(env: Bindings, actor: Actor, input: Input) {
 input.only(['returnTo','person','title','milestones','dueDate','development','owner'])
 const person=input.text('person'),title=input.text('title',{max:300})
 const due=requireDate(input.text('dueDate'),'invalid_dueDate'),development=input.flag('development')
 const milestones=input.list('milestones')
 insist(milestones.length<=30 && milestones.every(m=>m.length<=300),'invalid_milestones')
 const owner=input.text('owner',{optional:!development}) || null
 const row=await one(env,`${currentManagers} SELECT p.id,m.manager_person_id FROM wl_people p
  LEFT JOIN current_managers m ON m.person_id=p.id WHERE p.id=?2`,actor.today,person)
 insist(row && inScope(actor,person,row.manager_person_id),'not_found',404)
 const ownerParams=[owner,person,person,actor.today,actor.today,actor.today]
 if(owner) insist(await one(env,`SELECT 1 WHERE ${scopedOwner}`,...ownerParams),'invalid_owner')
 const id=newId()
 await commit(env,[scopeGuard(env,actor,person),
  ...(owner ? [guard(env,'goal_owner_scope_changed',scopedOwner,...ownerParams)] : []),
  stmt(env,`INSERT INTO wl_goals(id,person_id,title,milestones_json,due_date,development,owner_member,created_by,created_at)
   VALUES(?,?,?,?,?,?,?,?,?)`,id,person,title,JSON.stringify(milestones),due,development?1:0,owner,actor.id,now()),
 ],{actor:actor.id,action:'goal.create',subject:id,detail:{person,development}})
 return {id}
}

export async function checkinGoal(env: Bindings, actor: Actor, input: Input) {
 input.only(['returnTo','goal','progress','note'])
 const id=input.text('goal'),progress=input.integer('progress',{min:0,max:100})!
 const note=input.text('note',{max:4000})
 const goal=await scopedGoal(env,actor,id),checkin=newId()
 await commit(env,[scopeGuard(env,actor,goal.person_id),
  guard(env,'goal_completed','NOT EXISTS(SELECT 1 FROM wl_goal_completions WHERE goal_id=?)',id),
  stmt(env,'INSERT INTO wl_goal_checkins(id,goal_id,author,progress,note,created_at) VALUES(?,?,?,?,?,?)',checkin,id,actor.id,progress,note,now()),
 ],{actor:actor.id,action:'goal.checkin',subject:id,detail:{checkin,progress}})
 return {id,checkin}
}

export async function finishDevelopment(env: Bindings, actor: Actor, input: Input) {
 input.only(['returnTo','goal','evidence'])
 const id=input.text('goal'),evidence=input.text('evidence',{max:4000})
 insist(evidence.length>=3,'invalid_evidence')
 const goal=await scopedGoal(env,actor,id)
 insist(goal.development,'not_development')
 insist(can(actor,'people.manage') || goal.owner_member===actor.id,'forbidden',403)
 await commit(env,[scopeGuard(env,actor,goal.person_id),
  guard(env,'goal_owner_inactive',activeMember,actor.id),
  guard(env,'goal_completed','NOT EXISTS(SELECT 1 FROM wl_goal_completions WHERE goal_id=?)',id),
  stmt(env,'INSERT INTO wl_goal_completions(goal_id,evidence,completed_by,completed_at) VALUES(?,?,?,?)',id,evidence,actor.id,now()),
 ],{actor:actor.id,action:'goal.complete',subject:id})
 return {id}
}
