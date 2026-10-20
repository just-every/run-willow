// Every download reuses the same current-authority projection as the results page.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { surveyResults } from './results'
export async function surveyCsv(env:Bindings,actor:Actor,id:string) {
 const result=await surveyResults(env,actor,id),rows:unknown[][]=[['Survey',result.survey.name],['Collection',result.survey.mode],['Delivery',result.survey.deliveryDate],['Due',result.survey.dueDate]]
 if(result.access==='hr') {
  rows.push(['Suppressed',result.aggregate.suppressed?'yes':'no'],['Invited',result.aggregate.invitedCount??'Suppressed'],['Responses',result.aggregate.answerCount??'Suppressed'])
  rows.push(['Question','Count','Mean','eNPS','Category','Category count'])
  for(const q of result.aggregate.questions.filter(q=>q.type!=='text'))for(const c of q.categories.length?q.categories:[null])rows.push([q.label,q.count??'Suppressed',q.mean??'',q.nps??'',c?.category==='__unanswered__'?'Unanswered':c?.category??'',c?.count??'Suppressed'])
  for(const answer of result.namedAnswers)for(const [key,value] of Object.entries(answer.answers))rows.push(['Named answer',answer.name,key,value])
  for(const comment of result.comments)rows.push(['Anonymous words',comment.questionKey,comment.text])
 }
 rows.push(['Theme','Plan','Human owner','Due','Evidence'])
 for(const plan of result.plans)rows.push([plan.theme,plan.plan,plan.ownerName,plan.dueDate,plan.completedEvidence??'Open'])
 const cell=(value:unknown)=>{const text=String(value??'');return '"'+(/^[=+\-@]/.test(text)?"'":'')+text.replaceAll('"','""')+'"'}
 return new Response(rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n',{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="survey-results.csv"','cache-control':'private, no-store','x-content-type-options':'nosniff'}})
}
