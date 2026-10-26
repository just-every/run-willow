import type { ReportResult } from './execute'
import { SIGNATURE_COLUMNS } from './signatures'

const instant=(at:number|null)=>at===null?'Unknown / not recorded':new Date(at).toISOString()
export function signatureReportRows(report:ReportResult):string[][] {
 const totals=report.signatureTotals,coverage=report.signatureCoverage
 if(!totals||!coverage)return []
 return [
  ['Signature issued from',report.definition.from],['Signature issued through',report.definition.to],
  ['Signature template filter',report.definition.signatureTemplate||'All permitted templates'],
  ['Signature cohort filter',report.definition.signatureCohort||'All permitted cohorts'],
  ['Signature state filter',report.definition.signatureState||'All permitted states'],
  ...Object.entries(SIGNATURE_COLUMNS).map(([key,label])=>[label,String((totals as Record<string,unknown>)[key])]),
  ['People with withheld signature status',String(totals.withheldPeople)],
  ['Signature freshness',instant(coverage.observedThrough)],['Signature coverage',coverage.basis],
  ['Signature source request','Person','Template','Cohort','Document','State','Created','Expires','Viewed','Completed','Closed','Source'],
  ...totals.sources.map(source=>[source.id,source.personId,source.template,source.cohort,source.title,source.state,
   instant(source.createdAt),instant(source.expiresAt),instant(source.viewedAt),instant(source.completedAt),instant(source.closedAt),source.source]),
 ]
}
