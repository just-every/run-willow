import { jobLevelProof } from './levels-job-read.mjs'
import { migrationProof } from './levels-migration.mjs'
// ROLE-001 named-level slice: public HTTP doors against the production Worker.
import assert from 'node:assert/strict'
import { bulkLevelProof, delegatedLevelProof, scopedDelegationProof } from './levels-bulk.mjs'
import { personalFieldProof, otherPersonalProof, documentCategoryProof, documentWriteProof, selectedReportProof } from './levels-personal.mjs'
import { harness } from './harness.mjs'
import { fixture } from './regression-fixture.mjs'
import { browserEvidence, demoProof } from './levels-browser.mjs'
import { scopeProof, transferProof } from './levels-scope.mjs'
import { scopeKindsProof } from './levels-scope-kinds.mjs'
import { decisionProof } from './levels-scope-decisions.mjs'
const shard=process.env.WILLOW_VERIFY_SHARD
assert.ok(!shard||['browser-access','browser-scope','browser-job'].includes(shard),'Select a registered access journey shard')
const access=!shard||shard==='browser-access'
const scope=!shard||shard==='browser-scope'
if(access||scope) {
const h=await harness()
try {
 assert.equal((await h.raw('/auth/bootstrap',{body:{token:h.vars.SETUP_TOKEN,displayName:'Olive Owner'}})).status,303)
 const owner=await h.signIn(h.vars.OWNER_EMAIL)
 await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
 const fx=await fixture(h,owner)
 const {api,join,staff:s}=fx
 const as=(who,path,body,status)=>h.api(path,s[who].cookie,body,status)
 const preview=plan=>api('level.preview',plan)
 const apply=review=>api('level.apply',{review:review.id})
 const create=async(name,permissions)=>apply(await preview({kind:'level',name,permissions}))
 const assign=async(member,levels)=>apply(await preview({kind:'assignment',member,levels}))
 const read=async(who)=>({
  profile:await as(who,`people/${s.employee.person}`),
  context:await as(who,`context/${s.employee.person}`),
  page:await (await h.raw(`/app/people/${s.employee.person}`,{cookie:s[who].cookie})).text(),
 })
 const checkPrivate=(values,pay,contact)=>{
  const text=JSON.stringify(values)
  assert.equal(text.includes('8123456')||text.includes('81234.56'),pay,'Compensation follows the current union')
  assert.equal(text.includes('PRIVATE-employee'),contact,'Private contact follows the current union')
 }
 if(access) {
 await as('hr','levels',undefined,403)
 await as('managera','level.preview',{kind:'level',name:'Escalation',permissions:['pay.read']},403)
 await as('hr','level.preview',{kind:'assignment',member:s.hr.member,levels:[]},403)
 const custom=await create('Workforce summaries',['reports.read'])
 const privateLevel=await create('Private contact',['people.private'])
 const payLevel=await create('Payroll view',['pay.read'])
 await api('level.preview',{kind:'level',name:'Invalid',permissions:['owner']},400)
 await api('level.preview',{kind:'assignment',member:(await api('me')).id,levels:[custom.id]},409)
 await api('level.preview',{kind:'assignment',member:s.managera.member,levels:['missing']},404)
 const before=await read('managera')
 checkPrivate(before,false,false)
 const assignment=await preview({kind:'assignment',member:s.managera.member,levels:[custom.id,payLevel.id,privateLevel.id]})
 assert.deepEqual(assignment.impact[0].added,['pay.read','people.private','reports.read'])
 assert.deepEqual((await as('managera','me')).permissions,[],'A preview changes no rights')
 await apply(assignment)
 assert.deepEqual((await as('managera','me')).permissions.sort(),['pay.read','people.private','reports.read'])
 checkPrivate(await read('managera'),true,true)
 checkPrivate(await read('managerb'),false,false)
 // The same live session loses exactly the revoked permission, keeping its other level.
 const edit=await preview({kind:'level',level:payLevel.id,name:'Payroll view',permissions:[]})
 assert.deepEqual(edit.impact[0].removed,['pay.read'])
 await apply(edit)
 checkPrivate(await read('managera'),false,true)
 assert.deepEqual((await as('managera','me')).permissions.sort(),['people.private','reports.read'])
 await api('level.apply',{review:edit.id},409)
 await as('managera',`level-reviews/${edit.id}`,undefined,403)
 const stale=await preview({kind:'level',level:privateLevel.id,name:'Private contact',permissions:[]})
 await api('department.create',{name:'Changed after preview'})
 assert.equal((await api('level.apply',{review:stale.id},409)).error,'review_stale')
 checkPrivate(await read('managera'),false,true)
 // Direct grants and named grants form a union; explicit replacement clears assigned levels.
 await api('member.permissions',{member:s.managera.member,permissions:['it.tasks']})
 assert.deepEqual((await as('managera','me')).permissions,['it.tasks'])
 await assign(s.managera.member,[custom.id,privateLevel.id])
 assert.deepEqual((await as('managera','me')).permissions.sort(),['it.tasks','people.private','reports.read'])
 const table=await api('levels')
 assert.ok(table.levels.find(l=>l.id===custom.id).members.includes(s.managera.member))
 // Base admin transition and all SQL-derived actor pickers follow the same union.
 const hrLevel=table.levels.find(l=>l.name==='HR administrator')
 await assign(s.managerb.member,[hrLevel.id])
 await as('managerb','me',undefined,401)
 s.managerb.cookie=await h.signIn('managerb@example.com')
 assert.ok((await as('managerb','me')).permissions.includes('people.manage'))
 assert.equal((await as('managerb','members')).find(m=>m.id===s.managerb.member).signIn,'active')
 await assign(s.managerb.member,[])
 await as('managerb','me',undefined,401)
 s.managerb.cookie=await h.signIn('managerb@example.com')
 assert.deepEqual((await as('managerb','me')).permissions,[])
 // Access ending removes every source, and a fresh invitation restores none.
 await api('access.end',{person:s.managera.person})
 await as('managera','me',undefined,401)
 assert.ok(!(await api('levels')).assignments.some(a=>a.member_id===s.managera.member))
 await api('access.give',{person:s.managera.person})
 s.managera.cookie=await h.signIn('managera@example.com')
 assert.deepEqual((await as('managera','me')).permissions,[])
 checkPrivate(await read('managera'),false,false)
 const awaitOwnerId=(await api('me')).id
 const audit=await api('audit')
 assert.ok(audit.some(e=>e.action==='level.level'&&e.actor===(awaitOwnerId)))
 }
 const personal=access?await personalFieldProof(h,owner,s):undefined
 const bulk=scope?await bulkLevelProof(h,owner,s,join):undefined
 const scoped=scope?await scopeProof(h,owner,fx):undefined
 if(scope) {
  await transferProof(h,scoped)
  await decisionProof(h,owner,scoped)
  await scopeKindsProof(h,owner,fx)
  console.log('ROLE-002 scopes: PASS — everyone, direct, direct and indirect, location, department, employment type, custom field and combined group scopes reach exactly their people through every registered door, control members, dated transfers on each side of the effective date, scoped writes rechecked, invalid scopes refused and batch revert')
 }
 const delegated=access?await delegatedLevelProof(h,owner,s):undefined
 if(access) await otherPersonalProof(h,owner,s)
 const documentRights=access?await documentCategoryProof(h,owner,s):undefined
 if(access) await documentWriteProof(h,owner,s,documentRights)
 const selectedReport=access?await selectedReportProof(h,owner,fx):undefined
 await browserEvidence(h,owner,s,bulk,scoped,delegated,documentRights,selectedReport,{access})
 if(access) await scopedDelegationProof(h,owner,s)
 if(access) console.log('ROLE-001: PASS — exact union, explicit bounded administration and reviewed changes, stale and replay refusal, same-session revocation and ended-access clearing (personal self-write modes and immutable HR routing proved; other field and section rights remain partial)')
} finally { await h.close() }
}

if(!shard||shard==='browser-job') {
await demoProof()

await migrationProof()

await jobLevelProof()

}
