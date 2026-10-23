import { readsSurveyThemes } from './authority'
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { all, insist, json, one } from '../core'
import { ANONYMOUS_COMMENT_DISCLOSURE, type Survey, type SurveyMember, type SurveyPlan, type SurveyQuestion } from './types'

export async function surveyList(env:Bindings,actor:Actor) {
 const surveys=await all<Survey>(env,'SELECT * FROM wl_surveys ORDER BY created_at DESC,id DESC'),items=[]
 for(const survey of surveys) {
  const membership=await one<SurveyMember>(env,'SELECT * FROM wl_survey_members WHERE survey_id=? AND member_id=?',survey.id,actor.id)
  const team=await readsSurveyThemes(env,actor,survey.id)
  if(!can(actor,'people.manage')&&!team&&!(membership&&survey.delivery_date<=actor.today))continue
  items.push({id:survey.id,name:survey.name,kind:survey.kind,mode:survey.mode,deliveryDate:survey.delivery_date,dueDate:survey.due_date,status:survey.status,own:membership?{answered:!!membership.answered,declined:!!membership.declined}:null,mayReadResults:can(actor,'people.manage')||team})
 }
 const members=can(actor,'people.manage')?await all(env,"SELECT m.id,m.name FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.status='active' AND o.status='active' AND m.person_id IS NOT NULL ORDER BY m.name"):[]
 return {items,mayCreate:can(actor,'people.manage'),members}
}
export async function surveyDetail(env:Bindings,actor:Actor,id:string) {
 const survey=await one<Survey>(env,'SELECT * FROM wl_surveys WHERE id=?',id);insist(survey,'not_found',404)
 const visible=(await surveyList(env,actor)).items.find(s=>s.id===id);insist(visible,'not_found',404)
 const questions=json<SurveyQuestion[]>(survey.questions_json,[])
 const active=!!actor.personId&&!!await one(env,'SELECT 1 FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?)',actor.personId,actor.today,actor.today)
 return {survey:visible,questions,mayRespond:active&&!!visible.own&&!visible.own.answered&&!visible.own.declined&&survey.status==='open'&&survey.delivery_date<=actor.today&&survey.due_date>=actor.today,
  disclosure:survey.mode==='anonymous'?`Anonymous: answers are stored without your identity or response time. Your participation is tracked separately to prevent duplicates. Results require at least five participants and five responses; small categories suppress the report. Optional comments: ${ANONYMOUS_COMMENT_DISCLOSURE}. Managers receive only HR’s published themes.`:'Named: HR can read your name with each response, including comments. Managers receive only HR’s published themes.',
  plans:await all<SurveyPlan & {owner_name:string}>(env,'SELECT p.*,m.name AS owner_name FROM wl_survey_plans p JOIN wl_members m ON m.id=p.owner_member WHERE p.survey_id=? ORDER BY p.created_at,p.id',id)}
}
