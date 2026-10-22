// Explicit output projection: no built-in inherits unrelated executor totals or sources.
import type { Actor } from '../actor'
import { readsJobHistoryField } from '../levels/job'
import type { ReportDefinition } from './definitions'
import type { ReportResult } from './execute'
import type { BuiltinReport } from './builtin-catalog'

export interface BuiltinRow {
 personId: string
 name: string
 source: string
 cells: Record<string, string | null>
 withheld: string[]
 measures: Record<string, number | string | null>
 exceptionSources?: { kind: string; path: string; dueDate: string }[]
 overdueSources?: { kind: string; path: string; dueDate: string }[]
}
export interface BuiltinResult {
 id: string
 name: string
 description: string
 definition: ReportDefinition
 asOf: string
 scope: string
 excludesErased:number
 generatedAt: number
 columns: { key: string; label: string }[]
 rows: BuiltinRow[]
 totals: Record<string, unknown>
 sourceFreshness: { recordedThrough: number | null }
 notes: string
 workCoverage?: { basis: string; unknownHistoricalWork: boolean }
}
const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)

export function builtinBase(report: BuiltinReport, result: ReportResult): BuiltinResult {
 return { id: report.id, name: report.name, description: report.description, definition: { ...result.definition, columns: [...report.columns] }, asOf: result.asOf, scope: result.scope, excludesErased:result.excludesErased,generatedAt: result.generatedAt, columns: result.columns.filter(column => report.columns.includes(column.key)), rows: [], totals: {}, sourceFreshness: { recordedThrough: result.sourceFreshness.recordedThrough }, notes: report.calculation }
}
export function projectBuiltinResult(actor: Actor, report: BuiltinReport, result: ReportResult): BuiltinResult {
 const output = builtinBase(report, result)
 const measure = ({ measures, withheld }: ReportResult['rows'][number], key: keyof ReportResult['rows'][number]['measures'], column: string) => withheld.includes(column) ? null : measures[key]
 output.rows = result.rows.map(row => {
  const projected: BuiltinRow = { personId: row.personId, name: row.name, source: row.source, cells: Object.fromEntries(report.columns.map(key => [key, row.withheld.includes(key) ? null : row.cells[key] ?? null])), withheld: row.withheld.filter(key => report.columns.includes(key)), measures: {} }
  if(report.id==='builtin-headcount') projected.measures.headcount=row.measures.headcount
  if(report.id==='builtin-fte') projected.measures.fte=measure(row,'fte','fte')
  if(report.id==='builtin-tenure') projected.measures.tenureDays=measure(row,'tenureDays','tenureDays')
  if(report.id==='builtin-leave-balances') projected.measures.leaveMinutes=measure(row,'leaveMinutes','leaveHours')
  if(report.id==='builtin-leave-liability') {projected.measures.liabilityCents=measure(row,'liabilityCents','leaveLiability');projected.measures.currency=projected.measures.liabilityCents===null?null:row.measures.currency}
  if(report.id==='builtin-open-exceptions') {projected.measures.openExceptions=row.measures.openExceptions;projected.exceptionSources=row.exceptionSources.map(source=>({...source}))}
  if(report.id==='builtin-overdue-work') {projected.measures.overdueWork=row.measures.overdueWork;projected.overdueSources=row.overdueSources.map(source=>({...source}))}
  return projected
 })
 const numeric = (key: string) => output.rows.map(row => typeof row.measures[key]==='number' ? row.measures[key] as number : null)
 if(report.id==='builtin-headcount') output.totals.headcount=sum(numeric('headcount'))
 if(report.id==='builtin-fte') output.totals={fte:Math.round(sum(numeric('fte'))*1000)/1000,unknownFte:numeric('fte').filter(value=>value===null).length}
 if(report.id==='builtin-tenure') {const values=numeric('tenureDays'),known=values.filter((value):value is number=>value!==null);output.totals={tenureDays:sum(values),averageTenureDays:known.length?sum(known)/known.length:null,unknownTenure:values.length-known.length}}
 if(report.id==='builtin-leave-balances') output.totals={leaveHours:sum(numeric('leaveMinutes'))/60,unknownLeaveBalances:numeric('leaveMinutes').filter(value=>value===null).length}
 if(report.id==='builtin-leave-liability') {const currencies=[...new Set(output.rows.flatMap(row=>typeof row.measures.currency==='string'?[row.measures.currency]:[]))];output.totals={liability:currencies.map(currency=>({currency,cents:sum(output.rows.filter(row=>row.measures.currency===currency).map(row=>row.measures.liabilityCents as number|null))})),unknownLiability:numeric('liabilityCents').filter(value=>value===null).length}}
 if(report.id==='builtin-open-exceptions') output.totals.openExceptions=sum(numeric('openExceptions'))
 if(report.id==='builtin-overdue-work') {output.totals.overdueWork=sum(numeric('overdueWork'));output.workCoverage={basis:result.workCoverage.basis.replaceAll('FLOW-002','work'),unknownHistoricalWork:result.workCoverage.unknownHistoricalWork}}
 if(report.id==='builtin-turnover') {
  const complete=result.rows.every(row=>readsJobHistoryField(actor,row.personId,'startDate')&&readsJobHistoryField(actor,row.personId,'endDate'))
  const turnover=result.totals.turnover
  output.totals.turnover=complete?{leavers:turnover.leavers,denominator:turnover.denominator,rate:turnover.rate,withheld:false,sources:turnover.sources.map(source=>({...source})),denominatorSources:turnover.denominatorSources.map(source=>({date:source.date,people:source.people.map(person=>({...person}))}))}:{leavers:null,denominator:null,rate:null,withheld:true,sources:[],denominatorSources:[]}
 }
 return output
}
