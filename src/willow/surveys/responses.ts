// Anonymous answers are deliberately unlinked: no identity, token, timestamp or per-answer audit event.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { can } from '../actor'
import { WillowError, commit, guard, insist, json, newId, one, stmt } from '../core'
import type { Input } from '../input'
import type { Survey, SurveyQuestion } from './types'

export async function respondSurvey(env:Bindings,actor:Actor,input:Input) {
 const id=input.text('survey'),survey=await one<Survey>(env,'SELECT * FROM wl_surveys WHERE id=?',id)
 insist(survey&&survey.status==='open'&&survey.delivery_date<=actor.today&&survey.due_date>=actor.today,'survey_not_open',409)
 const member=await one(env,'SELECT * FROM wl_survey_members WHERE survey_id=? AND member_id=?',id,actor.id)
 insist(member&&member.person_id===actor.personId,'not_a_participant',403)
 insist(!member.answered&&!member.declined,'survey_already_answered',409)
 const questions=json<SurveyQuestion[]>(survey.questions_json,[]),declined=input.flag('decline')
 input.only(['survey','answers','decline','returnTo',...questions.map(q=>'answer.'+q.key)])
 const submitted=declined?{}:input.has('answers')?input.json('answers'):Object.fromEntries(questions.map(q=>[q.key,input.text('answer.'+q.key,{optional:!!q.optional,max:4000})]))
 insist(submitted&&typeof submitted==='object'&&!Array.isArray(submitted),'invalid_answers')
 const supplied=submitted as Record<string,unknown>;insist(Object.keys(supplied).every(k=>questions.some(q=>q.key===k)),'unknown_survey_question')
 const answers:Record<string,string|number|null>={}
 if(!declined)for(const q of questions) {
  const value=supplied[q.key]
  if((value===undefined||value===null||value==='')&&q.optional){answers[q.key]=null;continue}
  if(q.type==='score') {const score=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;insist(Number.isInteger(score)&&score>=0&&score<=10,'invalid_survey_score');answers[q.key]=score}
  else if(q.type==='choice'){insist(typeof value==='string'&&q.options?.includes(value),'invalid_survey_choice');answers[q.key]=value}
  else {insist(typeof value==='string'&&value.trim().length>0&&value.length<=4000,'invalid_survey_text');answers[q.key]=value.trim()}
 }
 const statements=[
  guard(env,'survey_not_open',"EXISTS(SELECT 1 FROM wl_surveys WHERE id=? AND status='open' AND delivery_date<=? AND due_date>=?)",id,actor.today,actor.today),
  guard(env,'not_a_participant','EXISTS(SELECT 1 FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?))',actor.personId,actor.today,actor.today),
  guard(env,'survey_already_answered','EXISTS(SELECT 1 FROM wl_survey_members WHERE survey_id=? AND member_id=? AND person_id=? AND answered=0 AND declined=0)',id,actor.id,actor.personId),
  stmt(env,`UPDATE wl_survey_members SET ${declined?'declined':'answered'}=1 WHERE survey_id=? AND member_id=?`,id,actor.id),
  ...(!declined?[stmt(env,'INSERT INTO wl_survey_answers (id,survey_id,member_id,answers_json) VALUES (?,?,?,?)',newId(),id,survey.mode==='named'?actor.id:null,JSON.stringify(answers))]:[]),
 ]
 if(survey.mode==='anonymous') {
  try {await env.DB.batch([...statements,stmt(env,'DELETE FROM wl_guard')])}
  catch(error) {const code=String(error).match(/willow_guard_(\w+)/)?.[1];if(code)throw new WillowError(code==='failed'?'survey_response_changed':code,409);throw error}
 }
 else await commit(env,statements,{actor:actor.id,action:'survey.respond',subject:id,detail:{declined}})
 return {id,status:declined?'declined':'answered'}
}
export async function hideSurveyComment(env:Bindings,actor:Actor,input:Input) {
 insist(can(actor,'people.manage'),'forbidden',403)
 const answer=input.text('answer'),reason=input.text('reason',{max:500})
 insist(reason.length>=3,'comment_reason_required')
 const row=await one(env,"SELECT s.* FROM wl_survey_answers a JOIN wl_surveys s ON s.id=a.survey_id WHERE a.id=? AND s.mode='anonymous'",answer)
 insist(row,'not_found',404)
 await commit(env,[guard(env,'comment_already_hidden','NOT EXISTS(SELECT 1 FROM wl_survey_hidden_comments WHERE answer_id=?)',answer),stmt(env,'INSERT INTO wl_survey_hidden_comments VALUES (?,?,?,?)',answer,reason,actor.id,Date.now())],{actor:actor.id,action:'survey.comment.hide',subject:row.id,detail:{hidden:1}})
 return {id:row.id,hidden:1}
}
