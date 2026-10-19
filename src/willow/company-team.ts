// SELF-002 uses existing directory and leave facets, never a new rank-based grant.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { sees } from './access'
import { all } from './core'
import { addDays } from './dates'
import { directory } from './profile'
export async function companyTeam(env:Bindings,actor:Actor) {
 const through=addDays(actor.today,30),people=await directory(env,actor),names=new Map(people.map(p=>[p.id,p.name]))
 const leave=(await all(env,"SELECT id,person_id,start_date,end_date FROM wl_leave_requests WHERE status='approved' AND start_date<=? AND end_date>=? ORDER BY start_date,id",through,actor.today)).filter(r=>names.has(r.person_id)&&sees(actor,r.person_id,'leave')).map(r=>({id:r.id,person:r.person_id,name:names.get(r.person_id)!,startDate:r.start_date,endDate:r.end_date}))
 const newHires=(await all(env,'SELECT person_id,start_date FROM wl_periods WHERE start_date>=? AND start_date<=? ORDER BY start_date,person_id',addDays(actor.today,-30),through)).filter(r=>names.has(r.person_id)).map(r=>({person:r.person_id,name:names.get(r.person_id)!,startsOn:r.start_date}))
 return {leave,newHires}
}
