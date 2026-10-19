// Restricted, human-reviewed leave cases and append-only intermittent usage.
import type { Bindings } from '../../auth.server'
import { can, requirePermission, type Actor } from '../actor'
import { all, auditRead, commit, guard, insist, newId, now, one, stmt, type Row } from '../core'
import { parseHours, requireDate } from '../dates'
import { serve, store } from '../files'
import type { Input } from '../input'

export const managesProtected = (actor:Actor)=>can(actor,'leave.manage')
const fullRead = (actor:Actor,row:Row)=>managesProtected(actor)||actor.personId===row.person_id
const certificationStatement=(env:Bindings,actor:Actor,caseId:string,id:string,file:{filename:string;mediaType:string;size:number;sha256:string})=>stmt(env,'INSERT INTO wl_protected_certifications(id,case_id,filename,media_type,size,sha256,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?,?,?)',id,caseId,file.filename,file.mediaType,file.size,file.sha256,actor.id,now())

export async function openProtected(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'leave.manage')
 const person=input.text('person',{max:100})
 insist(await one(env,'SELECT 1 FROM wl_people WHERE id=?',person),'not_found',404)
 const start=requireDate(input.text('startDate'),'invalid_startDate'),end=requireDate(input.text('endDate'),'invalid_endDate')
 insist(end>=start,'end_before_start')
 const entitlement=parseHours(input.text('entitlementHours',{max:10}),'invalid_entitlement')
 insist(entitlement>0,'invalid_entitlement')
 const title=input.text('title',{max:160}),review=input.text('reviewNote',{max:2000})
 const file=await input.file('certification',{optional:true,maxBytes:10_000_000})
 const stored=file?await store(env,file):null,id=newId()
 await commit(env,[stmt(env,'INSERT INTO wl_protected_cases(id,person_id,title,start_date,end_date,entitlement_minutes,review_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,person,title,start,end,entitlement,review,actor.id,now()),...(stored?[certificationStatement(env,actor,id,newId(),stored)]:[])],{actor:actor.id,action:'protected.open',subject:id,detail:{person,entitlementMinutes:entitlement}})
 return {id,status:'employer_reviewed',notice:'Case recorded following employer review. This is not a legal approval.'}
}

async function managedCase(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'leave.manage')
 const row=await one(env,'SELECT * FROM wl_protected_cases WHERE id=?',input.text('case',{max:100}))
 insist(row,'not_found',404);return row
}

export async function certifyProtected(env:Bindings,actor:Actor,input:Input) {
 const row=await managedCase(env,actor,input)
 const file=(await input.file('certification',{maxBytes:10_000_000}))!,stored=await store(env,file),id=newId()
 await commit(env,[certificationStatement(env,actor,row.id,id,stored)],{actor:actor.id,action:'protected.certify',subject:row.id,detail:{version:id}})
 return {id:row.id}
}

export async function recordProtectedAbsence(env:Bindings,actor:Actor,input:Input) {
 const row=await managedCase(env,actor,input)
 const start=requireDate(input.text('startDate'),'invalid_startDate'),end=requireDate(input.text('endDate'),'invalid_endDate')
 insist(end>=start&&start>=row.start_date&&end<=row.end_date,'outside_protected_case')
 const minutes=parseHours(input.text('hours',{max:10}),'invalid_hours');insist(minutes>0,'invalid_hours')
 const id=newId()
 await commit(env,[guard(env,'entitlement_exceeded','?-(SELECT COALESCE(SUM(minutes),0) FROM wl_protected_absences WHERE case_id=?)>=?',row.entitlement_minutes,row.id,minutes),stmt(env,'INSERT INTO wl_protected_absences(id,case_id,start_date,end_date,minutes,note,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?)',id,row.id,start,end,minutes,input.text('note',{max:1000}),actor.id,now())],{actor:actor.id,action:'protected.absence',subject:row.id,detail:{entry:id,minutes}})
 return {id:row.id,entry:id}
}

export async function reverseProtectedAbsence(env:Bindings,actor:Actor,input:Input) {
 const row=await managedCase(env,actor,input),entry=await one(env,'SELECT * FROM wl_protected_absences WHERE id=? AND case_id=? AND reverses IS NULL',input.text('entry',{max:100}),row.id)
 insist(entry,'not_found',404)
 const id=newId()
 await commit(env,[guard(env,'stale','NOT EXISTS(SELECT 1 FROM wl_protected_absences WHERE reverses=?)',entry.id),stmt(env,'INSERT INTO wl_protected_absences(id,case_id,start_date,end_date,minutes,note,reverses,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)',id,row.id,entry.start_date,entry.end_date,-entry.minutes,input.text('note',{max:1000}),entry.id,actor.id,now())],{actor:actor.id,action:'protected.reverse',subject:row.id,detail:{entry:id,reverses:entry.id}})
 return {id:row.id}
}

/** A manager receives dates only, never the case title, entitlement, review or certification metadata. */
export async function protectedCase(env:Bindings,actor:Actor,id:string) {
 const row=await one(env,'SELECT * FROM wl_protected_cases WHERE id=?',id)
 insist(row,'not_found',404)
 const full=fullRead(actor,row),manager=actor.reports.has(row.person_id)
 insist(full||manager,'not_found',404)
 const entries=await all(env,'SELECT * FROM wl_protected_absences WHERE case_id=? ORDER BY recorded_at,id',id)
 const active=entries.filter(e=>!e.reverses&&!entries.some(r=>r.reverses===e.id))
 if(!full){insist(active.length,'not_found',404);return {id,person:row.person_id,absences:active.map(e=>({startDate:e.start_date,endDate:e.end_date}))}}
 await auditRead(env,actor.id,'protected.read',id)
 return {id,person:row.person_id,title:row.title,startDate:row.start_date,endDate:row.end_date,entitlementMinutes:row.entitlement_minutes,remainingMinutes:row.entitlement_minutes-entries.reduce((sum,e)=>sum+e.minutes,0),reviewNote:row.review_note,status:'employer_reviewed',legalApproval:false,
  canManage:managesProtected(actor),absences:entries.map(e=>({id:e.id,startDate:e.start_date,endDate:e.end_date,minutes:e.minutes,note:e.note,reverses:e.reverses,recordedAt:e.recorded_at,reversed:entries.some(r=>r.reverses===e.id)})),
  certifications:(await all(env,'SELECT id,filename,size,sha256,uploaded_at FROM wl_protected_certifications WHERE case_id=? ORDER BY uploaded_at,id',id)).map(c=>({id:c.id,filename:c.filename,size:c.size,sha256:c.sha256,uploadedAt:c.uploaded_at}))}
}

export async function protectedCases(env:Bindings,actor:Actor) {
 const rows=await all(env,'SELECT id,person_id FROM wl_protected_cases ORDER BY created_at DESC'),results=[]
 for(const row of rows) {
  if(!fullRead(actor,row)&&!actor.reports.has(row.person_id))continue
  if(!fullRead(actor,row)&&!await one(env,'SELECT 1 FROM wl_protected_absences a WHERE case_id=? AND reverses IS NULL AND NOT EXISTS(SELECT 1 FROM wl_protected_absences r WHERE r.reverses=a.id)',row.id))continue
  results.push(await protectedCase(env,actor,row.id))
 }
 return results
}

export async function protectedCertification(env:Bindings,actor:Actor,id:string,version?:string) {
 const row=await one(env,'SELECT * FROM wl_protected_cases WHERE id=?',id)
 insist(row&&fullRead(actor,row),'not_found',404)
 const cert=version?await one(env,'SELECT * FROM wl_protected_certifications WHERE case_id=? AND id=?',id,version):await one(env,'SELECT * FROM wl_protected_certifications WHERE case_id=? ORDER BY uploaded_at DESC,id DESC LIMIT 1',id)
 insist(cert,'not_found',404)
 await auditRead(env,actor.id,'protected.certification.read',id,{version:cert.id})
 return serve(env,{filename:cert.filename,mediaType:cert.media_type,size:cert.size,sha256:cert.sha256},{download:true})
}
