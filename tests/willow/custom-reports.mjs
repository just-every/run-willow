// REPORT-001: report builder, historical drilldown, recipient rechecks and protected EEO aggregates.
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as pathJoin } from 'node:path'
import { harness } from './harness.mjs'
import { fixture,today,day } from './regression-fixture.mjs'
import { readZip } from './export-reader.mjs'
import { browserEvidence } from './custom-reports-browser.mjs'
const directory=await mkdtemp(pathJoin(tmpdir(),'willow-report-')),messages=[]
let mail='accepted'
const provider=async request=>{
 if(new URL(request.url).hostname==='api.sendgrid.com'){
  const m=await request.json();if(m.subject==='Willow: scheduled report ready') { messages.push(m); if(mail==='uncertain')throw new Error('Network outcome unknown');if(mail==='refused')return new Response('Refused',{status:400}) }
  return new Response(null,{status:202})
 }
 throw new Error('Unexpected network edge')
}
let h=await harness({persistTo:directory,scheduled:true,provider})
try{
 await h.raw('/auth/bootstrap',{body:{token:h.vars.SETUP_TOKEN,displayName:'Olive Owner'}})
 const owner=await h.signIn(h.vars.OWNER_EMAIL)
 await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
 const {api,staff:s,join,account,templates}=await fixture(h,owner),person=s.employee.person
 s.invited.cookie=await h.signIn('invited@example.com',{requested:true})
 await api('employer.configure',{name:'Harbour Logistics',timezone:'UTC',country:'US',currency:'USD'})
 const as=(cookie,path,body,status=200)=>h.api(path,cookie,body,status),hrGrants=['people.manage','people.private','documents.private','leave.manage','reports.read','pay.read','eeo.read']
 await api('member.permissions',{member:s.hr.member,permissions:hrGrants})
 const hr=s.hr.cookie
 const names={managera:'Maya Chen',managerb:'Leo Ortiz',employee:'Elena Patel',payroll:'Noah Brooks',hr:'Harper Jones',ended:'Avery Singh',invited:'Sofia Martinez'}
 for(const [key,staff] of Object.entries(s)){const record=await api(`people/${staff.person}`);await api('person.update',{person:staff.person,revision:record.revision,legalName:names[key],preferredName:'',workEmail:record.workEmail,employeeNumber:''})}
 const definitions=[{key:'team_code',classification:'general',label:'Team code',type:'text',required:false,effectiveFrom:day(-90),employeeRead:true,managerRead:true,validation:{maxLength:60}},
 {key:'restricted_note',classification:'hr',label:'HR review',type:'text',required:false,effectiveFrom:day(-90),validation:{maxLength:60}}]
 for(const d of definitions)await as(hr,'customField.define',{definition:{employeeRead:false,managerRead:false,retired:false,...d}})
 await as(hr,'customField.write',{person,effectiveFrom:day(-60),values:{team_code:'NORTH-OPS',restricted_note:'REPORT-PRIVATE-REVIEW'}})
 let p=await api(`people/${person}`)
 await api('person.update',{person,revision:p.revision,private:true,phone:'REPORT-PRIVATE-PHONE'})
 await api('mover.schedule',{period:s.employee.period,effectiveFrom:day(-10),jobTitle:'Historical analyst',payBasis:'salary',payAmount:'91234.57',reason:'Dated report'})
 await api('mover.schedule',{period:s.employee.period,effectiveFrom:day(10),jobTitle:'Future lead',reason:'Scheduled promotion'})
 await api('mover.schedule',{period:s.invited.period,effectiveFrom:day(-5),payBasis:'unknown',reason:'Unrecorded compensation'})
 await api('mover.schedule',{period:s.managerb.period,effectiveFrom:day(-5),payBasis:'hourly',payAmount:'25.03',reason:'Hourly report calculation'})
 await account(s.managerb.period)
 await api('leaver.start',{period:s.ended.period,endDate:day(-3),reason:'Departure',template:templates.leaver})
 const pending=await as(s.employee.cookie,'self.request',{kind:'legalName',legalName:'Elena report pending'})
 const columns=['name','jobTitle','fte','tenureDays','leaveHours','leaveLiability','payAmount','phone','custom.team_code','custom.restricted_note','openExceptions','overdueWork']
 const definition={name:'Monthly workforce and exceptions',columns,asOf:today,from:day(-30),to:today,status:'active'}
 await as(s.employee.cookie,'report.save',{definition},403)
 await as(hr,'report.save',{definition:{...definition,columns:['eeo.sex']}},400)
 await as(hr,'report.save',{definition:{...definition,asOf:'2026-02-30'}},400)
 const report=await as(hr,'report.save',{definition}),detail=()=>as(hr,`custom-reports/${report.id}`)
 const initial=await detail(),row=initial.result.rows.find(r=>r.personId===person)
 assert.equal(row.cells.jobTitle,'Historical analyst','REPORT-001 chosen-date title ignores future terms')
 assert.equal(row.cells['custom.team_code'],'NORTH-OPS');assert.equal(row.cells['custom.restricted_note'],'REPORT-PRIVATE-REVIEW')
 assert.equal(row.cells.phone,'REPORT-PRIVATE-PHONE');assert.equal(row.cells.openExceptions,'1')
 assert.equal(initial.result.totals.headcount,initial.result.rows.reduce((n,r)=>n+r.measures.headcount,0))
 assert.equal(initial.result.totals.fte,Math.round(initial.result.rows.reduce((n,r)=>n+(r.measures.fte??0),0)*1000)/1000)
 assert.ok(initial.result.totals.unknownLiability>0,'REPORT-001 unknown compensation is counted without a liability value')
 assert.equal(initial.result.rows.find(r=>r.personId===s.managerb.person).measures.liabilityCents,200*2503,'REPORT-001 hourly liability uses actual accrued hours')
 assert.equal(initial.result.totals.turnover.leavers,initial.result.totals.turnover.sources.length)
 assert.equal(initial.result.totals.turnover.denominator,initial.result.totals.turnover.denominatorSources.reduce((n,s)=>n+s.people.length,0)/2)
 assert.equal(initial.result.totals.openExceptions,initial.result.rows.reduce((n,r)=>n+r.measures.openExceptions,0))
 const source=await as(hr,`people/${person}?asOf=${today}`),balance=source.leave.accounts.reduce((n,a)=>n+a.balanceMinutes,0),term=source.employment.flatMap(p=>p.terms).find(t=>t.inForce)
 assert.equal(row.cells.leaveHours,(balance/60).toFixed(2))
 assert.equal(row.measures.liabilityCents,Math.floor(balance*term.pay.amountCents/(term.schedule.weeklyMinutes*52)+0.5),'REPORT-001 salary liability follows named rounding and annual-hours formula')
 assert.equal(initial.result.totals.liability.find(l=>l.currency==='AUD').cents,initial.result.rows.filter(r=>r.measures.currency==='AUD').reduce((n,r)=>n+r.measures.liabilityCents,0))
 assert.equal(row.source,`/app/people/${person}?asOf=${today}`)
 assert.ok(initial.result.notes.includes('Unknown')||initial.result.notes.includes('unknown'))
 // A past-date saved report joins the same dated source records, including typed values and leave ledger.
 const past=await as(hr,'report.save',{definition:{...definition,name:'Past date',asOf:day(-15),to:day(-15)}})
 const pastResult=(await as(hr,`custom-reports/${past.id}`)).result,pastRow=pastResult.rows.find(r=>r.personId===person)
 assert.equal(pastRow.cells.jobTitle,'Present role');assert.equal(pastRow.cells.openExceptions,'0')
 assert.equal(pastRow.cells['custom.team_code'],'NORTH-OPS')
 assert.equal((await h.raw(pastRow.source,{cookie:hr})).status,200,'REPORT-001 past drilldown is a public source page')
 const pastSource=await as(hr,`people/${person}?asOf=${day(-15)}`)
 assert.equal(pastRow.cells.leaveHours,(pastSource.leave.accounts.reduce((n,a)=>n+a.balanceMinutes,0)/60).toFixed(2))
 // Schedule a frozen definition; rights revoked before dispatch govern pages, both files and the safe link.
 await api('member.permissions',{member:s.payroll.member,permissions:['pay.read','people.private','reports.read']})
 await as(hr,'report.schedule',{report:report.id,version:report.versionId,firstDate:today,cadenceDays:1,recipients:[s.payroll.member,s.managera.member],enabled:true})
 assert.ok((await as(s.payroll.cookie,`custom-reports/${report.id}`)).result.rows.some(r=>r.cells.phone==='REPORT-PRIVATE-PHONE'))
 await api('member.permissions',{member:s.payroll.member,permissions:['reports.read']})
 const revoked=(await as(s.payroll.cookie,`custom-reports/${report.id}`)).result
 const revokedPage=await h.raw(`/app/reports/custom/${report.id}`,{cookie:s.payroll.cookie});assert.equal(revokedPage.status,200);const revokedHtml=await revokedPage.text();for(const secret of ['REPORT-PRIVATE-PHONE','REPORT-PRIVATE-REVIEW','91234.57'])assert.ok(!revokedHtml.includes(secret),'REPORT-001 page withholds revoked field');assert.ok(revokedHtml.includes('Withheld'))
 assert.ok(revoked.rows.find(r=>r.personId===person).withheld.includes('phone'))
 for(const format of ['csv','xlsx']){
  const response=await h.raw(`/app/reports/custom/${report.id}.${format}`,{cookie:s.payroll.cookie});assert.equal(response.status,200)
  const bytes=Buffer.from(await response.arrayBuffer()),text=format==='csv'?bytes.toString():[...readZip(bytes).values()].map(b=>b.toString()).join('')
  for(const secret of ['REPORT-PRIVATE-PHONE','REPORT-PRIVATE-REVIEW','91234.57'])assert.ok(!text.includes(secret),`REPORT-001 ${format} withholds revoked field`)
  assert.ok(text.includes('Withheld'))
 }
 const manager=(await as(s.managera.cookie,`custom-reports/${report.id}`)).result
 assert.deepEqual(manager.rows.map(r=>r.personId),[person],'REPORT-001 sharing never expands manager row scope')
 assert.ok(!JSON.stringify(manager).includes('REPORT-PRIVATE'))
 await api('connections.notices',{enabled:true})
 const tick=async date=>{const r=await h.raw(`/cdn-cgi/local/scheduled?time=${Date.parse(date+'T09:00:00Z')}&cron=${encodeURIComponent('*/15 * * * *')}&format=json`);assert.equal(r.status,200,await r.text())}
 await tick(today);assert.equal(messages.length,2)
 for(const message of messages)for(const text of message.content.map(c=>c.value))for(const secret of ['REPORT-PRIVATE','91234.57','NORTH-OPS','Monthly workforce'])assert.ok(!text.includes(secret),'REPORT-001 delivery is fixed text and authenticated link only')
 const {origin,vars}=h;await h.close();h=await harness({persistTo:directory,scheduled:true,provider,port:Number(new URL(origin).port),bindings:vars})
 await tick(today);assert.equal(messages.length,2,'REPORT-001 restart cannot repeat claimed occurrence')
 await api('member.permissions',{member:s.payroll.member,permissions:[]})
 await tick(day(1));assert.equal(messages.length,3,'REPORT-001 recipient with no current reporting rights receives no dispatch')
 let status=(await detail()).schedule
 assert.ok(status.deliveries.some(d=>d.recipient===s.payroll.member&&d.status==='refused'))
 mail='uncertain';await tick(day(2));const uncertainCount=messages.length;await tick(day(2));assert.equal(messages.length,uncertainCount)
 assert.ok((await detail()).schedule.deliveries.some(d=>d.status==='uncertain'),'REPORT-001 uncertain sends remain visible without retries')
 mail='accepted'
 const changed=await as(hr,'report.save',{report:report.id,definition:{...definition,name:'Revised workforce report'}})
 await tick(day(3));assert.equal(messages.length,uncertainCount,'REPORT-001 new definition requires schedule review')
 await as(hr,'report.schedule',{report:report.id,version:report.versionId,firstDate:today,cadenceDays:1,recipients:[s.managera.member],enabled:true},409)
 await as(hr,'report.schedule',{report:report.id,version:changed.versionId,firstDate:today,cadenceDays:1,recipients:[s.managera.member],enabled:true})
 // EEO: no rank inference, voluntary immutable self-ID and aggregate-only complementary suppression.
 await as(s.managera.cookie,'eeo/report',undefined,403)
 await as(s.employee.cookie,'eeo.self.write',{person:s.hr.person,raceEthnicity:'asian'},400)
 await as(s.employee.cookie,'eeo.self.write',{raceEthnicity:'invalid'},400)
 const empty=await as(hr,'eeo/report');assert.equal(empty.total,6);assert.equal(empty.suppressed,false)
 await as(s.employee.cookie,'eeo.self.write',{raceEthnicity:'asian',sex:'female'})
 const protectedReport=await as(hr,'eeo/report')
 assert.equal(protectedReport.total,null);assert.ok(protectedReport.raceEthnicity.every(c=>c.count===null&&c.suppressed));assert.ok(protectedReport.sex.every(c=>c.count===null&&c.suppressed))
 assert.ok(!JSON.stringify(protectedReport).includes(person),'REPORT-001 EEO report never carries individual IDs')
 await as(hr,'eeo/report?asOf='+today+'&department=Operations',undefined,400)
 await as(hr,'eeo/self?person='+person,undefined,400)
 await as(s.employee.cookie,'eeo.self.write',{raceEthnicity:'declined',sex:''})
 assert.equal((await as(s.employee.cookie,'eeo/self')).history.length,2)
 for(const key of Object.keys(s)){
  const cookie=s[key].cookie??await h.signIn(key+'@example.com')
  await as(cookie,'eeo.self.write',{raceEthnicity:'white',sex:'female'})
 }
 const shown=await as(hr,'eeo/report');assert.equal(shown.total,6);assert.equal(shown.raceEthnicity.find(c=>c.category==='white').count,6)
 for(const path of [`people/${person}`,`context/${person}`,`preview?member=${s.employee.member}&person=${person}`,`custom-reports/${report.id}`])assert.ok(!JSON.stringify(await api(path)).includes('raceEthnicity'),'REPORT-001 ordinary public doors exclude individual self-ID')
 const employeeBundle=Buffer.from(await(await h.raw(`/app/exports/employees.zip?scope=organization&fields=name&history=employment,leave,tables`,{cookie:owner})).arrayBuffer())
 assert.ok(![...readZip(employeeBundle).values()].map(b=>b.toString()).join('').includes('raceEthnicity'),'REPORT-001 employee exports exclude self-ID')
 await browserEvidence(h,owner,s,report.id)
 await api('member.permissions',{member:s.hr.member,permissions:['people.manage','reports.read']})
 await as(hr,'eeo/report',undefined,403)
 assert.ok((await api('audit')).some(e=>e.action==='eeo.report.read'))
 // A selected definition authorizes only its existing scheduled link, never another report or private bytes.
 const selectedReview=await api('level.preview',{kind:'level',name:'synthetic-willow-9601 report recipient',permissions:[],reports:[report.id]})
 const selected=await api('level.apply',{review:selectedReview.id})
 await api('level.apply',{review:(await api('level.preview',{kind:'assignment',member:s.invited.member,levels:[selected.id]})).id})
 await as(hr,'report.schedule',{report:report.id,version:changed.versionId,firstDate:day(4),cadenceDays:1,recipients:[s.invited.member],enabled:true})
 const selectedCount=messages.length
 await tick(day(4));assert.equal(messages.length,selectedCount+1,'A current selected-report recipient receives its reviewed link')
 for(const content of messages.at(-1).content) assert.ok(!content.value.includes('REPORT-PRIVATE')&&!content.value.includes('91234.57'),'A selected report still sends only the fixed authenticated link')
 await api('level.apply',{review:(await api('level.preview',{kind:'level',level:selected.id,name:'synthetic-willow-9601 report recipient',permissions:[],reports:[]})).id})
 await tick(day(5));assert.equal(messages.length,selectedCount+1,'Revoking the selected report prevents the next scheduled dispatch')
 assert.ok((await detail()).schedule.deliveries.some(d=>d.recipient===s.invited.member&&d.status==='refused'))
 console.log('REPORT-001 custom workforce reports, scheduled links, dated drilldown and protected diversity: PASS')
}finally{await h.close();await rm(directory,{recursive:true,force:true})}
