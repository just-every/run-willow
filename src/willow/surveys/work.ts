// Anonymous participant work stays self-only, including against employer-wide reports.
import type { Bindings } from '../../auth.server'
import { can, employerZone } from '../actor'
import { all } from '../core'
import { today } from '../dates'
import type { WorkSource } from '../work-sources'
export async function surveyWork(env:Bindings):Promise<WorkSource[]> {
 const date=today(await employerZone(env)),sources:WorkSource[]=[]
 const assignments=await all(env,`SELECT s.id,s.name,s.mode,s.due_date,m.member_id,m.person_id FROM wl_surveys s JOIN wl_survey_members m ON m.survey_id=s.id JOIN wl_members member ON member.id=m.member_id JOIN oa_operators o ON lower(o.email)=member.email WHERE s.status='open' AND s.delivery_date<=? AND s.due_date>=? AND m.answered=0 AND m.declined=0 AND member.status='active' AND o.status='active' AND EXISTS(SELECT 1 FROM wl_periods p WHERE p.person_id=m.person_id AND p.start_date<=? AND (p.end_date IS NULL OR p.end_date>=?))`,date,date,date,date)
 for(const a of assignments)sources.push({key:`survey:${a.id}:${a.member_id}`,kind:'survey',title:'Survey response',path:`/app/surveys/${a.id}`,due:a.due_date,preferred:a.member_id,next:'Read the participation disclosure and respond or decline',progress:'Open',personId:a.mode==='anonymous'?null:a.person_id,
  visible:actor=>actor.id===a.member_id||(a.mode==='named'&&can(actor,'people.manage')),responsible:actor=>actor.id===a.member_id})
 for(const s of await all(env,"SELECT id,due_date FROM wl_surveys WHERE status='open' AND delivery_date<=?",date))sources.push({key:`survey-review:${s.id}`,kind:'survey-review',title:'Review survey outcomes',path:`/app/surveys/${s.id}/results`,due:s.due_date,next:'Review protected results and publish a human-owned action plan',progress:'Survey open',personId:null,visible:actor=>can(actor,'people.manage'),responsible:actor=>can(actor,'people.manage')})
 for(const p of await all(env,'SELECT id,survey_id,owner_member,due_date FROM wl_survey_plans WHERE completed_evidence IS NULL'))sources.push({key:`survey-plan:${p.id}`,kind:'survey-plan',title:'Survey action plan',path:`/app/surveys/${p.survey_id}`,due:p.due_date,preferred:p.owner_member,next:'Complete the agreed plan and record evidence',progress:'Action plan open',personId:null,visible:actor=>actor.id===p.owner_member||can(actor,'people.manage'),responsible:actor=>actor.id===p.owner_member})
 return sources
}
