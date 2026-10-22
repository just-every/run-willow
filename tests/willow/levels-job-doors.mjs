// Extend WIL-03's registered-door crawl with one exact scoped job grant.
import assert from 'node:assert/strict'
export async function jobDoorProof(h,owner,reader,{ids,urls,today,addDays}) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const apply=async plan=>api('level.apply',{review:(await api('level.preview',plan)).id})
 const schedule=await api('schedule.create',{name:'synthetic-willow-9801',mon:'5',tue:'5',wed:'5',thu:'5',fri:'5'})
 const target=await api('joiner.start',{template:ids.joinerTemplate,legalName:'synthetic-willow-9802',startDate:addDays(today,-150),employmentType:'full_time',jobTitle:'synthetic-willow-9803',scheduleId:schedule.id,locationId:ids.sydney,fte:'0.625',payBasis:'salary',payAmount:'91837.14',phone:'synthetic-willow-9804',employeeNumber:'synthetic-willow-9805'})
 const fields=['jobTitle','departmentId','locationId','managerPersonId','scheduleId','employmentType','employmentStatus','fte','startDate','endDate']
 const plan={kind:'level',name:'synthetic-willow-9806',permissions:[],scope:{kind:'group',dimensions:{location:[ids.sydney]}},jobFields:{self:{},others:Object.fromEntries(fields.map(key=>[key,'view']))}}
 const level=await apply(plan)
 await apply({kind:'assignment',member:ids.ivanMember,levels:[level.id]})
 const doors=[...urls,`/api/willow/people/${target.person}`,`/api/willow/context/${target.person}`,`/app/people/${target.person}`]
 let sawSchedule=false
 for(const path of doors){const body=await(await h.raw(path,{cookie:reader})).text();for(const value of ['91837.14','9183714','synthetic-willow-9804','synthetic-willow-9805'])assert.ok(!body.includes(value),`Job-only level leaked private compensation through ${path}`);if(body.includes('synthetic-willow-9801'))sawSchedule=true}
 assert.ok(sawSchedule,'The granted job schedule is readable through real doors')
 const view=await h.api(`people/${target.person}`,reader)
 await h.api('job.field',reader,{person:target.person,field:'jobTitle',value:'synthetic-willow-9807',revision:view.employment[0].revision,effectiveFrom:addDays(today,1),reason:'synthetic-willow-9808'},403)
 await apply({...plan,level:level.id,jobFields:{self:{},others:{}}})
 for(const path of doors){const body=await(await h.raw(path,{cookie:reader})).text();for(const value of ['synthetic-willow-9801','91837.14','9183714','synthetic-willow-9804','synthetic-willow-9805'])assert.ok(!body.includes(value),`Revoked job-only level leaked through ${path}`)}
 console.log(`ROLE-004 every-door job crawl: PASS — ${doors.length} registered and subject doors, scoped View, no pay/private authority, view-only write refusal and same-session revocation`)
}
