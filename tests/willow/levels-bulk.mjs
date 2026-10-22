// ROLE-002: reviewed filtered selection and dependency-aware exact restoration.
import assert from 'node:assert/strict'

export async function bulkLevelProof(h, owner, staff, join) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const preview=body=>api('level.preview',body)
 const apply=review=>api('level.apply',{review:review.id})
 const level=await apply(await preview({kind:'level',name:'Workforce reporting batch',permissions:['reports.read'],selfFields:{phone:'view'}}))
 const location='Batch reporting office'
 const locationId=(await api('location.create',{name:location,timezone:'UTC'})).id
 const department='Batch reporting team'
 const departmentId=(await api('department.create',{name:department})).id
 const members=[]
 for(const name of ['Avery Chen','Blair Singh','Cameron Park','Drew Okafor','Ellis Rivera','Frankie Cole','Gabriel Shah','Harper Lee','Indigo Young','Jordan Reed']) {
  const key=name.toLowerCase().replace(' ','-'), person=await join(key,{legalName:name,locationId,departmentId,jobTitle:'Batch analyst'})
  const member=await api('access.give',{person:person.person})
  members.push({id:member.id,name,person:person.person,cookie:await h.signIn(`${key}@example.com`,{requested:true})})
 }
 const ids=members.map(m=>m.id)
 // Direct permissions survive replacing assigned levels; an existing level is replaced.
 await api('member.permissions',{member:ids[0],permissions:['it.tasks']})
 const old=await apply(await preview({kind:'level',name:'Prior payroll view',permissions:['pay.read']}))
 await apply(await preview({kind:'assignment',member:ids[1],levels:[old.id]}))
 await apply(await preview({kind:'assignment',member:ids[2],levels:[old.id,level.id]}))
 const assigned=data=>Object.fromEntries(ids.map(id=>[id,data.assignments.filter(a=>a.member_id===id).map(a=>a.level_id).sort()]))
 const priorAssignments=assigned(await api('levels'))
 const selection={kind:'bulk-assignment',members:ids,levels:[level.id]}
 const filtered={kind:'bulk-assignment',selection:'filter',location,department,role:'Batch analyst',status:'active',q:'batch',levels:[level.id]}
 // Matching directory records with no active linked access are never selected.
 await join('batch-unlinked',{locationId,departmentId,jobTitle:'Batch analyst'})
 const ended=await join('batch-ended',{locationId,departmentId,jobTitle:'Batch analyst'})
 await api('access.give',{person:ended.person})
 await api('access.end',{person:ended.person})
 const before=await api('levels')
 await h.api('level.preview',staff.hr.cookie,selection,403)
 await api('level.preview',{...selection,members:[]},400)
 await api('level.preview',{...selection,members:[ids[0],'missing']},404)
 await api('level.preview',{...selection,members:[ids[0],(await api('me')).id]},409)
 await api('level.preview',{...selection,levels:['missing']},404)
 assert.deepEqual((await api('levels')).assignments,before.assignments,'Invalid selections change no member')
 await api('level.preview',{...filtered,location:'No such batch office'},400)
 await api('level.preview',{...filtered,members:ids},400)
 await api('level.preview',{...selection,location},400)
 const deduplicated=await preview({...selection,members:[...ids,ids[0]],levels:[level.id,level.id]})
 assert.equal(deduplicated.plan.members.length,ids.length,'Duplicate selections have one impact per person')
 const named=await preview({...filtered,name:'avery'})
 assert.deepEqual(named.plan.members,[ids[0]],'Name combines with the other directory filters')
 const review=await preview(filtered)
 assert.equal(review.plan.filter.location,location,'The review retains the named directory filter')
 assert.equal(review.plan.members.length,ids.length,'The named location resolves exactly ten eligible members')
 assert.deepEqual(review.impact.map(i=>i.member).sort(),[...ids].sort())
 assert.ok(review.impact.every(i=>i.after.includes('reports.read')&&i.afterSelf.phone==='view'))
 for(const impact of review.impact) {
  assert.deepEqual([...impact.beforeLevels].sort(),priorAssignments[impact.member])
  assert.deepEqual(impact.afterLevels,[level.id])
  if(impact.member!==ids[2]) assert.ok(impact.added.includes('reports.read'))
 }
 assert.deepEqual(review.impact.find(i=>i.member===ids[1]).removed,['pay.read'])
 for(const [index,member] of members.entries()) assert.equal((await h.api('me',member.cookie)).permissions.includes('reports.read'),index===2,'Preview changes no authority')
 const beforeSeq=(await api('audit'))[0].seq
 await apply(review)
 const events=(await api('audit')).filter(e=>e.seq>beforeSeq&&e.action==='level.bulk-assignment'&&e.subject===review.id)
 assert.equal(events.length,1,'One business audit event covers the whole selected batch')
 assert.deepEqual(JSON.parse(events[0].detail).impact.map(i=>i.member).sort(),[...ids].sort())
 for(const [index,member] of members.entries()) {
  const me=await h.api('me',member.cookie)
  assert.deepEqual(me.permissions.sort(),index===0?['it.tasks','reports.read']:['reports.read'])
  assert.equal(me.selfWriteModes.phone,'view','The same session uses its assigned field modes')
  const record=await h.api(`people/${staff.employee.person}`,member.cookie)
  assert.ok(!JSON.stringify(record).includes('PRIVATE-employee')&&!JSON.stringify(record).includes('8123456'),'Bulk assignment adds no private/pay rights')
 }
 await api('level.apply',{review:review.id},409)
 // Reads of private records and unrelated business work do not become dependencies.
 await api(`people/${members[0].person}`)
 await api('department.create',{name:'Unrelated work after filtered assignment'})
 const revert=await preview({kind:'revert',batch:review.id})
 for(const impact of revert.impact) {
  assert.deepEqual(impact.beforeLevels,[level.id])
  assert.deepEqual([...impact.afterLevels].sort(),priorAssignments[impact.member])
 }
 const revertSeq=(await api('audit'))[0].seq
 const revertRace=await Promise.all([1,2].map(()=>h.raw('/api/willow/level.apply',{cookie:owner,body:{review:revert.id}})))
 assert.deepEqual(revertRace.map(response=>response.status).sort(),[200,409],'Concurrent restoration consumes the review once')
 assert.deepEqual(assigned(await api('levels')),priorAssignments,'Revert restores each distinct prior assignment exactly')
 assert.deepEqual((await h.api('me',members[0].cookie)).permissions,['it.tasks'],'Revert retains direct grants')
 const revertedEvents=(await api('audit')).filter(e=>e.seq>revertSeq&&e.action==='level.revert'&&e.subject===review.id)
 assert.equal(revertedEvents.length,1,'Restoration has one business audit for the complete batch')
 await api('level.apply',{review:revert.id},409)
 await api('level.preview',{kind:'revert',batch:review.id},409)
 const stale=await preview(filtered)
 const late=await join('batch-late',{locationId,departmentId,jobTitle:'Batch analyst'})
 await api('access.give',{person:late.person})
 const frozen=await api(`level-reviews/${stale.id}`)
 assert.deepEqual([...frozen.plan.members].sort(),[...ids].sort(),'Later matching access never expands a reviewed selection')
 await api('level.apply',{review:stale.id},409)
 assert.deepEqual(assigned(await api('levels')),priorAssignments,'A stale filtered batch changes nobody')
 // The late matching record is deliberately outside the ten-person browser cohort.
 await api('access.end',{person:late.person})
 const competing=await Promise.all([preview({...selection,levels:[]}),preview({...selection,levels:[]})])
 const responses=await Promise.all(competing.map(r=>h.raw('/api/willow/level.apply',{cookie:owner,body:{review:r.id}})))
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409],'Competing reviewed batches commit once')
 for(const member of members) assert.ok(!(await h.api('me',member.cookie)).permissions.includes('reports.read'),'Removal applies to every member in the same sessions')
 // Ending one selected member after preview invalidates the entire batch.
 const ending=await preview(selection)
 await api('access.end',{person:members.at(-1).person})
 await api('level.apply',{review:ending.id},409)
 await api('level.preview',selection,409)
 assert.equal((await api('levels')).levels.find(l=>l.id===level.id).members.length,0)
 await api('access.give',{person:members.at(-1).person})
 members.at(-1).cookie=await h.signIn('jordan-reed@example.com')
 // A member's later business action is a dependency even without a person subject.
 const used=await preview({...selection,members:[ids[0]]})
 await apply(used)
 await h.api('self.request',members[0].cookie,{kind:'legalName',legalName:'Avery Chen Updated'})
 assert.equal((await api('level.preview',{kind:'revert',batch:used.id},409)).error,'batch_dependency')
 assert.ok((await h.api('me',members[0].cookie)).permissions.includes('reports.read'),'A refused revert leaves authority intact')
 // A later owner write referencing a selected person invalidates reviewed restoration.
 const referenced=await preview({...selection,members:[ids[3]]})
 await apply(referenced)
 const pendingRevert=await preview({kind:'revert',batch:referenced.id})
 const person=await api(`people/${members[3].person}`)
 await api('person.update',{person:members[3].person,revision:person.revision,legalName:person.legalName,workEmail:person.workEmail,employeeNumber:'BATCH-REFERENCE'})
 await api('level.apply',{review:pendingRevert.id},409)
 assert.equal((await api('level.preview',{kind:'revert',batch:referenced.id},409)).error,'batch_dependency')
 // Ended access and changed assignments cannot be overwritten by a revert.
 for(const change of ['assignment','ended']) {
  const batch=await preview({...selection,members:[ids[4]]})
  await apply(batch)
  if(change==='assignment') await apply(await preview({kind:'assignment',member:ids[4],levels:[]}))
  else await api('access.end',{person:members[4].person})
  assert.equal((await api('level.preview',{kind:'revert',batch:batch.id},409)).error,'batch_dependency')
  if(change==='ended') {
   await api('access.give',{person:members[4].person})
   members[4].cookie=await h.signIn('ellis-rivera@example.com')
  }
 }
 // Editing either the previous or newly assigned level blocks restoration.
 for(const changedLevel of [old.id,level.id]) {
  await apply(await preview({kind:'assignment',member:ids[1],levels:[old.id]}))
  const batch=await preview({...selection,members:[ids[1]]})
  await apply(batch)
  const current=(await api('levels')).levels.find(l=>l.id===changedLevel)
  await apply(await preview({kind:'level',level:changedLevel,name:current.name,permissions:current.permissions,selfFields:current.selfFields}))
  assert.equal((await api('level.preview',{kind:'revert',batch:batch.id},409)).error,'batch_dependency')
 }
 // Restore the varied baseline for both browser journeys through reviewed actions.
 for(const member of members) await apply(await preview({kind:'assignment',member:member.id,levels:priorAssignments[member.id]}))
 assert.deepEqual(assigned(await api('levels')),priorAssignments)
 console.log('ROLE-002: PASS — ten-member frozen directory selection, atomic audit/replay/race fences, exact restoration with direct grants, unrelated-write allowance and business/level dependencies')
 return {members,level:level.id,location,priorAssignments}
}

// ROLE-003's level-administration prerequisite, within the existing access journey.
export async function delegatedLevelProof(h,owner,s) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const hr=(path,body,status)=>h.api(path,s.hr.cookie,body,status)
 const apply=async(plan,who=api)=>who('level.apply',{review:(await who('level.preview',plan)).id})
 const assignments=async member=>(await api('levels')).assignments.filter(a=>a.member_id===member).map(a=>a.level_id)
 const originalHR=await assignments(s.hr.member), originalManager=await assignments(s.managera.member), originalTarget=await assignments(s.managerb.member)
 const delegation=await apply({kind:'level',name:'Explicit access administration',permissions:['access.admin']})
 const privatePay=await apply({kind:'level',name:'Delegate current pay ceiling',permissions:['pay.read']})
 const enable=async()=>apply({kind:'assignment',member:s.hr.member,levels:[...originalHR,delegation.id]})
 await enable()
 assert.ok((await hr('levels')).levels.some(l=>l.id===delegation.id),'Only explicit delegation opens native level administration')
 assert.equal((await h.raw('/app/access',{cookie:s.hr.cookie})).status,200)
 await hr('level.preview',{kind:'assignment',member:s.hr.member,levels:[]},403)
 await hr('level.preview',{kind:'assignment',member:(await api('me')).id,levels:[]},409)
 await hr('level.preview',{kind:'level',level:delegation.id,name:'Escalate own administration',permissions:[]},403)
 await hr('level.preview',{kind:'level',name:'Cannot re-delegate',permissions:['access.admin']},403)
 await hr('level.preview',{kind:'level',name:'Cannot grant EEO',permissions:['eeo.individual']},403)
 await hr('level.preview',{kind:'level',name:'Cannot grant absent pay',permissions:['pay.read']},403)
 await hr('level.preview',{kind:'level',name:'Cannot widen own name mode',permissions:[],selfFields:{legalName:'edit'}},403)
 await hr('level.preview',{kind:'level',name:'Cannot grant absent subject follow',permissions:[],followOwnChanges:true},403)
 const a=await api('location.create',{name:'Delegation pay group A',timezone:'UTC'}),b=await api('location.create',{name:'Delegation pay group B',timezone:'UTC'})
 const scopeA={kind:'group',dimensions:{location:[a.id]}}
 const scopedPay=await apply({kind:'level',name:'Delegate scoped pay ceiling',permissions:['pay.read'],scope:scopeA})
 await apply({kind:'assignment',member:s.hr.member,levels:[...originalHR,delegation.id,scopedPay.id]})
 const bounded=await hr('level.preview',{kind:'level',name:'Delegated pay in covered group',permissions:['pay.read'],scope:scopeA})
 assert.equal(bounded.needsApproval,true)
 await api('level.apply',{review:bounded.id})
 for(const scope of [{kind:'everyone'},{kind:'group',dimensions:{location:[b.id]}},{kind:'group',dimensions:{location:[a.id,b.id]}}]) await hr('level.preview',{kind:'level',name:'Cannot widen a scoped pay source',permissions:['pay.read'],scope},403)
 await enable()
 const privateCategory=await api('category.create',{name:'Delegation document boundary',subjectReads:false,managerReads:false})
 const priorBundle=(await api('levels')).levels.find(l=>l.id===originalHR[0])
 const noDocuments=await apply({kind:'level',name:'Access delegate without document reads',permissions:priorBundle.permissions.filter(p=>p!=='documents.private')})
 await apply({kind:'assignment',member:s.hr.member,levels:[noDocuments.id,delegation.id]})
 for(const mode of ['view','approval','edit']) await hr('level.preview',{kind:'level',name:'Cannot grant unreadable document category',permissions:[],documentCategories:{self:{},others:{[privateCategory.id]:mode}}},403)
 await enable()
 const custom=await apply({kind:'level',name:'HR created contact view',permissions:['people.private']},hr)
 const batch=await hr('level.preview',{kind:'bulk-assignment',members:[s.managerb.member,s.employee.member],levels:[custom.id]})
 assert.equal(batch.needsApproval,false)
 assert.equal(batch.impact.length,2)
 await hr('level.apply',{review:batch.id})
 assert.ok((await h.api(`people/${s.employee.person}`,s.managerb.cookie)).private)
 await hr('level.apply',{review:batch.id},409)
 // Business and security-denial events stale a preview; no reused preview can regain authority.
 const stale=await hr('level.preview',{kind:'assignment',member:s.managerb.member,levels:[]})
 await hr('level.preview',{kind:'assignment',member:s.hr.member,levels:[]},403)
 await hr('level.apply',{review:stale.id},409)
 const newReview=await hr('level.preview',{kind:'assignment',member:s.managerb.member,levels:[]})
 await hr('level.apply',{review:newReview.id})
 assert.equal((await h.api(`people/${s.employee.person}`,s.managerb.cookie)).private,undefined)
 // The owner grants the delegate a pay ceiling; granting any pay/payroll authority still needs another administrator.
 await apply({kind:'assignment',member:s.hr.member,levels:[...originalHR,delegation.id,privatePay.id]})
 const payReview=await hr('level.preview',{kind:'level',name:'Pay level requested by HR',permissions:['pay.read']})
 assert.equal(payReview.needsApproval,true)
 await hr('level.apply',{review:payReview.id},403)
 // A refusal is audited and invalidates the previous snapshot, so approval uses a fresh review.
 const payFresh=await hr('level.preview',{kind:'level',name:'Pay level requested by HR',permissions:['pay.read']})
 const pay=await api('level.apply',{review:payFresh.id})
 const alone=await hr('level.preview',{kind:'assignment',member:s.managerb.member,levels:[pay.id]})
 assert.equal(alone.needsApproval,true)
 await hr('level.apply',{review:alone.id},403)
 // A second independent administrator can publish the exact review; they too need every right it carries.
 const hrBundle=(await api('levels')).levels.find(l=>l.name==='Fixture hr access').id
 await apply({kind:'assignment',member:s.managera.member,levels:[hrBundle,delegation.id,privatePay.id]})
 s.managera.cookie=await h.signIn('managera@example.com')
 const second=(path,body,status)=>h.api(path,s.managera.cookie,body,status)
 const approved=await hr('level.preview',{kind:'assignment',member:s.managerb.member,levels:[pay.id]})
 assert.ok((await second('levels')).approvals.some(r=>r.id===approved.id))
 assert.equal((await second(`level-reviews/${approved.id}`)).actor,s.hr.member)
 await second('level.apply',{review:approved.id})
 assert.ok((await h.api('me',s.managerb.cookie)).permissions.includes('pay.read'))
 assert.ok((await api('audit')).some(e=>e.action==='level.assignment'&&e.actor===s.managera.member&&JSON.parse(e.detail).requestedBy===s.hr.member))
 // Current creator rights are rechecked even when the owner is the second administrator.
 const pending=await hr('level.preview',{kind:'assignment',member:s.managerb.member,levels:[pay.id]})
 await apply({kind:'assignment',member:s.hr.member,levels:originalHR})
 await hr('level.preview',{kind:'level',name:'Revoked delegate',permissions:[]},403)
 await api('level.apply',{review:pending.id},409)
 assert.ok((await api('audit')).some(e=>e.action==='level.denied'&&e.actor===s.hr.member&&JSON.parse(e.detail).code==='delegation_ceiling'))
 // Restore the shared fixture through ordinary owner reviews, preserving Base's admin-transition sign-in fence.
 await apply({kind:'assignment',member:s.managerb.member,levels:originalTarget})
 await apply({kind:'assignment',member:s.employee.member,levels:[]})
 await apply({kind:'assignment',member:s.managera.member,levels:originalManager})
 s.managera.cookie=await h.signIn('managera@example.com')
 assert.equal((await h.raw('/app/access',{cookie:s.hr.cookie})).status,200,'HR keeps the existing member/visibility page, without named-level controls')
 await hr('levels',undefined,403)
 console.log('ROLE-003 delegated levels: PASS — explicit HR grant, exact ceilings, no self/owner/EEO/re-delegation escalation, audited refusals, reviewed bulk assignment, independent pay approval and current-rights revocation')
 return {delegation:delegation.id,pay:pay.id,payCeiling:privatePay.id,originalHR,originalManager,originalTarget,hrBundle}
}
