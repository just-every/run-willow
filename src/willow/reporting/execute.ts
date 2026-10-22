import { workSources } from '../work-sources'
// REPORT-001: one current-authority executor for page, drill-down, CSV, XLSX and scheduled links.
import type { Bindings } from '../../auth.server'
import { can, canAbout, employerZone, hasScopedGrant, type Actor } from '../actor'
import { all, auditRead, now, insist, one } from '../core'
import { daysBetween, today } from '../dates'
import { directory, personView } from '../profile'
import { effectiveFieldDefinitions } from '../custom-fields/store'
import { datedExceptions } from './exceptions'
import { erasedExcluded } from '../retention/excluded'
import { requireReporter, STANDARD_COLUMNS, type ReportDefinition } from './definitions'
interface ReportRow { personId:string;name:string;source:string;cells:Record<string,string|null>;withheld:string[];workSources:{id:string;caseId:string;dueDate:string}[];exceptionSources:{kind:string;path:string;dueDate:string}[];overdueSources:{kind:string;path:string;dueDate:string}[];measures:{headcount:number;fte:number|null;tenureDays:number|null;leaveMinutes:number|null;liabilityCents:number|null;currency:string|null;openExceptions:number;overdueWork:number} }
const roundedCents=(minutes:number,cents:number,denominator:number)=>{const product=BigInt(minutes)*BigInt(cents),absolute=product<0n?-product:product,den=BigInt(denominator);const result=Number((absolute*2n+den)/(den*2n))*(product<0n?-1:1);insist(Number.isSafeInteger(result),'liability_out_of_range');return result}
const sum=(values:(number|null)[])=>values.reduce<number>((s,v)=>s+(v??0),0)
export async function runReport(env:Bindings,actor:Actor,definition:ReportDefinition) {
 requireReporter(actor)
 const watermark=()=>one<{seq:number;at:number}>(env,"SELECT COALESCE(MAX(seq),0) AS seq,MAX(at) AS at FROM wl_audit WHERE action NOT LIKE '%.read'")
 const started=await watermark()
 const asOf=definition.asOf==='today'?actor.today:definition.asOf,zone=await employerZone(env)
 const scoped=(await directory(env,actor,asOf)).filter(p=>canAbout(actor,'reports.read',p.id)||actor.reports.has(p.id)).filter(p=>(!definition.department||p.department?.name===definition.department)&&(!definition.location||p.location?.name===definition.location))
 const currentWork=asOf===actor.today?(await workSources(env,(await one<{default_days:number}>(env,'SELECT default_days FROM wl_work_policy WHERE singleton=1'))?.default_days??1)).filter(w=>w.visible(actor)):null
 const exceptions=await datedExceptions(env,actor,asOf,zone),custom=await effectiveFieldDefinitions(env,asOf),periods=await all(env,'SELECT * FROM wl_periods')
 const permittedPeople=new Set(scoped.map(p=>p.id)),filteredPeriods=periods.filter(p=>permittedPeople.has(p.person_id))
 const activeAt=(date:string)=>filteredPeriods.filter(p=>p.start_date<=date&&(!p.end_date||p.end_date>=date)).length
 const rows:ReportRow[]=[]
 for(const person of scoped) {
  if(definition.status==='active'&&person.status!=='active')continue
  const view=await personView(env,actor,person.id,{asOf,audit:false}) as Record<string,any>,period=view.employment?.find((p:any)=>p.id===view.selectedPeriod),term=period?.terms.find((t:any)=>t.inForce),active=person.status==='active',weekly=term?.schedule?.weeklyMinutes??null
  const tenure=period?Math.max(0,daysBetween(period.startDate,period.endDate&&period.endDate<asOf?period.endDate:asOf)):null
  const leave=view.leave?sum(view.leave.accounts.map((a:any)=>a.balanceMinutes)):null,pay=term?.pay
  let liability:number|null=null
  if(leave!==null&&pay?.amountCents!==null&&pay?.amountCents!==undefined) {
   const denominator=pay.basis==='hourly'?60:pay.basis==='salary'&&weekly?weekly*52:null
   if(denominator)liability=roundedCents(leave,pay.amountCents,denominator)
  }
  const work=exceptions.get(person.id)??{exceptions:0,overdue:0,tasks:[],sources:[]}
  const overdueSources=currentWork?.filter(w=>w.personId===person.id&&w.due<asOf).map(w=>({kind:w.kind,path:w.path,dueDate:w.due}))??[...work.tasks.filter(w=>w.dueDate<asOf).map(w=>({kind:'Lifecycle task',path:`/app/cases/${w.caseId}`,dueDate:w.dueDate})),...work.sources.filter(w=>w.dueDate<asOf)]
  const values:Record<string,string|null>={name:view.name,employeeNumber:view.employeeNumber??null,jobTitle:view.current?.jobTitle??null,department:view.current?.department?.name??null,location:view.current?.location?.name??null,employmentType:period?.employmentType??null,fte:weekly===null?null:(weekly/2400).toFixed(3),tenureDays:tenure===null?null:String(tenure),leaveHours:leave===null?null:(leave/60).toFixed(2),leaveLiability:liability===null?null:`${pay.currency} ${(liability/100).toFixed(2)}`,payAmount:pay?.amountCents===null||pay?.amountCents===undefined?null:`${pay.currency} ${(pay.amountCents/100).toFixed(2)} ${pay.basis}`,phone:view.private?.phone??null,personal_email:view.private?.personal_email??null,openExceptions:String(work.exceptions),overdueWork:String(overdueSources.length)}
  const withheld:string[]=[]
  for(const key of definition.columns) {
   if(key.startsWith('custom.')) {
    const field=view.customFields.fields.find((f:any)=>f.key===key.slice(7));values[key]=field?.value===undefined||field?.value===null?null:String(field.value);if(!field)withheld.push(key)
   } else if((key==='phone'||key==='personal_email')&&!Object.hasOwn(view.private??{},key)||key==='payAmount'&&!pay||key==='leaveLiability'&&(!pay||!view.leave)||key==='leaveHours'&&!view.leave||key==='employeeNumber'&&view.employeeNumber===undefined)withheld.push(key)
  }
  rows.push({personId:person.id,name:view.name,source:`/app/people/${person.id}?asOf=${asOf}`,cells:Object.fromEntries(definition.columns.map(k=>[k,withheld.includes(k)?null:values[k]])),withheld,workSources:work.tasks,exceptionSources:work.sources,overdueSources,
   measures:{headcount:active?1:0,fte:active&&weekly!==null?Math.round(weekly/2400*1000)/1000:null,tenureDays:tenure,leaveMinutes:leave,liabilityCents:liability,currency:liability===null?null:pay.currency,openExceptions:work.exceptions,overdueWork:overdueSources.length}})
 }
 const currencies=[...new Set(rows.flatMap(r=>r.measures.currency?[r.measures.currency]:[]))]
 const liability=currencies.map(currency=>({currency,cents:sum(rows.filter(r=>r.measures.currency===currency).map(r=>r.measures.liabilityCents))}))
 const denominator=(activeAt(definition.from)+activeAt(definition.to))/2,leavers=filteredPeriods.filter(p=>p.end_date&&p.end_date>=definition.from&&p.end_date<=definition.to).length
 const turnoverSources=filteredPeriods.filter(p=>p.end_date&&p.end_date>=definition.from&&p.end_date<=definition.to).map(p=>({personId:p.person_id,startDate:p.start_date,endDate:p.end_date,source:`/app/people/${p.person_id}?asOf=${p.end_date}`}))
 const denominatorSources=[definition.from,definition.to].map(date=>({date,people:filteredPeriods.filter(p=>p.start_date<=date&&(!p.end_date||p.end_date>=date)).map(p=>({personId:p.person_id,source:`/app/people/${p.person_id}?asOf=${date}`}))}))
 const columns=definition.columns.map(key=>{const f=custom.find(f=>'custom.'+f.key===key);return {key,label:STANDARD_COLUMNS[key]??(f&&rows.some(r=>!r.withheld.includes(key))?f.label:key)}})
 const totals={headcount:sum(rows.map(r=>r.measures.headcount)),fte:Math.round(sum(rows.map(r=>r.measures.fte))*1000)/1000,unknownFte:rows.filter(r=>r.measures.headcount&&r.measures.fte===null).length,tenureDays:sum(rows.map(r=>r.measures.tenureDays)),averageTenureDays:rows.filter(r=>r.measures.tenureDays!==null).length?sum(rows.map(r=>r.measures.tenureDays))/rows.filter(r=>r.measures.tenureDays!==null).length:null,leaveHours:sum(rows.map(r=>r.measures.leaveMinutes))/60,liability,unknownLiability:rows.filter(r=>r.measures.liabilityCents===null).length,openExceptions:sum(rows.map(r=>r.measures.openExceptions)),overdueWork:sum(rows.map(r=>r.measures.overdueWork)),turnover:{leavers,denominator,rate:denominator?leavers/denominator:null,sources:turnoverSources,denominatorSources}}
 const finished=await watermark();insist(started?.seq===finished?.seq,'report_source_changed',409)
 if(rows.some(r=>r.measures.liabilityCents!==null)||definition.columns.some(k=>['phone','personal_email','payAmount','leaveLiability'].includes(k)||k.startsWith('custom.')))await auditRead(env,actor.id,'report.private.read','custom',{asOf})
 return {definition,asOf,excludesErased:await erasedExcluded(env,asOf),workCoverage:{basis:currentWork?'All current permission-checked FLOW-002 work sources':'Dated lifecycle, leave, profile and payroll history; other historical work is unknown',unknownHistoricalWork:currentWork===null,unassignedOverdue:currentWork?.filter(w=>!w.personId&&w.due<asOf).length??null},scope:can(actor,'reports.read')?'organization':hasScopedGrant(actor,'reports.read')?'scoped people':'current direct team',generatedAt:now(),columns,rows,totals,sourceFreshness:{recordedThrough:finished?.at??null},notes:'Current reader authority applies at every date. Dates are inclusive in the employer time zone. FTE = scheduled weekly minutes / 2400 (40 hours), rounded to three decimals per person before summing; tenure counts elapsed calendar days. Turnover = leavers in the inclusive range / average headcount at its endpoints. Leave balances follow ledger effective dates; liability uses hourly rate, or salary / (scheduled weekly minutes × 52), rounded half up to cents per person; unknown pay/schedule is withheld and counted. Exceptions include pending leave/profile decisions and approved profile handoffs; Current overdue work uses every visible FLOW-002 adapter; historical totals count reconstructable lifecycle/leave/profile/payroll work and mark other historical sources unknown. Unassigned current overdue work is listed separately from person totals. Future benefits, signature and hiring metrics inherit before those modules ship.'}
}
export type ReportResult=Awaited<ReturnType<typeof runReport>>
