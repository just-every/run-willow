import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { auditRead } from '../core'
import { employeeCsv,employeeXlsx } from '../export-formats'
import { runBuiltinReport } from './builtins'
import { builtinRows } from './builtin-format'
export async function builtinReportFile(env:Bindings,actor:Actor,id:string,format:'csv'|'xlsx',url:URL) {
 const result=await runBuiltinReport(env,actor,id,url),rows=builtinRows(result)
 await auditRead(env,actor.id,'report.download',id,{format,asOf:result.asOf})
 return new Response((format==='csv'?employeeCsv(rows):employeeXlsx(rows)) as BodyInit,{headers:{'content-type':format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="${id}.${format}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}})
}
