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
 console.log('ROLE-002: PASS — ten-member frozen directory selection, atomic audit/replay/race fences, exact restoration with direct grants, unrelated-write allowance and business/level dependencies; group scopes remain partial')
 return {members,level:level.id,location,priorAssignments}
}
