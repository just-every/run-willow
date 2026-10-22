import { excludesText } from '../retention/excluded'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { formatDate } from '../dates'
import { builtinReports,runBuiltinReport } from '../reporting/builtins'
import { builtinMeasures } from '../reporting/builtin-format'
import type { BuiltinResult } from '../reporting/builtin-result'
import { h,page,table } from './html'
const route='/app/reports/library'
export async function builtinReportsPage(env:Bindings,actor:Actor,url:URL) {
 const reports=await builtinReports(env,actor)
 return page('Report library',actor,h`<header class="page-head"><h1>Report library</h1><p>Built-in reports use your current field access and the people your reporting rights reach.</p></header><section class="card"><h2>Available reports</h2>${reports.length?table(['Report','About this report'],reports.map(report=>[h`<a href="${route}/${report.id}">${report.name}</a>`,report.description])):h`<p>No built-in reports are selected for your levels.</p>`}</section>`,{current:route,url})
}
function sources(result:BuiltinResult) {
 const turnover=result.totals.turnover as {sources?:{personId:string;source:string;endDate:string}[];denominatorSources?:{date:string;people:{personId:string;source:string}[]}[]}|undefined
 return h`${turnover&&!turnover.sources?.length&&!turnover.denominatorSources?.length?'':turnover?h`<section class="card"><h2>Turnover source records</h2><h3>Leavers</h3>${turnover.sources?.length?h`<ul>${turnover.sources.map(row=>h`<li><a href="${row.source}">Employment ending ${formatDate(row.endDate)}</a></li>`)}</ul>`:h`<p>No readable leavers in the range.</p>`}${turnover.denominatorSources?.map(group=>h`<h3>Headcount at ${formatDate(group.date)}</h3><ul>${group.people.map(person=>h`<li><a href="${person.source}">Person record</a></li>`)}</ul>`)}</section>`:''}`
}
export async function builtinReportPage(env:Bindings,actor:Actor,id:string,url:URL) {
 const result=await runBuiltinReport(env,actor,id,url),query=url.search
 const sourceRows=result.rows.map(row=>[...result.columns.map(column=>row.withheld.includes(column.key)?h`<strong>Withheld</strong>`:row.cells[column.key]??'Unknown / not recorded'),h`<a href="${row.source}">${row.name}: source record</a>${row.exceptionSources?.length?h`<ul>${row.exceptionSources.map(source=>h`<li><a href="${source.path}">${source.kind}</a></li>`)}</ul>`:''}${row.overdueSources?.length?h`<ul>${row.overdueSources.map(source=>h`<li><a href="${source.path}">${source.kind}</a></li>`)}</ul>`:''}`])
 return page(result.name,actor,h`<p class="back"><a href="${route}">← Report library</a></p><header class="page-head"><h1>${result.name}</h1><p>${result.description}</p></header><p>${result.scope} · Record as of ${formatDate(result.asOf)}</p><p class="actions"><a class="button secondary" href="${route}/${id}.csv${query}">Download CSV</a><a class="button secondary" href="${route}/${id}.xlsx${query}">Download XLSX</a><a href="/api/willow/builtin-reports/${id}${query}">JSON record</a></p><section class="card"><h2>Report results</h2>${result.excludesErased?h`<p role="status">${excludesText(result.excludesErased)}</p>`:''}<p>Withheld means your current access does not permit the value. Unknown / not recorded means the readable record has no value.</p>${sourceRows.length?table([...result.columns.map(column=>column.label),'Source'],sourceRows):h`<p>No readable records match this report.</p>`}</section><section class="card"><h2>Calculation and coverage</h2>${table(['Measure','Result'],builtinMeasures(result))}<p>${result.notes}</p>${result.workCoverage?h`<p>${result.workCoverage.basis}</p>`:''}<p>Definitions are read only. Current access applies to every page and download.</p></section>${sources(result)}`,{current:route,url})
}
