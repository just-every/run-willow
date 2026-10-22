// Exact pay writes reuse immutable native terms without granting job maintenance.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { commit,guard,insist,one } from '../core'
import { selectedPeriods } from '../employment'
import { Input } from '../input'
import { prepareJobChange } from '../job-values'
import { liveJobActor } from '../job-write'
import { canEditCompensation,canRequestCompensation } from '../levels/compensation'
import { requestChange } from '../change-requests/requests'
import { payWriteField } from './pay-authority'
import { readCompensationRecord } from './records'
export async function editCompensationPay(env:Bindings,actor:Actor,input:Input) {
 input.only(['person','period','revision','effectiveFrom','payBasis','payAmount','reason','returnTo'])
 const person=input.text('person'),live=await liveJobActor(env,actor)
 insist(canEditCompensation(live.actor,person,await payWriteField(env,live.actor,person,input.text('effectiveFrom'))),'compensation_field_forbidden',403)
 const period=input.has('period')?await one(env,'SELECT * FROM wl_periods WHERE id=? AND person_id=?',input.text('period'),person):(await selectedPeriods(env,actor.today)).get(person)
 insist(period,'period_not_found',404)
 insist(period.revision===input.text('revision'),'stale',409)
 const execution={period:period.id,effectiveFrom:input.text('effectiveFrom'),reason:input.text('reason',{max:300}),payBasis:input.text('payBasis'),payAmount:input.text('payAmount',{optional:true}),template:''}
 const prepared=await prepareJobChange(env,live.actor,period.id,execution)
 await commit(env,[live.fence,guard(env,'stale','EXISTS(SELECT 1 FROM wl_periods WHERE id=? AND revision=?)',period.id,period.revision),...prepared.statements],prepared.audit)
 return prepared.result
}
/** Form entry for the same typed chain used by JSON proposals. */
export async function proposeCompensationRecord(env:Bindings,actor:Actor,input:Input) {
 input.only(['person','kind','record','revision','effectiveDate','amount','currency','units','security','note','reason','returnTo'])
 const person=input.text('person'),live=await liveJobActor(env,actor),plan=readCompensationRecord(input)
 insist(canRequestCompensation(live.actor,person,plan.kind),'compensation_field_forbidden',403)
 return requestChange(env,live.actor,Input.of({person,effectiveFrom:plan.effectiveDate,reason:input.text('reason',{optional:true,max:300})||'Compensation record proposal',compensationRecord:plan}))
}
