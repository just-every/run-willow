// The credential door applies current level population before native projections, counts and sources.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, insist, one, type Row } from '../core'
import { directory, personView } from '../profile'
import { directoryFilters, filterDirectory, organizationChart, type DirectoryPerson } from '../organization'
import { fieldSchemas, effectiveField } from '../custom-fields/store'
import { readsCustomField } from '../custom-fields/read'
import { recordTables, readsTable } from '../record-tables/schema'
import { tableReport } from '../record-tables/rows'
import { leaveDetail, readablePolicies } from '../leave'
import { readsLeaveField } from '../levels/leave'
import { absenceView } from '../leave-projection'
import { termsOn } from '../people'
import { builtinReports, runBuiltinReport } from '../reporting/builtins'
import { credentialDoor, assertCredentialCurrent } from './authenticate'
import { credentialPersonAllowed, isCredentialActor } from './principal'

async function population(env:Bindings,actor:Actor,date:string):Promise<DirectoryPerson[]> {
 const rows=filterDirectory(await directory(env,actor,date)).filter(person=>credentialPersonAllowed(actor,person.id))
 return rows.map(person=>({...person,manager:person.manager&&credentialPersonAllowed(actor,person.manager.id)?person.manager:null}))
}
function personProjection(actor:Actor,view:Record<string,unknown>) {
 const manager=(terms:Row)=>({...terms,...('manager' in terms?{manager:terms.manager&&credentialPersonAllowed(actor,terms.manager.id)?terms.manager:null}:{})})
 return {...view,...(view.current?{current:manager(view.current as Row)}:{}),...(Array.isArray(view.employment)?{employment:view.employment.map((period:Row)=>({...period,terms:period.terms.map(manager)}))}:{})}
}

async function scopedCoverage(env:Bindings,actor:Actor,request:Row) {
 if(!readsLeaveField(actor,request.person_id,'calendar'))return []
 const account=await one<{period_id:string}>(env,'SELECT period_id FROM wl_leave_accounts WHERE id=?',request.account_id)
 const terms=await termsOn(env,account!.period_id,request.start_date)
 if(!terms)return []
 const people=(await population(env,actor,actor.today)).filter(person=>readsLeaveField(actor,person.id,'calendar'))
 const names=new Map(people.map(person=>[person.id,person.name]))
 if(!names.size)return []
 // This is the native coverage intersection, with current credential population applied in SQL.
 const rows=await all(env,`SELECT r.person_id,r.start_date,r.end_date,r.status FROM wl_leave_requests r
  JOIN wl_leave_accounts a ON a.id=r.account_id JOIN wl_terms t ON t.period_id=a.period_id AND t.status='active'
  AND t.effective_from=(SELECT MAX(t2.effective_from) FROM wl_terms t2 WHERE t2.period_id=a.period_id AND t2.status='active' AND t2.effective_from<=r.start_date)
  WHERE r.person_id<>? AND r.person_id IN (SELECT value FROM json_each(?)) AND r.status IN ('pending','approved') AND r.start_date<=? AND r.end_date>=?
  AND ((t.department_id IS NOT NULL AND t.department_id=?) OR (t.manager_person_id IS NOT NULL AND t.manager_person_id=?)) ORDER BY r.start_date`,request.person_id,JSON.stringify([...names.keys()]),request.end_date,request.start_date,terms.department_id,terms.manager_person_id)
 return rows.map(row=>absenceView(row,names.get(row.person_id)!))
}

/** Dispatch only the fixed credential GET library; no human aliases, settings, files or decisions. */
export async function credentialRead(env:Bindings,actor:Actor,request:Request,url:URL):Promise<unknown> {
 insist(isCredentialActor(actor),'invalid_credential',401)
 const door=credentialDoor(request),path=url.pathname.slice('/api/willow/'.length),id=path.split('/')[1]
 insist(door,'credential_read_only',403)
 let result:unknown
 switch(door) {
  case 'people': {
   const filters=directoryFilters(url.searchParams,actor.today)
   result=filterDirectory(await population(env,actor,filters.date),filters)
   break
  }
  case 'organization': {
   const filters=directoryFilters(url.searchParams,actor.today)
   result=organizationChart(await population(env,actor,filters.date),filters.date)
   break
  }
  case 'person':
   insist(credentialPersonAllowed(actor,id),'not_found',404)
   result=personProjection(actor,await personView(env,actor,id,{asOf:url.searchParams.get('asOf')??undefined}))
   break
  case 'customFields': {
   const asOf=url.searchParams.get('asOf')??actor.today,people=await population(env,actor,asOf)
   result=(await fieldSchemas(env,asOf)).filter(schema=>{
    const current=schema.versions.find(version=>version.effectiveFrom<=actor.today)
    const policy=current?effectiveField(schema,current):null
    return policy&&people.some(person=>readsCustomField(actor,person.id,policy))
   })
   break
  }
  case 'recordTables': {
   const people=await population(env,actor,actor.today)
   result=(await recordTables(env)).filter(table=>people.some(person=>readsTable(actor,person.id,table)))
   break
  }
  case 'recordReport': {
   const asOf=url.searchParams.get('asOf')??actor.today
   result=await tableReport(env,actor,id,asOf,await population(env,actor,asOf))
   break
  }
  case 'leave': {
   const subject=await one(env,'SELECT person_id,account_id,start_date,end_date FROM wl_leave_requests WHERE id=?',id)
   insist(subject&&credentialPersonAllowed(actor,subject.person_id),'not_found',404)
   const detail=await leaveDetail(env,actor,id)
   result={...detail,coverage:await scopedCoverage(env,actor,subject),canDecide:false,canCancel:false,canCorrect:false}
   break
  }
  case 'policies':result=await readablePolicies(env,actor);break
  case 'builtinReports':result=await builtinReports(env,actor);break
  case 'builtinReport':result=await runBuiltinReport(env,actor,id,url);break
  default:insist(false,'credential_read_only',403)
 }
 await assertCredentialCurrent(env,actor)
 return result
}
