import type { Bindings } from '../../auth.server'
import { actorFor, can, type Actor } from '../actor'
import { readsCategory, sees } from '../access'
import { all, one, type Row } from '../core'
import { currentMembership, matchesAudience } from '../company/audience'
import { signatureTemplates } from './templates'

/** A scheduler rebuilds current authority; the reviewed initiator's session is never retained. */
export async function signingMember(env:Bindings,id:string):Promise<Actor|null> {
 const m=await one(env,"SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON o.id=m.operator_id WHERE m.id=? AND m.status='active' AND o.status='active'",id)
 if(!m)return null
 try {return await actorFor(env,{id:m.id,email:m.email,name:m.name,personId:m.person_id,owner:m.role==='owner',sessionId:''})} catch {return null}
}

export async function liveCohort(env:Bindings,cohort:Row) {
 if(cohort.stopped_at)return null
 const initiator=await signingMember(env,cohort.initiator)
 if(!initiator||!can(initiator,'people.manage'))return null
 const template=(await signatureTemplates(env,initiator)).find(t=>t.id===cohort.template_id)
 if(!template?.current||!template.approvedAt||template.digest!==cohort.template_digest||template.sourceVersion!==cohort.source_version||template.sourceSha256!==cohort.source_sha256||template.category!==cohort.category_id)return null
 const category=await one(env,'SELECT * FROM wl_doc_categories WHERE id=?',cohort.category_id)
 const counter=await signingMember(env,cohort.hr_member)
 if(!category||!counter||!can(counter,'people.manage'))return null
 return {initiator,template,category,counter}
}

/** Current shared-folder targeting and source-field rights apply to every enrollment and outreach. */
export async function cohortRecipient(env:Bindings,cohort:Row,personId:string,context:NonNullable<Awaited<ReturnType<typeof liveCohort>>>) {
 const member=await one(env,"SELECT id FROM wl_members WHERE person_id=? AND status='active'",personId)
 const employee=member?await signingMember(env,member.id):null
 const membership=employee?await currentMembership(env,employee):null
 if(!employee||!membership)return null
 if(cohort.cohort_kind==='location'&&membership.location_id!==cohort.cohort_value)return null
 if(cohort.cohort_kind==='department'&&membership.department_id!==cohort.cohort_value)return null
 if(cohort.cohort_kind==='employment_type'&&!await one(env,'SELECT 1 FROM wl_periods WHERE person_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?) AND employment_type=?',personId,employee.today,employee.today,cohort.cohort_value))return null
 if(cohort.cohort_kind==='access_level'&&!await one(env,'SELECT 1 FROM wl_member_levels WHERE member_id=? AND level_id=?',employee.id,cohort.cohort_value))return null
 const {initiator,category,counter,template}=context
 if(!readsCategory(initiator,personId,category)||!readsCategory(employee,personId,category)||!readsCategory(counter,personId,category))return null
 if(template.signers.length>1&&employee.id===counter.id)return null
 if(template.fields.some((f:Row)=>f.kind==='compensation')&&!sees(initiator,personId,'pay'))return null
 const folder=await one(env,`SELECT f.* FROM wl_company_folder_versions f JOIN wl_company_files file ON file.folder_id=f.folder_id JOIN wl_company_file_versions v ON v.file_id=file.id WHERE v.id=? AND f.version=(SELECT MAX(version) FROM wl_company_folder_versions WHERE folder_id=f.folder_id)`,cohort.source_version)
 if(!folder||folder.retired||!matchesAudience(folder,await currentMembership(env,employee)))return null
 return employee
}

export async function pendingSignature(env:Bindings,requestId:string,instant:number) {
 const request=await one(env,"SELECT * FROM wl_sign_requests WHERE id=? AND state IN ('sent','viewed') AND expires_at>?",requestId,instant)
 if(!request)return null
 const cohort=await one(env,'SELECT * FROM wl_sign_cohorts WHERE id=? AND stopped_at IS NULL',request.cohort)
 if(!cohort)return null
 const context=await liveCohort(env,cohort)
 if(!context)return null
 const employee=await cohortRecipient(env,cohort,request.person_id,context)
 if(!employee)return null
 const signed=await all(env,"SELECT signer FROM wl_sign_events WHERE request_id=? AND kind='sign' ORDER BY signer",request.id)
 const signer=signed.length
 if(signer>=context.template.signers.length)return null
 return {request,cohort,...context,employee,signer,recipient:signer===0?employee:context.counter}
}
