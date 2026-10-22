// Field projections shared by records, previews, bundles and their consumers.
import type { Actor } from './actor'
import { hasJobBaseline, readsJobHistoryField, type JobField } from './levels/job'
import type { Row } from './core'

export function projectJobEmployment(actor:Actor, person:string, employment:Record<string,any>[], allow?:(field:JobField)=>boolean) {
 const reads=(field:JobField)=>readsJobHistoryField(actor,person,field)&&(!allow||allow(field))
 const baseline=hasJobBaseline(actor,person)
 const names:Record<string,JobField>={startDate:'startDate',endDate:'endDate',employmentType:'employmentType'}
 const termNames:Record<string,JobField>={jobTitle:'jobTitle',department:'departmentId',division:'departmentId',location:'locationId',manager:'managerPersonId',schedule:'scheduleId',fte:'fte'}
 return employment.map(period=>{
  const result={...period}
  for(const [key,field] of Object.entries(names)) if(!reads(field)) delete result[key]
  if(!baseline) {delete result.legalEntity;delete result.status}
  result.terms=period.terms.map((term:Row)=>{
   const item={...term}
   if(!reads('startDate') && term.effectiveFrom===period.startDate)delete item.effectiveFrom
   for(const [key,field] of Object.entries(termNames)) if(!reads(field)) delete item[key]
   if(!baseline) {delete item.reason;delete item.recordedAt}
   return item
  })
  return result
 })
}
