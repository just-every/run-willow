// The page and both downloads share the exact selected result projection.
import type { BuiltinResult } from './builtin-result'
import { excludesText } from '../retention/excluded'
const LABELS:Record<string,string>={total:'People in aggregate',suppressed:'Privacy suppression',headcount:'Headcount',fte:'FTE',unknownFte:'Unknown or withheld FTE',tenureDays:'Total tenure (days)',averageTenureDays:'Average tenure (days)',unknownTenure:'Unknown or withheld tenure',leaveHours:'Leave balance (hours)',unknownLeaveBalances:'Unknown or withheld balances',unknownLiability:'Unknown or withheld liability',openExceptions:'Open exceptions',overdueWork:'Overdue work',readableDocuments:'Readable documents',withheldPeople:'People with withheld document access',acknowledged:'Acknowledged receipts',awaitingAcknowledgement:'Awaiting acknowledgement'}
const number=(value:unknown)=>value===null?'Unknown / withheld':typeof value==='boolean'?(value?'Yes':'No'):typeof value==='number'?value.toLocaleString('en-US',{maximumFractionDigits:3}):String(value)
export function builtinMeasures(result:BuiltinResult):string[][] {
 const rows:string[][]=[]
 for(const [key,value] of Object.entries(result.totals)) {
  if(key==='liability'&&Array.isArray(value))for(const item of value)rows.push(['Leave liability',`${item.currency} ${(item.cents/100).toFixed(2)}`])
  else if(key==='turnover'&&value&&typeof value==='object') {
   const t=value as {leavers:number|null;denominator:number|null;rate:number|null;withheld:boolean}
   rows.push(['Leavers in range',number(t.leavers)],['Average endpoint headcount',number(t.denominator)],['Turnover rate',t.rate===null?'Unknown / withheld':`${number(t.rate*100)}%`])
  } else if(typeof value!=='object'||value===null)rows.push([LABELS[key]??key,number(value)])
 }
 return rows
}
export function builtinRows(result:BuiltinResult):string[][] {
 return [[result.name],['As of',result.asOf],['Scope',result.scope],...(result.excludesErased?[[excludesText(result.excludesErased)]]:[]),['From',result.definition.from],['Through',result.definition.to],result.columns.map(column=>column.label),...result.rows.map(row=>result.columns.map(column=>row.withheld.includes(column.key)?'Withheld':row.cells[column.key]??'Unknown / not recorded')),...builtinMeasures(result),['Calculation',result.notes],...(result.workCoverage?[['Work coverage',result.workCoverage.basis]]:[])]
}
