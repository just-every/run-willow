import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { insist, type Row } from '../core'
import { personView } from '../profile'

export async function mergeValues(env:Bindings,actor:Actor,person:string,fields:Row[]) {
 const view=await personView(env,actor,person) as any
 const values:Record<string,string>={}
 for(const field of fields) {
  if(field.kind==='employee_name')values.employee_name=view.legalName
  if(field.kind==='job_title')values.job_title=view.current?.jobTitle??''
  if(field.kind==='work_email')values.work_email=view.workEmail??''
  if(field.kind==='employee_number')values.employee_number=view.employeeNumber??''
  if(field.kind==='start_date')values.start_date=view.current?.startDate??view.employment?.find((p:any)=>p.id===view.selectedPeriod)?.startDate??''
  if(field.kind==='department')values.department=view.current?.department?.name??''
  if(field.kind==='location')values.location=view.current?.location?.name??''
  if(field.kind==='compensation') {
   const term=view.employment?.flatMap((p:any)=>p.terms).find((t:any)=>t.id===view.current?.id)
   insist(term?.pay,'signature_compensation_denied',403)
   values.compensation=`${term.pay.currency} ${(term.pay.amountCents/100).toFixed(2)} ${term.pay.basis}`
  }
 }
 return values
}

