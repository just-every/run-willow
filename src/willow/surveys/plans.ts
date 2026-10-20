// An assigned action owner gets the human-written plan, never survey responses or participation.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { auditRead, insist, one } from '../core'
import type { SurveyPlan } from './types'
export async function ownSurveyPlan(env:Bindings,actor:Actor,id:string) {
 const row=await one<SurveyPlan & {owner_name:string}>(env,'SELECT p.*,m.name AS owner_name FROM wl_survey_plans p JOIN wl_members m ON m.id=p.owner_member WHERE p.id=?',id)
 insist(row&&(row.owner_member===actor.id||can(actor,'people.manage')),'not_found',404)
 await auditRead(env,actor.id,'survey.plan.read',id)
 return {id:row.id,theme:row.theme,plan:row.plan,ownerName:row.owner_name,dueDate:row.due_date,evidence:row.completed_evidence,mayComplete:actor.owner||row.owner_member===actor.id}
}
