import { msg } from '../locale/runtime'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { ownSurveyPlan } from '../surveys/plans'
import { h,page,form,hidden,area } from './html'
export async function surveyPlanPage(env:Bindings,actor:Actor,id:string,url:URL) {
 const plan=await ownSurveyPlan(env,actor,id)
 return page(msg('Survey action plan'),actor,h`<p class="back"><a href="/app/tasks">← Your work</a></p><h1>${plan.theme}</h1><section class="card"><p>${plan.plan}</p><p>Owner: ${plan.ownerName} · Due ${plan.dueDate}</p>${plan.evidence?h`<h2>Completed</h2><p>${plan.evidence}</p>`:plan.mayComplete?form('survey.plan.complete',`/app/survey-plans/${id}`,h`${hidden('plan',id)}${area('Completion evidence','evidence')}`,'Complete action plan'):''}</section>`,{current:'/app/surveys',url})
}
