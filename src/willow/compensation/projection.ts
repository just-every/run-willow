// The section's fine grants admit rows, never unrelated people or budget authority.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all } from '../core'
import { readsCompensation, type CompensationField } from '../levels/compensation'
import { jobLevel } from './bands'
import { currentTerms } from '../people'
export async function compensationProjection(env:Bindings,actor:Actor,person:string,allow?:(field:CompensationField)=>boolean,asOf=actor.today) {
 const reads=(field:CompensationField)=>readsCompensation(actor,person,field)&&(!allow||allow(field))
 const terms=(await currentTerms(env,actor.today)).get(person)
 const selected=asOf===actor.today?terms:(await currentTerms(env,asOf)).get(person)
 const salary=reads('pay')||reads('history')?await all(env,`SELECT t.id,t.effective_from,t.status,p.pay_basis,p.amount_cents,p.currency FROM wl_terms t JOIN wl_periods e ON e.id=t.period_id JOIN wl_term_pay p ON p.term_id=t.id WHERE e.person_id=? ORDER BY t.effective_from DESC,t.recorded_at DESC`,person):[]
 const payRecords=salary.filter(row=>row.id===terms?.id?reads('pay'):reads('history')).map(row=>({id:row.id,effectiveFrom:row.effective_from,status:row.status,inForce:row.id===selected?.id,current:row.id===terms?.id,pay:{basis:row.pay_basis,amountCents:row.amount_cents,currency:row.currency}}))
 const level=terms&&reads('bands')?await jobLevel(env,person,actor.today):null
 const bands=reads('bands')&&terms&&level?.level?await all(env,'SELECT * FROM wl_comp_bands WHERE job_title=? AND level=? AND location_id=? ORDER BY effective_from DESC,sequence DESC',terms.job_title,level.level,terms.location_id??''):[]
 const cycles=reads('cycles')?await all(env,`SELECT c.id,c.name,c.kind,c.effective_from,c.status,p.id AS proposal,p.person_id,p.note,
 p.amount_cents,p.previous_cents,p.basis FROM wl_comp_cycles c JOIN wl_comp_proposals p ON p.cycle_id=c.id WHERE p.person_id=? AND p.sequence=(SELECT MAX(v.sequence) FROM wl_comp_proposals v WHERE v.cycle_id=p.cycle_id AND v.person_id=p.person_id) ORDER BY c.created_at DESC`,person):[]
 return {payRecords,withheld:(['pay','history','bands','bonus','equity','cycles'] as const).filter(field=>!reads(field)),bands,cycles:cycles.map(row=>reads('pay')?row:Object.fromEntries(Object.entries(row).filter(([key])=>!['amount_cents','previous_cents','basis'].includes(key))))}
}
