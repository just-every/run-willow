import type { Cycle, Proposal } from './types'
// Owner budget approval and one atomic, reviewed publication across all proposed people.
import type { Bindings } from '../../auth.server'
import { can, requireOwner, requirePermission, type Actor } from '../actor'
import { all, auditRead, commit, guard, insist, json, newId, now, one, sha256Hex, stmt, type Row } from '../core'
import { requireDate } from '../dates'
import { Input } from '../input'
import { prepareTerms } from '../people'
import { annualCents, bandPosition, bands, businessVersion, cents, guardBandSnapshot } from './bands'

export async function createCycle(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage','pay.read')
 insist((await one(env,'SELECT currency FROM wl_employer'))?.currency==='USD','compensation_usd_required',409)
 const id=newId(),kind=input.text('kind');insist(['merit','promotion','bonus'].includes(kind),'invalid_kind')
 const date=requireDate(input.text('effectiveFrom'),'invalid_effectiveFrom');insist(date>=actor.today,'compensation_past_date')
 await commit(env,[stmt(env,'INSERT INTO wl_comp_cycles (id,name,kind,effective_from,budget_cents,created_by,created_at) VALUES (?,?,?,?,?,?,?)',id,input.text('name',{max:120}),kind,date,cents(input.text('budget')),actor.id,now())],{actor:actor.id,action:'compensation.cycle.create',subject:id})
 return {id,status:'draft'}
}
export async function approveBudget(env:Bindings,actor:Actor,input:Input) {
 requireOwner(actor);const id=input.text('cycle')
 await commit(env,[guard(env,'compensation_cycle_not_draft',"EXISTS(SELECT 1 FROM wl_comp_cycles WHERE id=? AND status='draft')",id),stmt(env,"UPDATE wl_comp_cycles SET status='approved',approved_by=?,approved_at=? WHERE id=?",actor.id,now(),id)],{actor:actor.id,action:'compensation.budget.approve',subject:id})
 return {id,status:'approved'}
}
export async function cycleRow(env:Bindings,id:string) {
 const row=await one<Cycle>(env,'SELECT * FROM wl_comp_cycles WHERE id=?',id);insist(row,'not_found',404);return row
}
export async function currentProposals(env:Bindings,cycle:string) {
 return all<Proposal>(env,`SELECT p.*,n.legal_name,n.preferred_name FROM wl_comp_proposals p JOIN wl_people n ON n.id=p.person_id WHERE p.cycle_id=? AND p.id=(SELECT v.id FROM wl_comp_proposals v WHERE v.cycle_id=p.cycle_id AND v.person_id=p.person_id ORDER BY sequence DESC LIMIT 1) ORDER BY p.person_id`,cycle)
}
interface ReviewRow extends Proposal {annualCostCents:number;position:string;band:Row|null;level:string|null;conflict:boolean}
interface CycleReview {cycle:Cycle;rows:ReviewRow[];costCents:number;remainingCents:number;overBudget:boolean;source:number;fingerprint:string;calculation:string}

export async function reviewCycle(env:Bindings,actor:Actor,id:string):Promise<CycleReview> {
 requirePermission(actor,'pay.read','people.manage')
 const source=await businessVersion(env),cycle=await cycleRow(env,id)
 const frozen=json<{snapshot?:CycleReview}>(cycle.publication_json,{}).snapshot
 if(cycle.status==='published'&&frozen) {await auditRead(env,actor.id,'compensation.cycle.read',id);return {...frozen,cycle}}
 const proposals=await currentProposals(env,id)
 let cost=0
 const rows:ReviewRow[]=[]
 for(const p of proposals) {
  const period=await one(env,'SELECT * FROM wl_periods WHERE id=?',p.period_id)
  const term=await one(env,'SELECT * FROM wl_terms WHERE id=?',p.base_term)
  const schedule=term?.schedule_id?await one(env,'SELECT mon+tue+wed+thu+fri+sat+sun AS minutes FROM wl_schedules WHERE id=?',term.schedule_id):null
  const band=await bandPosition(env,{personId:p.person_id,date:cycle.effective_from,jobTitle:p.job_title,locationId:term?.location_id??null,basis:p.basis,amountCents:p.amount_cents})
  const incremental=cycle.kind==='bonus'?p.amount_cents:Math.max(0,annualCents(p.basis,p.amount_cents,schedule?.minutes??0)-annualCents(p.basis,p.previous_cents,schedule?.minutes??0))
  cost+=incremental;insist(Number.isSafeInteger(cost),'compensation_out_of_range')
  rows.push({...p,annualCostCents:incremental,position:cycle.kind==='bonus'?'not applicable':band.position,band:cycle.kind==='bonus'?null:band.band,level:band.level,conflict:!period||period.revision!==p.period_revision||!!period.end_date&&period.end_date<cycle.effective_from})
 }
 insist(source===await businessVersion(env),'compensation_source_changed',409)
 const fingerprint=await sha256Hex(JSON.stringify({cycle,rows,source,reviewer:actor.id}))
 await auditRead(env,actor.id,'compensation.cycle.read',id)
 return {cycle,rows,costCents:cost,remainingCents:cycle.budget_cents!-cost,overBudget:cost>cycle.budget_cents!,source,fingerprint,
  calculation:'USD cents. Salary cost = positive annual raise; hourly cost = positive rate difference × scheduled weekly minutes / 60 × 52, each annual amount rounded half up to cents. Bonus cost is its one-time amount. Bounds inclusive; no proration. Latest immutable proposal per person. Payroll remains a handoff, not payment or provider verification.'}
}
export async function publishCycle(env:Bindings,actor:Actor,input:Input) {
 requireOwner(actor)
 const id=input.text('cycle'),review=await reviewCycle(env,actor,id)
 insist(review.cycle.status==='approved','compensation_cycle_not_open',409)
 insist(review.fingerprint===input.text('review'),'compensation_review_changed',409)
 insist(review.rows.length,'compensation_no_proposals',409)
 insist(!review.overBudget,'compensation_over_budget',409)
 insist(!review.rows.some(r=>r.conflict),'compensation_field_conflict',409)
 insist(!review.rows.some(r=>r.person_id===actor.personId||r.requested_by===actor.id),'own_compensation_proposal',403)
 const exceptions=review.rows.filter(r=>r.position!=='within'&&review.cycle.kind!=='bonus')
 const reason=input.text('exceptionReason',{optional:true,max:500});insist(!exceptions.length||reason,'compensation_band_exception_reason',409)
 const statements:D1PreparedStatement[]=[guardBandSnapshot(env,review.source),guard(env,'compensation_cycle_not_open',"EXISTS(SELECT 1 FROM wl_comp_cycles WHERE id=? AND status='approved')",id)]
 const audits=[];const results=[];const sourceGuards:D1PreparedStatement[]=[]
 for(const p of review.rows) {
  if(review.cycle.kind==='bonus') {
   const bonus=newId();statements.push(stmt(env,'INSERT INTO wl_comp_bonuses VALUES (?,?,?,?,?,?,?)',bonus,id,p.person_id,p.period_id,review.cycle.effective_from,p.amount_cents,now()));results.push({proposal:p.id,person:p.person_id,bonus})
  } else {
   const prepared=await prepareTerms(env,actor,Input.of({period:p.period_id,effectiveFrom:review.cycle.effective_from,jobTitle:p.job_title,payBasis:p.basis,payAmount:(p.amount_cents/100).toFixed(2),reason:p.note}),{approved:true})
   sourceGuards.push(...prepared.guards);statements.push(...prepared.statements.slice(prepared.guards.length));audits.push(prepared.audit);results.push({proposal:p.id,person:p.person_id,terms:prepared.termId})
  }
 }
 const publication={results,snapshot:review,review:review.fingerprint,costCents:review.costCents,exceptionReason:reason||null,exceptions:exceptions.map(p=>({proposal:p.id,position:p.position,band:p.band?.id??null}))}
 statements.push(stmt(env,"UPDATE wl_comp_cycles SET status='published',published_by=?,published_at=?,publication_json=? WHERE id=?",actor.id,now(),JSON.stringify(publication),id))
 await commit(env,[...sourceGuards,...statements],[...audits,{actor:actor.id,action:'compensation.cycle.publish',subject:id,detail:{count:results.length,costCents:review.costCents,exceptionReason:reason||null}}])
 return {id,status:'published',results}
}
export async function compensationHome(env:Bindings,actor:Actor) {
 insist(can(actor,'people.manage')||actor.reports.size>0||can(actor,'pay.read'),'forbidden',403)
 const pay=can(actor,'pay.read'),manage=can(actor,'people.manage'),cycles=await all<Cycle>(env,'SELECT * FROM wl_comp_cycles ORDER BY created_at DESC,id DESC')
 const people=await all(env,'SELECT id,legal_name,preferred_name FROM wl_people ORDER BY legal_name')
 if(pay)await auditRead(env,actor.id,'compensation.home.read','employer')
 return {cycles:cycles.map(c=>({...c,...(!pay?{budget_cents:null,publication_json:null}:{})})),bands:pay?await bands(env,actor):[],people:people.filter(p=>p.id!==actor.personId&&(manage||actor.reports.has(p.id))),mayMaintain:manage&&pay,mayApprove:actor.owner,maySeePay:pay}
}
export async function compensationCycle(env:Bindings,actor:Actor,id:string) {
 const cycle=await cycleRow(env,id)
 if(can(actor,'people.manage')&&can(actor,'pay.read')) {
  const review=await reviewCycle(env,actor,id),publication=json<{results:Row[]}>(cycle.publication_json,{results:[]})
  const reconciliation=[]
  for(const result of publication.results) {
   if(result.terms)reconciliation.push({...result,...await one(env,"SELECT b.id AS batch,b.status,b.provider_reference AS reference FROM wl_payroll_items i JOIN wl_payroll_batches b ON b.id=i.batch_id WHERE i.source_kind='terms' AND i.source_id=?",result.terms)})
   else reconciliation.push({...result,...await one(env,"SELECT b.id AS batch,b.status,b.provider_reference AS reference FROM wl_payroll_items i JOIN wl_payroll_batches b ON b.id=i.batch_id WHERE i.source_kind='bonus' AND i.source_id=?",result.bonus)})
  }
  return {...review,reconciliation,mayApprove:actor.owner,maySeePay:true}
 }
 insist(actor.reports.size>0,'forbidden',403)
 const own=(await currentProposals(env,id)).filter(p=>p.requested_by===actor.id&&actor.reports.has(p.person_id))
 return {cycle:{...cycle,budget_cents:null,publication_json:null},rows:own.map(p=>({id:p.id,person_id:p.person_id,legal_name:p.legal_name,job_title:p.job_title,note:p.note,status:cycle.status})),mayApprove:false,maySeePay:false}
}
