// Bands and job levels share effective dates with the people record. Each correction appends a version.
import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, auditRead, commit, guard, insist, newId, now, one, stmt } from '../core'
import { requireDate } from '../dates'
import type { Input } from '../input'

export async function businessVersion(env: Bindings) {
 return (await one<{seq:number}>(env,"SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit WHERE action NOT LIKE '%.read'"))!.seq
}
export const guardBandSnapshot=(env:Bindings,source:number)=>guard(env,'compensation_source_changed',"(SELECT COALESCE(MAX(seq),0) FROM wl_audit WHERE action NOT LIKE '%.read') = ?",source)
export function cents(value:string) {
 insist(/^\d{1,9}(\.\d{1,2})?$/.test(value),'invalid_compensation_amount')
 const [whole,fraction='']=value.split('.');return Number(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))
}
export function annualCents(basis:string,amount:number,weeklyMinutes:number) {
 insist(basis==='salary'||basis==='hourly','compensation_basis_unknown',409)
 if(basis==='salary')return amount
 insist(weeklyMinutes>0,'compensation_schedule_unknown',409)
 const product=BigInt(amount)*BigInt(weeklyMinutes)*52n
 const result=Number((product*2n+60n)/120n);insist(Number.isSafeInteger(result),'compensation_out_of_range');return result
}
export async function jobLevel(env:Bindings,personId:string,date:string) {
 const field=await one(env,"SELECT f.id FROM wl_custom_fields f JOIN wl_custom_field_versions d ON d.field_id=f.id WHERE f.key='job_level' AND f.classification='general' AND d.id=(SELECT v.id FROM wl_custom_field_versions v WHERE v.field_id=f.id AND v.effective_from<=? ORDER BY effective_from DESC,version DESC LIMIT 1) AND d.type='text' AND d.retired=0",date)
 if(!field)return {level:null,revision:null}
 const row=await one(env,'SELECT id,value_json FROM wl_custom_field_values WHERE person_id=? AND field_id=? AND effective_from<=? ORDER BY effective_from DESC,sequence DESC LIMIT 1',personId,field.id,date)
 const value=row?JSON.parse(row.value_json):null
 return {level:typeof value==='string'&&value.trim()?value:null,revision:row?.id??null}
}
export async function bandPosition(env:Bindings,subject:{personId:string;date:string;jobTitle:string;locationId:string|null;basis:string;amountCents:number|null}) {
 const source=await businessVersion(env),level=await jobLevel(env,subject.personId,subject.date)
 const band=level.level?await one(env,'SELECT * FROM wl_comp_bands WHERE job_title=? AND level=? AND location_id=? AND basis=? AND effective_from<=? ORDER BY effective_from DESC,recorded_at DESC,id DESC LIMIT 1',subject.jobTitle,level.level,subject.locationId??'',subject.basis,subject.date):null
 const position: 'below'|'within'|'above'|'unbanded'=!band||subject.amountCents===null?'unbanded':subject.amountCents<band.minimum_cents?'below':subject.amountCents>band.maximum_cents?'above':'within'
 return {position,band,level:level.level,levelRevision:level.revision,source}
}
export async function defineBand(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage','pay.read')
 const job=input.text('jobTitle',{max:120}),level=input.text('level',{max:120}),location=input.text('location',{optional:true,max:100}),basis=input.text('basis',{max:10}),date=requireDate(input.text('effectiveFrom'),'invalid_effectiveFrom')
 insist(['salary','hourly'].includes(basis),'invalid_basis')
 const minimum=cents(input.text('minimum')),maximum=cents(input.text('maximum'));insist(maximum>=minimum,'invalid_band_range')
 insist((await one(env,'SELECT currency FROM wl_employer'))?.currency==='USD','compensation_usd_required',409)
 if(location)insist(await one(env,'SELECT 1 FROM wl_locations WHERE id=?',location),'location_not_found',404)
 const id=newId()
 await commit(env,[stmt(env,'INSERT INTO wl_comp_bands (id,job_title,level,location_id,basis,effective_from,minimum_cents,maximum_cents,recorded_at,recorded_by) VALUES (?,?,?,?,?,?,?,?,?,?)',id,job,level,location,basis,date,minimum,maximum,now(),actor.id)],{actor:actor.id,action:'compensation.band',subject:id,detail:{job,level,basis,effectiveFrom:date}})
 return {id}
}
export async function bands(env:Bindings,actor:Actor) {
 requirePermission(actor,'pay.read');await auditRead(env,actor.id,'compensation.bands.read','employer')
 return all(env,'SELECT * FROM wl_comp_bands ORDER BY effective_from DESC,recorded_at DESC,id DESC')
}
