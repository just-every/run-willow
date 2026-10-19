// LEAVE-001: complete policy engine and protected-leave acceptance through public Worker doors.
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as pathJoin } from 'node:path'
import { harness,file } from './harness.mjs'
import { fixture,today,day } from './regression-fixture.mjs'
import { browserEvidence } from './leave-policies-browser.mjs'
const directory=await mkdtemp(pathJoin(tmpdir(),'willow-pto-'))
let h=await harness({persistTo:directory,scheduled:true})
try {
 await h.raw('/auth/bootstrap',{body:{token:h.vars.SETUP_TOKEN,displayName:'Olive Owner'}})
 const owner=await h.signIn(h.vars.OWNER_EMAIL)
 const awaitOwnerId=(await h.api('me',owner)).id
 await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
 const {api,staff:s,join,templates,schedule}=await fixture(h,owner)
 const names={managera:'Maya Chen',managerb:'Leo Ortiz',employee:'Elena Patel',payroll:'Noah Brooks',hr:'Harper Jones',ended:'Avery Singh',invited:'Sofia Martinez'}
 for(const [key,staff] of Object.entries(s)){const r=await api(`people/${staff.person}`);await api('person.update',{person:staff.person,revision:r.revision,legalName:names[key],preferredName:'',workEmail:r.workEmail,employeeNumber:''})}
 await api('employer.configure',{name:'Harbour People',timezone:'America/Chicago',country:'US',currency:'USD'})
 const as=(cookie,path,body,status=200)=>h.api(path,cookie,body,status)
 const ca=(await api('location.create',{name:'San Francisco',timezone:'America/Los_Angeles',workState:'CA'})).id
 const tx=(await api('location.create',{name:'Austin',timezone:'America/Chicago',workState:'TX'})).id
 const short=(await api('schedule.create',{name:'Half days',mon:'4',tue:'4',wed:'4',thu:'4',fri:'4',sat:'4',sun:'4'})).id
 const tiers=[{afterMonths:0,allowance:{unit:'hours',amount:366}},{afterMonths:12,allowance:{unit:'hours',amount:730}}]
 const rules={kind:'vacation',eligibility:{employmentTypes:['full_time','part_time'],waitingDays:0},tiers,cadence:'daily',proration:'calendar_days',capMinutes:1000,carryover:{capMinutes:300,expiresOn:'01-03'},locations:[]}
 const policy=async(name,r=rules)=>as(s.hr.cookie,'policy.write',{name,summary:'Reviewed employer policy; no statutory determination',accrualWeeks:'0',negativeLimitHours:'2',rules:r})
 const account=async(person,policy,cutoverDate,openingHours='10')=>{
  const a=await api('account.open',{period:person.period,policy:policy.policy,cutoverDate,openingHours,note:'Reviewed balance'})
  await api('account.approve',{account:a.id});return a.id
 }
 const record=async(person,account)=> (await api(`people/${person}`)).leave.accounts.find(a=>a.id===account)
 const p=await policy('California tiered vacation')
 await as(s.hr.cookie,'policy.approve',{version:p.id},403)
 const salaried=await join('Isabel Rivera',{workEmail:'isabel@example.com',startDate:'2024-01-01',locationId:ca})
 await api('account.open',{period:salaried.period,policy:p.policy,cutoverDate:'2024-12-29',openingHours:'10',note:'Not yet approved'},409)
 await api('policy.approve',{version:p.id})
 const a=await account(salaried,p,'2024-12-29')
 await api('leave.accrue',{account:a,through:'2024-12-31'})
 assert.equal((await record(salaried.person,a)).balanceMinutes,720,'LEAVE-001 leap-year proration before service tier')
 await api('leave.accrue',{account:a,through:'2025-01-01'})
 assert.equal((await record(salaried.person,a)).balanceMinutes,420,'LEAVE-001 January carryover and inclusive service tier')
 await api('leave.accrue',{account:a,through:'2025-01-03'})
 assert.equal((await record(salaried.person,a)).balanceMinutes,660,'LEAVE-001 carryover remains usable through expiry day')
 await api('leave.accrue',{account:a,through:'2025-01-04'})
 const expired=await record(salaried.person,a)
 assert.equal(expired.balanceMinutes,480,'LEAVE-001 only unused carryover expires on following day')
 assert.equal(expired.ledger.reduce((n,e)=>n+e.minutes,0),expired.balanceMinutes)
 assert.ok(expired.calculations.some(c=>JSON.stringify(c).includes('2025-01-04')),'LEAVE-001 durable explanations survive public reads')
 // Two reviewed work-state variants, dated transfer and hours from the dated schedule.
 const variants={...rules,tiers:[{afterMonths:0,allowance:{unit:'weeks',amount:52}}],capMinutes:10000,carryover:{capMinutes:null,expiresOn:null},locations:[{locationId:ca,reviewNote:'CA policy reviewed by employer',tiers:[{afterMonths:0,allowance:{unit:'days',amount:365,dayMinutes:240}}],capMinutes:10000,carryover:{capMinutes:null,expiresOn:null}},{locationId:tx,reviewNote:'TX policy reviewed by employer',tiers:[{afterMonths:0,allowance:{unit:'weeks',amount:365/7}}],capMinutes:10000,carryover:{capMinutes:null,expiresOn:null}}]}
 // Use a whole annual allowance for a separately reconciled weekly conversion.
 variants.locations[1].tiers[0].allowance.amount=52
 const vp=await policy('Reviewed hourly and state variants',variants);await api('policy.approve',{version:vp.id})
 const hourly=await join('Mateo Brooks',{workEmail:'mateo@example.com',startDate:'2025-01-01',locationId:ca,payBasis:'hourly',payAmount:'25.00'})
 const va=await account(hourly,vp,'2025-01-01','0')
 const beforeTransfer=await api('mover.schedule',{period:hourly.period,effectiveFrom:'2025-01-03',locationId:tx,scheduleId:short,reason:'Reviewed transfer and shorter schedule'})
 await api('leave.accrue',{account:va,through:'2025-01-03'})
 let hourlyRecord=await record(hourly.person,va)
 assert.equal(hourlyRecord.balanceMinutes,240+Math.round(52*1680/365),'LEAVE-001 variant changes on transfer with dated schedule')
 assert.ok(JSON.stringify(hourlyRecord.calculations).includes(ca)&&JSON.stringify(hourlyRecord.calculations).includes(tx))
 assert.ok(JSON.stringify(hourlyRecord.calculations).includes(short))
 // A schedule correction preserves the posted explanation and requires a reasoned approved override.
 const preserved=JSON.stringify(hourlyRecord.calculations)
 await api('terms.cancel',{terms:beforeTransfer.terms,reason:'Schedule correction'})
 const proposed=await as(s.hr.cookie,'leave.adjust',{account:va,hours:'1',effectiveDate:'2025-01-03',note:'Correct reviewed schedule after posting'})
 assert.ok((await api('work')).items.some(w=>w.source===`leave-override:${proposed.id}`&&w.owner===(awaitOwnerId)), 'LEAVE-001 pending override has an accountable owner')
 assert.equal(proposed.status,'pending','LEAVE-001 HR cannot apply an unapproved override')
 assert.equal((await record(hourly.person,va)).balanceMinutes,hourlyRecord.balanceMinutes)
 await as(s.hr.cookie,'leave.override.decide',{override:proposed.id,decision:'approve'},403)
 await api('leave.override.decide',{override:proposed.id,decision:'approve'})
 assert.equal((await record(hourly.person,va)).balanceMinutes,hourlyRecord.balanceMinutes+60)
 assert.equal(JSON.stringify((await record(hourly.person,va)).calculations),preserved)
 await api('leave.override.decide',{override:proposed.id,decision:'approve'},409)
 // Carryover is consumed first, and a late reversal cannot resurrect expired minutes.
 const cp=await policy('Carryover consumption',{...rules,capMinutes:null,carryover:{capMinutes:600,expiresOn:'01-03'}});await api('policy.approve',{version:cp.id})
 const caa=await account(salaried,cp,'2024-12-29')
 await api('leave.accrue',{account:caa,through:'2025-01-01'})
 const used=await api('leave.request',{account:caa,startDate:'2025-01-02',endDate:'2025-01-02'})
 await as(s.hr.cookie,'leave.decide',{request:used.id,decision:'approve'})
 await api('leave.accrue',{account:caa,through:'2025-01-04'})
 assert.equal((await record(salaried.person,caa)).balanceMinutes,480,'LEAVE-001 used carryover is not expired again')
 await api('leave.cancel',{request:used.id,note:'Late cancellation after carryover expiry'})
 await api('leave.accrue',{account:caa,through:'2025-01-05'})
 assert.equal((await record(salaried.person,caa)).balanceMinutes,600,'LEAVE-001 late reversal settles expired carryover without resurrection')
 // Cadence, cap, unpaid rules and eligibility all use the same reviewed native policy path.
 const mp=await policy('Monthly sick days',{...rules,kind:'sick',tiers:[{afterMonths:0,allowance:{unit:'days',amount:365,dayMinutes:60}}],cadence:'monthly',capMinutes:100,carryover:{capMinutes:null,expiresOn:null}})
 await api('policy.approve',{version:mp.id});const ma=await account(hourly,mp,'2025-01-01','0')
 await api('leave.accrue',{account:ma,through:'2025-01-30'});assert.equal((await record(hourly.person,ma)).balanceMinutes,0)
 await api('leave.accrue',{account:ma,through:'2025-01-31'});assert.equal((await record(hourly.person,ma)).balanceMinutes,100,'LEAVE-001 month-end cadence caps credit')
 const unpaid=await policy('Unpaid',{...rules,kind:'unpaid',tiers:[{afterMonths:0,allowance:{unit:'hours',amount:0}}]});await api('policy.approve',{version:unpaid.id})
 const ua=await account(hourly,unpaid,'2025-01-01','0');await api('leave.accrue',{account:ua,through:'2025-01-02'});assert.equal((await record(hourly.person,ua)).balanceMinutes,0)
 const ineligible=await policy('Waiting period',{...rules,eligibility:{employmentTypes:['full_time'],waitingDays:30}});await api('policy.approve',{version:ineligible.id})
 await api('account.open',{period:hourly.period,policy:ineligible.policy,cutoverDate:'2025-01-02',openingHours:'0',note:'Waiting'},409)
 await policy('Invalid expiry',{...rules,carryover:{capMinutes:20,expiresOn:'02-30'}}).then(()=>assert.fail('LEAVE-001 invalid date accepted'),error=>assert.match(error.message,/400/))
 // Year-end cadence flushes earned partial service at an inclusive termination date.
 const annual=await policy('Annual earned policy',{...rules,tiers:[{afterMonths:0,allowance:{unit:'hours',amount:365}}],cadence:'annual',capMinutes:null,carryover:{capMinutes:null,expiresOn:null}});await api('policy.approve',{version:annual.id})
 const aa=await account(hourly,annual,'2025-01-01','0');await api('leave.accrue',{account:aa,through:'2025-01-30'});assert.equal((await record(hourly.person,aa)).balanceMinutes,0)
 await api('leaver.start',{period:hourly.period,endDate:'2025-01-31',reason:'End of assignment',template:templates.leaver})
 await api('leave.accrue',{account:aa,through:'2025-02-28'});assert.equal((await record(hourly.person,aa)).balanceMinutes,1800,'LEAVE-001 end date flushes 30 earned days and stops')
 await api('leaver.start',{period:salaried.period,endDate:'2025-01-05',reason:'End of period',template:templates.leaver})
 const rehired=await api('joiner.start',{person:salaried.person,template:templates.joiner,startDate:'2025-02-01',employmentType:'full_time',jobTitle:'Returning analyst',locationId:ca,scheduleId:schedule,payBasis:'salary',payAmount:'80000',payrollId:'REHIRE-PTO'})
 const rehireAccount=await account(rehired,p,'2025-02-01','0');await api('leave.accrue',{account:rehireAccount,through:'2025-02-02'})
 assert.equal((await record(rehired.person,rehireAccount)).balanceMinutes,60,'LEAVE-001 service tier restarts with the new employment period')
 assert.equal((await record(salaried.person,a)).balanceMinutes,480,'LEAVE-001 rehire does not reuse former account')
 // Real restart: the scheduler catches only completed employer-local days, once per cursor.
 const rp=await policy('Restart-safe daily',{...rules,tiers:[{afterMonths:0,allowance:{unit:'hours',amount:365}}],capMinutes:null,carryover:{capMinutes:null,expiresOn:null}});await api('policy.approve',{version:rp.id})
 const ra=await account(s.employee,rp,day(-3),'0')
 const tick=async date=>{const r=await h.raw(`/cdn-cgi/local/scheduled?time=${Date.parse(date+'T12:00:00Z')}&cron=${encodeURIComponent('*/15 * * * *')}&format=json`);assert.equal(r.status,200,await r.text())}
 await tick(today);const after=await record(s.employee.person,ra)
 assert.equal(after.balanceMinutes,120,'LEAVE-001 scheduler completes yesterday, not today')
 const {origin,vars}=h;await h.close();h=await harness({persistTo:directory,scheduled:true,port:Number(new URL(origin).port),bindings:vars})
 await tick(today);assert.deepEqual((await record(s.employee.person,ra)).ledger,after.ledger,'LEAVE-001 restart cannot duplicate accrual')
 // Protected case, supporting certification and intermittent entitlement custody.
 const protectedCase=await as(s.hr.cookie,'protected.open',{person:s.employee.person,title:'Reviewed family leave',startDate:day(-1),endDate:day(20),entitlementHours:'24',reviewNote:'Employer reviewed applicable policy; not a legal adjudication',certification:file('medical.txt','LEAVE-001-PRIVATE-CERTIFICATION')})
 await as(s.hr.cookie,'protected.absence',{case:protectedCase.id,startDate:today,endDate:today,hours:'4',note:'Intermittent absence'})
 const protectedRead=await as(s.hr.cookie,`protected-leave/${protectedCase.id}`)
 assert.equal(protectedRead.legalApproval,false,'LEAVE-001 employer review never claims legal approval')
 assert.equal((await as(s.employee.cookie,`protected-leave/${protectedCase.id}`)).remainingMinutes,1200,'LEAVE-001 subject reads own case')
 await as(s.payroll.cookie,`protected-leave/${protectedCase.id}`,undefined,404)
 assert.equal(protectedRead.remainingMinutes,1200,'LEAVE-001 intermittent absence reduces case entitlement')
 assert.equal(await (await h.raw(`/app/protected-leave/${protectedCase.id}?certificate=1`,{cookie:s.hr.cookie})).text(),'LEAVE-001-PRIVATE-CERTIFICATION')
 const manager=await as(s.managera.cookie,`protected-leave/${protectedCase.id}`)
 assert.deepEqual(manager,{id:protectedCase.id,person:s.employee.person,absences:[{startDate:today,endDate:today}]},'LEAVE-001 manager receives absence dates only')
 assert.equal((await h.raw(`/app/protected-leave/${protectedCase.id}?certificate=1`,{cookie:s.managera.cookie})).status,404)
 for(const path of [`people/${s.employee.person}`,`context/${s.employee.person}`,'people','reports'])assert.ok(!JSON.stringify(await as(s.managera.cookie,path)).includes('LEAVE-001-PRIVATE-CERTIFICATION'))
 await as(s.hr.cookie,'protected.absence',{case:protectedCase.id,startDate:today,endDate:today,hours:'25',note:'Too much'},409)
 const all=await as(s.hr.cookie,`protected-leave/${protectedCase.id}`);assert.equal(all.remainingMinutes,1200)
 assert.ok((await api('audit')).some(e=>e.action==='protected.read'&&e.actor===s.hr.member),'LEAVE-001 protected reads are audited')
 const csv=await h.raw('/app/exports/employees.csv?scope=team&fields=name',{cookie:s.managera.cookie});assert.equal(csv.status,200);assert.ok(!(await csv.text()).includes('LEAVE-001-PRIVATE-CERTIFICATION'))
 await api('member.permissions',{member:s.hr.member,permissions:['people.manage','people.private','documents.private']})
 await as(s.hr.cookie,`protected-leave/${protectedCase.id}`,undefined,404)
 assert.equal((await h.raw(`/app/protected-leave/${protectedCase.id}?certificate=1`,{cookie:s.hr.cookie})).status,404,'LEAVE-001 ordinary document rights cannot substitute for leave rights')
 await api('member.permissions',{member:s.hr.member,permissions:['people.manage','people.private','documents.private','leave.manage']})
 await browserEvidence(h,owner,s,protectedCase.id,ca,tx)
 console.log('LEAVE-001 public-door acceptance passed')
} finally {await h.close();await rm(directory,{recursive:true,force:true})}
