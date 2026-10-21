// ROLE-002 partial: reviewed selection of ten members, one atomic assignment.
// Group-scoped reads, filter selection and dependency-aware revert remain gaps.
import assert from 'node:assert/strict'

export async function bulkLevelProof(h, owner, staff, join) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const preview=body=>api('level.preview',body)
 const apply=review=>api('level.apply',{review:review.id})
 const level=await apply(await preview({kind:'level',name:'Workforce reporting batch',permissions:['reports.read'],selfFields:{phone:'view'}}))
 const members=[]
 for(const name of ['Avery Chen','Blair Singh','Cameron Park','Drew Okafor','Ellis Rivera','Frankie Cole','Gabriel Shah','Harper Lee','Indigo Young','Jordan Reed']) {
  const key=name.toLowerCase().replace(' ','-'), person=await join(key,{legalName:name})
  const member=await api('access.give',{person:person.person})
  members.push({id:member.id,name,person:person.person,cookie:await h.signIn(`${key}@example.com`,{requested:true})})
 }
 const ids=members.map(m=>m.id)
 // Direct permissions survive replacing assigned levels; an existing level is replaced.
 await api('member.permissions',{member:ids[0],permissions:['it.tasks']})
 const old=await apply(await preview({kind:'level',name:'Prior payroll view',permissions:['pay.read']}))
 await apply(await preview({kind:'assignment',member:ids[1],levels:[old.id]}))
 const selection={kind:'bulk-assignment',members:ids,levels:[level.id]}
 const before=await api('levels')
 await h.api('level.preview',staff.hr.cookie,selection,403)
 await api('level.preview',{...selection,members:[]},400)
 await api('level.preview',{...selection,members:[ids[0],'missing']},404)
 await api('level.preview',{...selection,members:[ids[0],(await api('me')).id]},409)
 await api('level.preview',{...selection,levels:['missing']},404)
 assert.deepEqual((await api('levels')).assignments,before.assignments,'Invalid selections change no member')
 const review=await preview({...selection,members:[...ids,ids[0]],levels:[level.id,level.id]})
 assert.equal(review.plan.members.length,ids.length,'Duplicate selections have one impact per person')
 assert.deepEqual(review.impact.map(i=>i.member).sort(),[...ids].sort())
 assert.ok(review.impact.every(i=>i.added.includes('reports.read')&&i.afterSelf.phone==='view'))
 assert.deepEqual(review.impact.find(i=>i.member===ids[1]).removed,['pay.read'])
 for(const member of members) assert.ok(!(await h.api('me',member.cookie)).permissions.includes('reports.read'),'Preview changes no authority')
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
 const stale=await preview({...selection,levels:[]})
 await api('department.create',{name:'Changed since batch preview'})
 await api('level.apply',{review:stale.id},409)
 assert.deepEqual((await api('levels')).levels.find(l=>l.id===level.id).members.sort(),[...ids].sort(),'A stale batch changes nobody')
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
 members.at(-1).cookie=await h.signIn('jordan-reed@example.com',{requested:true})
 console.log('ROLE-002: PASS — ten-member reviewed selection, one audited atomic assignment, exact union, stale/replay/race refusal and same-session revocation; scopes, filters and revert remain partial')
 return {members,level:level.id}
}
