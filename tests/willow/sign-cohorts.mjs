// Public-door cohort enrollment, explicit delivery and durable pending-work proof.
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { file } from './harness.mjs'

export async function signatureCohortProof(h,owner,s,join) {
 const api=(path,body,status)=>h.api(path,owner,body,status)
 const as=(cookie,path,body,status)=>h.api(path,cookie,body,status)
 const location=await api('location.create',{name:'synthetic-willow-15300',timezone:'UTC'})
 const otherLocation=await api('location.create',{name:'synthetic-willow-15301',timezone:'UTC'})
 const department=await api('department.create',{name:'synthetic-willow-15302'})
 const create=async(n,extra={})=>{
  const name=`synthetic-willow-${n}`
  const person=await join(name,{locationId:location.id,departmentId:department.id,...extra})
  const member=await api('access.give',{person:person.person})
  return {...person,member:member.id,cookie:await h.signIn(name+'@example.com',{requested:true})}
 }
 const a=await create(15303),b=await create(15304,{employmentType:'part_time'})
 const folder=await api('company.folder',{name:'synthetic-willow-15305',audience:{kind:'everyone',id:null}})
 const pdf=await PDFDocument.create();pdf.addPage([612,792])
 const source=await api('company.file',{folder:folder.id,title:'synthetic-willow-15306',file:file('synthetic-willow-15306.pdf',await pdf.save())})
 const category=await api('category.create',{name:'synthetic-willow-15307',subjectReads:true})
 const fields=[{signer:0,kind:'signature',page:1,x:0.1,y:0.4,width:0.4,height:0.1},{signer:1,kind:'signature',page:1,x:0.1,y:0.7,width:0.4,height:0.1}]
 const template=await api('signature.template',{source:source.versionId,title:'synthetic-willow-15308',category:category.id,signers:['employee','hr'],fields})
 const t=(await api('signature-templates')).find(t=>t.id===template.id)
 await api('signature.template.approve',{template:t.id,digest:t.digest,reviewed:true})
 const base={template:t.id,hr:(await api('me')).id,expiryDays:7}
 await api('signature.preview',{...base,people:[a.person],futureJoiners:true},400)
 const levelReview=await api('level.preview',{kind:'level',name:'synthetic-willow-15309',permissions:[]})
 const level=await api('level.apply',{review:levelReview.id})
 const assignment=await api('level.preview',{kind:'assignment',member:a.member,levels:[level.id]})
 await api('level.apply',{review:assignment.id})
 a.cookie=await h.signIn('synthetic-willow-15303@example.com')
 for(const [kind,value,people] of [['named','',[a.person]],['everyone','',null],['department',department.id,null],['employment_type','part_time',null],['access_level',level.id,null]]) {
  const review=await api('signature.preview',{...base,cohortKind:kind,cohortValue:value,...(people?{people}:{})})
  assert.ok(review.recipients.some(r=>r.id===(kind==='employment_type'?b.person:a.person)))
  if(kind==='access_level'||kind==='named')assert.deepEqual(review.recipients.map(r=>r.id),[a.person])
  const issued=await api('signature.send',{review:review.id,digest:review.digest,approved:true})
  await api('signature.cancel',{cohort:issued.id})
 }
 const issue=async(extra={})=>{
  const review=await api('signature.preview',{...base,cohortKind:'location',cohortValue:location.id,...extra})
  return api('signature.send',{review:review.id,digest:review.digest,approved:true})
 }
 const requests=async cohort=>(await api('signature-requests')).filter(r=>r.cohort===cohort)
 const quiet=await issue({futureJoiners:true})
 const c=await create(15310)
 await api('work.run',{})
 assert.equal((await requests(quiet.id)).length,3,'The explicitly included matching joiner receives an independent portal request')
 const quietIds=(await requests(quiet.id)).map(r=>r.id)
 await api('connections.notices',{enabled:true})
 await api('work.policy',{offsets:'0',quietStart:0,quietEnd:0,defaultDays:0})
 await api('work.run',{})
 assert.ok((await api('work')).items.filter(w=>quietIds.some(id=>w.source.startsWith('signature:'+id+':'))).every(w=>w.deliveries.length===0),'Global notice and reminder approval does not enable a cohort notification policy')
 assert.ok(!(await api('audit')).some(e=>e.action==='signature.notice'&&quietIds.includes(e.subject)))
 await api('signature.cancel',{cohort:quiet.id})
 const d=await create(15311)
 await api('work.run',{})
 assert.equal((await requests(quiet.id)).length,3,'Cancellation stops future enrollment')
 const active=await issue({notify:true,futureJoiners:true})
 const rows=await requests(active.id),byPerson=new Map(rows.map(r=>[r.person,r.id]))
 const sign=async(cookie,id)=>{
  const r=await as(cookie,'signature-requests/'+id)
  const payload=await as(cookie,'signature.prepare',{request:id,revision:r.revision,digest:r.digest,name:'synthetic-willow-15312'})
  return as(cookie,'signature.act',{request:id,revision:r.revision,digest:r.digest,action:'sign',consent:true,payload:payload.id})
 }
 await sign(a.cookie,byPerson.get(a.person));await sign(owner,byPerson.get(a.person))
 let pending=await as(b.cookie,'signature-requests/'+byPerson.get(b.person))
 await as(b.cookie,'signature.act',{request:pending.id,revision:pending.revision,digest:pending.digest,action:'withdraw'})
 await api('access.end',{person:c.person})
 await api('work.run',{})
 const work=await api('work'),key='signature:'+byPerson.get(d.person)+':0'
 assert.ok(!work.items.some(w=>[a.person,b.person,c.person].some(person=>w.source.startsWith('signature:'+byPerson.get(person)+':'))),'Completed, withdrawn and ended-access requests have no future reminder authority')
 const task=work.items.find(w=>w.source===key)
 assert.ok(task,'The current pending signer retains owned portal work')
 assert.equal(task.deliveries.length,1)
 assert.equal(task.deliveries[0].recipient,d.member)
 assert.equal(task.deliveries[0].status,'accepted')
 await h.restart()
 await api('work.run',{})
 assert.equal((await api('work')).items.find(w=>w.source===key).deliveries.length,1,'A restarted scheduler and later tick retains the durable claim instead of resending')
 const escalation=(await api('work')).items.find(w=>w.source==='signature-escalation:'+byPerson.get(d.person)+':0')
 const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10)
 await api('work.schedule',{source:escalation.source,revision:escalation.revision,owner:s.hr.member,substitute:'',dueDate:yesterday,nextAction:'synthetic-willow-15313'})
 await api('work.run',{})
 assert.equal((await api('work')).items.find(w=>w.source===escalation.source).deliveries.length,1,'Escalation uses the existing reviewed FLOW-002 schedule')
 const notices=(await api('audit')).filter(e=>e.action==='signature.notice'&&rows.some(r=>r.id===e.subject))
 assert.ok(notices.some(e=>e.subject===byPerson.get(d.person)&&JSON.parse(e.detail).status==='accepted'),'Explicitly reviewed email policy permits an independently addressed authenticated link')
 // Current shared-folder targeting gates both outreach and future enrollment.
 const pendingBeforeRetarget=await as(d.cookie,'signature-requests/'+byPerson.get(d.person))
 const preparedBeforeRetarget=await as(d.cookie,'signature.prepare',{request:pendingBeforeRetarget.id,revision:pendingBeforeRetarget.revision,digest:pendingBeforeRetarget.digest,name:'synthetic-willow-15315'})
 await api('company.folder',{id:folder.id,name:'synthetic-willow-15305',audience:{kind:'location',id:otherLocation.id}})
 assert.equal((await h.raw('/app/signatures/'+pendingBeforeRetarget.id+'.pdf',{cookie:d.cookie})).status,404,'Retargeting refuses an old unsigned request download')
 assert.equal((await h.raw('/app/signature-payloads/'+preparedBeforeRetarget.id+'.pdf',{cookie:d.cookie})).status,404,'Retargeting refuses an already prepared payload link')
 const preserved=await as(a.cookie,'signature-requests/'+byPerson.get(a.person))
 assert.equal((await h.raw('/app/files/document/'+preserved.sealedVersion,{cookie:a.cookie})).status,200,'Current category rights preserve an existing signed employee record')
 const denied=await create(15314)
 await api('work.run',{})
 assert.ok(!(await requests(active.id)).some(r=>r.person===denied.person))
 assert.ok(!(await api('work')).items.some(w=>w.source===key),'Current targeting revocation removes reminder authority')
 await api('signature.cancel',{cohort:active.id})
 const before=(await api('audit')).filter(e=>e.action==='signature.notice'||e.action==='work.reminder'&&rows.some(r=>e.subject.includes(r.id))).length
 await api('work.run',{})
 assert.equal((await api('audit')).filter(e=>e.action==='signature.notice'||e.action==='work.reminder'&&rows.some(r=>e.subject.includes(r.id))).length,before,'Cancellation and later ticks create no further signing outreach')
 assert.equal((await requests(active.id)).find(r=>r.person===a.person).state,'signed','Cancellation preserves the completed signed copy')
 await api('connections.notices',{enabled:false})
 return {cohort:active.id,completed:byPerson.get(a.person),pending:byPerson.get(d.person),cookie:d.cookie}
}
