import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'

export async function handbookProof({h,api,owner,staff:s,ask,calls,live,onCall,receipts}) {
 const hr=(path,body,status)=>h.api(path,s.hr.cookie,body,status)
 const clauses=[
  {clauseId:1,topic:'remote-work',applicableFrom:day(-30),text:'Remote work requires written manager approval. It does not change the employee employment location.'},
  {clauseId:2,topic:'attendance',applicableFrom:day(30),text:'From the stated effective date, notify your manager before a late arrival.'},
 ]
 const body={title:'Workplace policy handbook',clauses}
 await h.api('ai.handbook.write',s.employee.cookie,body,403)
 const draft=await hr('ai.handbook.write',body)
 assert.equal((await h.api('handbooks',s.employee.cookie)).length,0,'An unpublished draft is not an employee policy source')
 await h.api('handbook-management',s.employee.cookie,undefined,403)
 await h.api('ai.handbook.approve',s.managera.cookie,{version:draft.versionId,revision:draft.revision,sourceAttestation:true},403)
 await hr('ai.handbook.include',{version:draft.versionId,revision:draft.revision,included:true},409)
 await hr('ai.handbook.approve',{version:draft.versionId,revision:draft.revision,sourceAttestation:false},400)
 const publication=await hr('ai.handbook.approve',{version:draft.versionId,revision:draft.revision,sourceAttestation:true})
 assert.equal((await h.api('handbooks',s.employee.cookie))[0].versionId,draft.versionId)
 const before=calls.length
 assert.equal((await ask(s.employee.cookie,'handbook','What is our remote work policy?')).status,'unsupported')
 const included=await hr('ai.handbook.include',{version:draft.versionId,revision:publication.revision,included:true})
 assert.equal(calls.length,before,'Publication and inclusion execute no model call')
 const answer=await ask(s.employee.cookie,'handbook','What is our remote work policy?')
 assert.equal(answer.status,'answered');assert.equal(answer.claims[0].citation.versionId,draft.versionId)
 assert.equal(answer.claims[0].citation.clause,'handbook-clause-1');assert.equal(answer.claims[0].citation.applicableFrom,clauses[0].applicableFrom)
 assert.equal(answer.claims[0].citation.kind,'handbook')
 const context=JSON.parse(calls.at(-1).messages[1].content)
 assert.equal(context.topic,'remote-work');assert.deepEqual(context.inputs,[])
 assert.ok(!JSON.stringify(context).includes(body.title),'Handbook titles are not needed at the model edge')
 receipts.push({feature:'AI-001 current approved handbook clause',model:answer.model,responseId:answer.responseId})
 const future=calls.length
 assert.equal((await ask(s.employee.cookie,'handbook','What is the attendance policy?')).status,'unsupported')
 assert.equal(calls.length,future,'A future clause cannot answer a current question')
 let current=included
 if(!live){
  const revised=await hr('ai.handbook.write',{...body,handbook:draft.handbookId,revision:included.revision,clauses:[{...clauses[0],text:'Remote work requires a fresh written manager approval for each agreed period.'},clauses[1]]})
  assert.equal((await h.api('handbooks',s.employee.cookie))[0].versionId,draft.versionId,'A new draft does not replace a publication')
  onCall(()=>hr('ai.handbook.approve',{version:revised.versionId,revision:revised.revision,sourceAttestation:true}))
  assert.equal((await ask(s.employee.cookie,'handbook','What is our remote work policy?',409)).error,'ai_source_changed')
  const latest=(await hr('handbook-management')).find(source=>source.versionId===revised.versionId)
  assert.equal(latest.included,false,'A new publication needs fresh source inclusion')
  current=await hr('ai.handbook.include',{version:revised.versionId,revision:latest.revision,included:true})
  const changed=await ask(s.employee.cookie,'handbook','What is our remote work policy?')
  assert.equal(changed.claims[0].citation.versionId,revised.versionId);assert.equal(changed.claims[0].text,'Remote work requires a fresh written manager approval for each agreed period.')
 }
 await hr('ai.handbook.withdraw',{handbook:draft.handbookId,revision:current.revision})
 const withdrawn=calls.length
 assert.equal((await ask(s.employee.cookie,'handbook','What is our remote work policy?')).status,'unsupported')
 assert.equal((await h.api('handbooks',s.employee.cookie)).length,0)
 assert.equal(calls.length,withdrawn,'Withdrawn handbooks cannot reach the provider')
 const audit=await api('audit')
 const records=audit.filter(row=>row.action.startsWith('ai.handbook.'))
 assert.ok(records.length)
 for(const record of records)for(const text of [body.title,...clauses.map(clause=>clause.text)])assert.ok(!JSON.stringify(record.detail).includes(text),'Handbook audit contains references, not content')
 console.log('AI-001 approved handbook versions, inclusion, dates, reader access and withdrawal: PASS')
}
