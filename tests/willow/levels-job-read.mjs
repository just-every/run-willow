// ROLE-004: one job-field source must not become a private employment bundle.
import assert from 'node:assert/strict'
import { readZip } from './export-reader.mjs'
import { day } from './regression-fixture.mjs'
export async function jobReadProof(h,owner,fx) {
 const {api,join}=fx
 const apply=async plan=>api('level.apply',{review:(await api('level.preview',plan)).id})
 const reader=await join('synthetic-willow-450')
 reader.member=(await api('access.give',{person:reader.person})).id
 reader.cookie=await h.signIn('synthetic-willow-450@example.com',{requested:true})
 const read=(path,body,status)=>h.api(path,reader.cookie,body,status)
 const location=await api('location.create',{name:'synthetic-willow-451'})
 const schedule=await api('schedule.create',{name:'synthetic-willow-452',mon:'6',tue:'6',wed:'6',thu:'6',fri:'6'})
 const target=await join('synthetic-willow-453',{locationId:location.id,scheduleId:schedule.id,fte:'0.75',startDate:day(-170)})
 const outside=await join('synthetic-willow-454',{scheduleId:schedule.id,fte:'0.75'})
 const report=await api('report.save',{definition:{name:'synthetic-willow-455',columns:['name','employmentType','fte','phone','payAmount'],asOf:'today'}})
 const plan={kind:'level',name:'synthetic-willow-456',permissions:['reports.read'],scope:{kind:'group',dimensions:{location:[location.id]}},jobFields:{self:{},others:{scheduleId:'view'}}}
 const level=await apply(plan)
 await apply({kind:'assignment',member:reader.member,levels:[level.id]})
 const profile=await read(`people/${target.person}`)
 assert.equal(profile.current.schedule.name,'synthetic-willow-452')
 assert.equal(profile.current.fte,undefined)
 assert.equal(profile.employeeNumber,undefined)
 assert.equal(profile.private,undefined)
 assert.equal(profile.pay,undefined)
 const term=profile.employment[0].terms[0]
 assert.equal(term.schedule.name,'synthetic-willow-452')
 for(const key of ['jobTitle','department','location','manager','fte','pay','reason','recordedAt'])assert.equal(term[key],undefined,`Schedule authority does not grant historical ${key}`)
 for(const key of ['startDate','endDate','employmentType','legalEntity'])assert.equal(profile.employment[0][key],undefined)
 assert.equal((await read(`people/${outside.person}`)).employment,undefined,'The field follows its own scope')
 assert.equal((await read(`context/${target.person}`)).record.current.schedule.name,'synthetic-willow-452')
 const preview=await api(`preview?member=${reader.member}&person=${target.person}`)
 assert.equal(preview.view.current.schedule.name,'synthetic-willow-452')
 assert.equal(preview.jobFields.find(row=>row.field==='fte').visible,false)
 const source=await api(`people/${target.person}`)
 await read('job.field',{person:target.person,field:'scheduleId',value:fx.schedule,revision:source.employment[0].revision,effectiveFrom:day(1),reason:'synthetic-willow-457'},403)
 await read('change.request',{person:target.person,scheduleId:fx.schedule,effectiveFrom:day(1),reason:'synthetic-willow-457'},403)
 const selected='name,schedule,fte,employmentType,startDate,endDate,payAmount,phone'
 for(const format of ['csv','xlsx','zip']) {
  const response=await h.raw(`/app/exports/employees.${format}?scope=organization&person=${target.person}&fields=${selected}${format==='zip'?'&history=employment':''}`,{cookie:reader.cookie})
  assert.equal(response.status,200)
  const bytes=Buffer.from(await response.arrayBuffer()),body=format==='csv'?bytes.toString():[...readZip(bytes).values()].map(value=>value.toString()).join('\n')
  assert.ok(body.includes('synthetic-willow-452'))
  for(const value of ['81234.56','8123456','PRIVATE-synthetic-willow-453',day(-170)])assert.ok(!body.includes(value),`${format} withholds ungranted job and private values`)
 }
 const rows=await read(`custom-reports/${report.id}`)
 assert.ok(rows.result.rows.every(row=>row.withheld.includes('fte')&&row.withheld.includes('employmentType')&&row.withheld.includes('phone')&&row.withheld.includes('payAmount')))
 const fields=['jobTitle','departmentId','locationId','managerPersonId','scheduleId','employmentType','employmentStatus','fte','startDate','endDate']
 await apply({...plan,level:level.id,jobFields:{self:{},others:Object.fromEntries(fields.map(key=>[key,'view']))}})
 const full=await read(`people/${target.person}`)
 assert.equal(full.current.fte,0.75)
 assert.equal(full.employment[0].startDate,day(-170))
 assert.equal(full.employment[0].employmentType,'full_time')
 assert.equal(full.pay,undefined)
 assert.equal(full.employment[0].terms[0].pay,undefined)
 const pages=[`/app/people/${target.person}`,`/api/willow/people/${target.person}`,`/api/willow/context/${target.person}`,`/api/willow/custom-reports/${report.id}`,`/app/reports/custom/${report.id}.csv`,`/app/reports/custom/${report.id}.xlsx`,`/app/exports/employees.csv?scope=organization&fields=${selected}`]
 for(const path of pages){const body=await(await h.raw(path,{cookie:reader.cookie})).text();for(const value of ['81234.56','8123456','PRIVATE-synthetic-willow-453'])assert.ok(!body.includes(value),`Job View grants no pay/private data on ${path}`)}
 await apply({...plan,level:level.id,jobFields:{self:{},others:{}}})
 assert.equal((await read(`people/${target.person}`)).employment,undefined)
 assert.equal((await api(`preview?member=${reader.member}&person=${target.person}`)).jobFields.find(row=>row.field==='scheduleId').visible,false)
 assert.equal((await read(`context/${target.person}`)).record.current.schedule,undefined)
 for(const path of pages)assert.ok(!(await(await h.raw(path,{cookie:reader.cookie})).text()).includes('synthetic-willow-452'),`Same session revocation on ${path}`)
 console.log('ROLE-004 job reads: PASS — exact historical fields, scope, page/JSON/context/preview/CSV/XLSX/ZIP/report withholding, view-only refusals and same-session revocation')
 return {reader,target,outside,level,plan,schedule,report,location}
}
