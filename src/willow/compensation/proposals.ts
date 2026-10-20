// Managers can propose a percentage without receiving the underlying pay. All proposals append.
import type { Bindings } from '../../auth.server'
import { can, type Actor } from '../actor'
import { commit, guard, insist, newId, now, one, stmt } from '../core'
import { Input } from '../input'
import { prepareTerms, termsOn } from '../people'
import { cents, businessVersion, guardBandSnapshot } from './bands'

export async function proposeCompensation(env:Bindings,actor:Actor,input:Input) {
 const source=await businessVersion(env),cycle=await one(env,'SELECT * FROM wl_comp_cycles WHERE id=?',input.text('cycle'))
 insist(cycle&&cycle.status==='approved','compensation_cycle_not_open',409)
 const person=input.text('person');insist(person!==actor.personId,'own_terms',403)
 insist(can(actor,'people.manage')||actor.reports.has(person),'forbidden',403)
 const period=await one(env,'SELECT * FROM wl_periods WHERE person_id=? AND start_date<? AND (end_date IS NULL OR end_date>=?) ORDER BY start_date DESC LIMIT 1',person,cycle.effective_from,cycle.effective_from)
 insist(period,'period_not_found',404)
 const base=await termsOn(env,period.id,cycle.effective_from);insist(base,'terms_not_found',404)
 const pay=await one(env,'SELECT * FROM wl_term_pay WHERE term_id=?',base.id)
 insist(pay?.currency==='USD'&&pay.amount_cents!==null&&['salary','hourly'].includes(pay.pay_basis),'compensation_pay_unknown',409)
 let amount:number
 if(cycle.kind!=='bonus'&&input.has('percent')) {
  const percent=input.text('percent');insist(/^\d{1,3}(\.\d{1,2})?$/.test(percent),'invalid_percent')
  const bp=BigInt(percent.replace('.',''))*10n**BigInt(2-(percent.split('.')[1]?.length??0))
  amount=Number((BigInt(pay.amount_cents)*(10000n+bp)*2n+10000n)/20000n)
 } else {insist(can(actor,'pay.read'),'forbidden',403);amount=cents(input.text('amount'))}
 const job=input.text('jobTitle',{optional:true,max:120})||base.job_title
 if(cycle.kind!=='bonus')await prepareTerms(env,actor,Input.of({period:period.id,effectiveFrom:cycle.effective_from,jobTitle:job,payBasis:pay.pay_basis,payAmount:(amount/100).toFixed(2),reason:input.text('note',{max:300})}),{approved:true})
 const id=newId()
 await commit(env,[guardBandSnapshot(env,source),guard(env,'compensation_cycle_not_open',"EXISTS(SELECT 1 FROM wl_comp_cycles WHERE id=? AND status='approved')",cycle.id),stmt(env,'INSERT INTO wl_comp_proposals (id,sequence,cycle_id,person_id,period_id,period_revision,base_term,basis,amount_cents,previous_cents,job_title,note,requested_by,requested_at) SELECT ?,COALESCE(MAX(sequence),0)+1,?,?,?,?,?,?,?,?,?,?,?,? FROM wl_comp_proposals',id,cycle.id,person,period.id,period.revision,base.id,pay.pay_basis,amount,pay.amount_cents,job,input.text('note',{max:300}),actor.id,now())],{actor:actor.id,action:'compensation.propose',subject:id,detail:{cycle:cycle.id,person}})
 return {id,cycle:cycle.id,status:'proposed'}
}