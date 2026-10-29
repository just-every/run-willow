import { msg } from '../locale/runtime'
import { signatureReportRows } from './signature-files'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { auditRead } from '../core'
import { employeeCsv, employeeXlsx } from '../export-formats'
import { savedReport } from './definitions'
import { runReport, type ReportResult } from './execute'
export function reportRows(r:ReportResult):string[][] {
 return [[r.definition.name],['As of',r.asOf],['Scope',r.scope],r.columns.map(c=>c.key.startsWith('custom.')?c.label:msg(c.label)),...r.rows.map(row=>r.columns.map(c=>row.withheld.includes(c.key)?msg('Withheld'):row.displayCells?.[c.key]??row.cells[c.key]??msg('Unknown / not recorded'))),
 ['Headcount',String(r.totals.headcount)],['FTE',String(r.totals.fte)],['Unknown FTE',String(r.totals.unknownFte)],['Leave hours',String(r.totals.leaveHours)],...r.totals.liability.map(l=>['Leave liability',l.currency,(l.cents/100).toFixed(2)]),['Unknown liability',String(r.totals.unknownLiability)],['Open exceptions',String(r.totals.openExceptions)],['Overdue work',String(r.totals.overdueWork)],['Work coverage',r.workCoverage.basis],['Unknown historical work',String(r.workCoverage.unknownHistoricalWork)],['Unassigned current overdue work',String(r.workCoverage.unassignedOverdue??'unknown')],['Turnover leavers',String(r.totals.turnover.leavers)],['Turnover denominator',String(r.totals.turnover.denominator)],...r.totals.turnover.sources.map(s=>['Turnover source',s.personId,s.endDate]),...r.totals.turnover.denominatorSources.flatMap(s=>s.people.map(p=>['Headcount denominator source',s.date,p.personId])),['Latest business event',r.sourceFreshness.recordedThrough===null?'Unknown / not recorded':new Date(r.sourceFreshness.recordedThrough).toISOString()],...signatureReportRows(r),['Calculation',r.notes]]
}
export async function customReportFile(env:Bindings,actor:Actor,id:string,format:'csv'|'xlsx') {
 const saved=await savedReport(env,actor,id),report=await runReport(env,actor,saved.definition,saved.id),rows=reportRows(report).map((row,i)=>i===0||i===3||i>=4&&i<4+report.rows.length?row:row.map((cell,j)=>j===0?msg(cell):cell))
 await auditRead(env,actor.id,'report.download',id,{format,asOf:report.asOf})
 const body=format==='csv'?employeeCsv(rows):employeeXlsx(rows)
 return new Response(body as BodyInit,{headers:{'content-type':format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="workforce-report.${format}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}})
}
