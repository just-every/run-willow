import { performanceMode } from '../levels/performance'
// Required work carries no review answers, peer identities, ratings or notes.
import type { Bindings } from '../../auth.server'
import { can, employerZone } from '../actor'
import { all } from '../core'
import { today } from '../dates'
import type { WorkSource } from '../work-sources'

export async function performanceWork(env: Bindings): Promise<WorkSource[]> {
 const date=today(await employerZone(env)),sources:WorkSource[]=[]
 const [assignments,cycles,development]=await Promise.all([
  all(env,`SELECT a.id,a.cycle_id,a.person_id,a.member_id,a.due_date FROM wl_review_assignments a
   JOIN wl_review_cycles c ON c.id=a.cycle_id JOIN wl_members m ON m.id=a.member_id
   JOIN oa_operators o ON lower(o.email)=m.email WHERE c.status='open' AND m.status='active' AND o.status='active'
   AND NOT EXISTS(SELECT 1 FROM wl_review_inputs i WHERE i.assignment_id=a.id)`),
  all(env,"SELECT id,due_date FROM wl_review_cycles WHERE status='open'"),
  all(env,`SELECT g.id,g.person_id,g.owner_member,g.due_date,owner.status AS owner_status,o.status AS sign_in,
   (SELECT t.manager_person_id FROM wl_periods p JOIN wl_terms t ON t.period_id=p.id
    WHERE p.person_id=g.person_id AND p.start_date<=?1 AND (p.end_date IS NULL OR p.end_date>=?1)
    AND t.status='active' AND t.effective_from=(SELECT MAX(n.effective_from) FROM wl_terms n
     WHERE n.period_id=p.id AND n.status='active' AND n.effective_from<=?1)) AS manager_person_id
   FROM wl_goals g JOIN wl_members owner ON owner.id=g.owner_member LEFT JOIN oa_operators o ON lower(o.email)=owner.email
   WHERE g.development=1 AND NOT EXISTS(SELECT 1 FROM wl_goal_completions c WHERE c.goal_id=g.id)`,date),
 ])
 for(const a of assignments) sources.push({key:`review-input:${a.id}`,kind:'review-input',title:'Complete assigned review',
  path:`/app/performance/${a.cycle_id}`,due:a.due_date,preferred:a.member_id,next:'Submit your assigned review input',
  progress:'Input pending',personId:a.person_id,
  visible:actor=>actor.id===a.member_id||can(actor,'people.manage'),responsible:actor=>actor.id===a.member_id})
 for(const c of cycles) sources.push({key:`review-release:${c.id}`,kind:'review-release',title:'Calibrate and release review cycle',
  path:`/app/performance/${c.id}`,due:c.due_date,next:'Review inputs, calibrate human decisions and release the cycle',
  progress:'Cycle open',personId:null,visible:actor=>can(actor,'people.manage'),responsible:actor=>can(actor,'people.manage')})
 for(const g of development) {
  const visible:WorkSource['visible']=actor=>can(actor,'people.manage') || actor.personId===g.person_id || (!!actor.personId && actor.personId===g.manager_person_id) || (actor.id===g.owner_member&&['edit','approval'].includes(performanceMode(actor,g.person_id,'goals')))
  sources.push({key:`development:${g.id}`,kind:'development',title:'Complete development action',path:'/app/goals',
   due:g.due_date,preferred:g.owner_member,next:'Complete the development action and record evidence',progress:'Evidence pending',personId:g.person_id,
   visible,responsible:actor=>visible(actor) && (can(actor,'people.manage') || (actor.id===g.owner_member && g.owner_status==='active' && g.sign_in==='active'))})
 }
 return sources
}
