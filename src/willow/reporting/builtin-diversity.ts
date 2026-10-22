// Selection exposes a definition only. Native protected aggregate authority and suppression remain intact.
import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { insist, now, one } from '../core'
import { diversityReport } from '../eeo/report'
import type { BuiltinReport } from './builtin-catalog'
import type { BuiltinResult, BuiltinRow } from './builtin-result'

const watermark=(env:Bindings)=>one<{seq:number;at:number|null}>(env,"SELECT COALESCE(MAX(seq),0) AS seq,MAX(at) AS at FROM wl_audit WHERE action NOT LIKE '%.read'")

export async function runBuiltinDiversity(env:Bindings,actor:Actor,report:BuiltinReport,options:{asOf?:string}):Promise<BuiltinResult> {
 // Do not turn a selected-report grant into either of these employer-wide native rights.
 requirePermission(actor,'reports.read','eeo.read')
 insist(Object.keys(options).every(key=>key==='asOf'),'eeo_filters_not_allowed')
 const started=await watermark(env),aggregate=await diversityReport(env,actor,{asOf:options.asOf??actor.today})
 const source=`/app/eeo/report?asOf=${aggregate.asOf}`
 const rows:BuiltinRow[]=(['raceEthnicity','sex'] as const).flatMap(dimension=>aggregate[dimension].map(cell=>{
  const label=dimension==='raceEthnicity'?'Race / ethnicity':'Sex'
  return {personId:'',name:label,source,cells:{dimension:label,category:cell.label,count:cell.suppressed||cell.count===null?null:String(cell.count)},withheld:cell.suppressed?['count']:[],measures:{count:cell.suppressed?null:cell.count}}
 }))
 const finished=await watermark(env)
 insist(started?.seq===finished?.seq,'report_source_changed',409)
 return {id:report.id,name:report.name,description:report.description,asOf:aggregate.asOf,scope:aggregate.scope,
  definition:{name:report.name,columns:[...report.columns],asOf:aggregate.asOf,from:aggregate.asOf,to:aggregate.asOf,department:'',location:'',status:'active'},
  excludesErased:aggregate.excludesErased,generatedAt:now(),columns:[{key:'dimension',label:'Dimension'},{key:'category',label:'Category'},{key:'count',label:'People'}],rows,
  totals:{total:aggregate.total,suppressed:aggregate.suppressed},sourceFreshness:{recordedThrough:finished?.at??null},
  notes:`${aggregate.calculation} Counts marked withheld are suppressed by the native diversity-report privacy rule.`}
}
