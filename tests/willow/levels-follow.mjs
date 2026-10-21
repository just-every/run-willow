// ROLE-001 additive subject-follow and FLOW-004 existing full-read precedence.
import assert from 'node:assert/strict'
import { file } from './harness.mjs'
import { day } from './regression-fixture.mjs'
import { followBrowserProof } from './levels-follow-browser.mjs'
export async function followProof(h,owner,f,request) {
 const s=f.staff,api=f.api,employee=(p,b,status)=>h.api(p,s.employee.cookie,b,status)
 const full=await h.api(`change-requests/${request}`,s.managera.cookie)
 const hash=full.attachments[0].sha256
 const apply=async plan=>api('level.apply',{review:(await api('level.preview',plan)).id})
 assert.ok((await api('levels')).levels.every(l=>!l.followOwnChanges),'Migration enables no status read')
 await h.api('level.preview',s.hr.cookie,{kind:'level',name:'Escalate status',permissions:[],followOwnChanges:true},403)
 const level=await apply({kind:'level',name:'Follow own requests',permissions:[],followOwnChanges:true})
 const preview=await api('level.preview',{kind:'assignment',member:s.employee.member,levels:[level.id]})
 assert.equal(preview.impact[0].member,s.employee.member)
 assert.equal(preview.impact[0].beforeFollow,false);assert.equal(preview.impact[0].afterFollow,true)
 await employee(`change-requests/${request}`,undefined,404)
 await api('level.apply',{review:preview.id})
 assert.ok((await (await h.raw('/app',{cookie:s.employee.cookie})).text()).includes('href="/app/changes"'),'Follow right makes the status list reachable from Home')
 const view=await employee(`change-requests/${request}`)
 assert.deepEqual(Object.keys(view).sort(),['statusOnly','id','type','status','effectiveFrom','submittedAt','updatedAt','progress','changes'].sort(),'Only the approved status projection is returned')
 assert.equal(view.id,request);assert.equal(view.status,'pending');assert.equal(view.type,'compensation')
 assert.equal(view.effectiveFrom,full.effectiveFrom);assert.ok(view.submittedAt>0 && view.updatedAt>=view.submittedAt)
 assert.deepEqual(view.progress,{step:1,total:3,waitingOn:'Manager’s manager'})
 assert.deepEqual(view.changes,[{field:'Job title',to:'Senior specialist'},{field:'Pay',from:'Withheld',to:'Withheld'}])
 assert.deepEqual((await employee('change-requests')).requests.find(r=>r.id===request),view,'List uses exactly the same projection')
 assert.ok(!(await employee('work')).items.some(i=>i.path===`/app/changes/${request}`),'Following grants no work item')
 for(const decision of ['approve','return','decline']) await employee('change.decide',{request,state:full.state,decision,comment:'Cannot comment on own terms'},403)
 await employee('change.edit',{request,state:full.state,effectiveFrom:full.effectiveFrom,reason:'Cannot edit',jobTitle:'Wrong'},403)
 for(const path of [`/app/changes/${request}?attachment=${hash}`,`/api/willow/change-requests/${request}/attachments/${hash}`]) assert.equal((await h.raw(path,{cookie:s.employee.cookie})).status,404)
 for(const path of ['/app/changes',`/app/changes/${request}`]) {
  const page=await (await h.raw(path,{cookie:s.employee.cookie})).text()
  for(const secret of ['Promotion to senior specialist','PROMOTION-CASE','case.txt',hash,'Strong year','managerb','10%','81,234','89,358']) assert.ok(!page.includes(secret),`${path} excludes ${secret}`)
  if(path.endsWith(request)) for(const action of ['change.decide','change.edit']) assert.ok(!page.includes(`/app/do/${action}`))
 }
 const beforeAudit=(await api('audit')).length
 await employee(`change-requests/${request}`)
 assert.equal((await api('audit')).length,beforeAudit,'Status reads add no audit event')
 const audit=await api('audit'),ownerId=(await api('me')).id
 assert.ok(audit.some(e=>e.actor===ownerId&&e.action==='level.assignment'&&e.subject===s.employee.member&&JSON.stringify(e.detail).includes('afterFollow')))
 // No new request content reaches existing unrelated context/export/preview doors.
 for(const path of [`context/${s.employee.person}`,`people/${s.employee.person}`,`preview?member=${s.employee.member}&person=${s.employee.person}`]) {
  const text=JSON.stringify(await api(path))
  for(const secret of ['Promotion to senior specialist','PROMOTION-CASE','Strong year']) assert.ok(!text.includes(secret))
 }
 await apply({kind:'level',level:level.id,name:'Follow own requests',permissions:['pay.read'],followOwnChanges:true})
 const pay=await employee(`change-requests/${request}`)
 assert.equal(pay.changes.find(c=>c.field==='Pay').to.replace(/[^\d.]/g,''),'89358.02')
 assert.ok(!JSON.stringify(pay).includes('percent'),'No requester-entered percentage is exposed')
 // Existing full HR/owner reads remain full even when they are the subject.
 const ownerPerson=await f.join('owner-person',{workEmail:h.vars.OWNER_EMAIL})
 await api('access.give',{person:ownerPerson.person})
 for(const [who,person,cookie] of [['hr',s.hr.person,s.hr.cookie],['owner',ownerPerson.person,owner]]) {
  const requester=who==='owner'?s.hr.cookie:owner
  const proposed=await h.api('change.request',requester,{person,effectiveFrom:day(45),jobTitle:'Updated role',reason:`FULL-${who}-REASON`,comment:`FULL-${who}-COMMENT`,attachment:file(`${who}.txt`,`FULL-${who}-FILE`)})
  const detail=await h.api(`change-requests/${proposed.id}`,cookie)
  assert.equal(detail.statusOnly,false);assert.equal(detail.reason,`FULL-${who}-REASON`)
  assert.ok(detail.history.some(e=>e.comment===`FULL-${who}-COMMENT`));assert.equal(detail.attachments[0].filename,`${who}.txt`)
  assert.ok(!detail.mayDecide&&!detail.mayEdit)
  const page=await (await h.raw(`/app/changes/${proposed.id}`,{cookie})).text()
  assert.ok(page.includes(`FULL-${who}-REASON`)&&page.includes(`FULL-${who}-COMMENT`))
  for(const action of ['change.decide','change.edit']) assert.ok(!page.includes(`/app/do/${action}`))
  assert.equal(await (await h.raw(`/app/changes/${proposed.id}?attachment=${detail.attachments[0].sha256}`,{cookie})).text(),`FULL-${who}-FILE`)
  for(const decision of ['approve','decline','return']) await h.api('change.decide',cookie,{request:proposed.id,state:detail.state,decision,comment:'Not my decision'},403)
  await h.api('change.edit',cookie,{request:proposed.id,state:detail.state,effectiveFrom:day(45),jobTitle:'No'},403)
 }
 const payrollRequest=await api('change.request',{person:s.payroll.person,effectiveFrom:day(45),payIncreasePercent:'10',reason:'Payroll subject'})
 await h.api(`change-requests/${payrollRequest.id}`,s.payroll.cookie,undefined,404)
 // Full-reader precedence also holds with a follow setting assigned to HR.
 const hrLevel=(await api('levels')).levels.find(l=>l.name==='Fixture hr access')
 await apply({kind:'level',level:hrLevel.id,name:hrLevel.name,permissions:hrLevel.permissions,followOwnChanges:true})
 assert.equal((await h.api(`change-requests/${request}`,s.hr.cookie)).statusOnly,false)
 await followBrowserProof(h,owner,s,level.id,request)
 const revoke=await api('level.preview',{kind:'level',level:level.id,name:'Follow own requests',permissions:['pay.read'],followOwnChanges:false})
 assert.deepEqual([revoke.impact[0].beforeFollow,revoke.impact[0].afterFollow],[true,false])
 await api('level.apply',{review:revoke.id})
 await employee(`change-requests/${request}`,undefined,404)
 assert.ok(!(await employee('change-requests')).requests.some(r=>r.id===request))
 assert.ok(!(await (await h.raw('/app',{cookie:s.employee.cookie})).text()).includes('href="/app/changes"'),'Revocation removes the navigation entry in the same session')
 assert.equal((await h.raw(`/app/changes/${request}`,{cookie:s.employee.cookie})).status,404)
 await apply({kind:'level',level:level.id,name:'Follow own requests',permissions:[],followOwnChanges:true})
 await employee(`change-requests/${request}`)
 await apply({kind:'assignment',member:s.employee.member,levels:[]})
 await employee(`change-requests/${request}`,undefined,404)
 // Access termination clears the setting; reopening access restores none of it.
 const endedRequest=await api('change.request',{person:s.ended.person,effectiveFrom:day(45),jobTitle:'Renewed role',reason:'Ended-access fence'})
 await apply({kind:'assignment',member:s.ended.member,levels:[level.id]})
 await h.api(`change-requests/${endedRequest.id}`,s.ended.cookie)
 await api('access.end',{person:s.ended.person})
 await h.api(`change-requests/${endedRequest.id}`,s.ended.cookie,undefined,401)
 await api('access.give',{person:s.ended.person})
 s.ended.cookie=await h.signIn('ended@example.com')
 await h.api(`change-requests/${endedRequest.id}`,s.ended.cookie,undefined,404)
 console.log('ROLE-001 subject-follow and FLOW-004 HR/owner subject precedence: PASS')
}
