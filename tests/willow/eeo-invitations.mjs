// EEO-003: real invitation mail at the network edge and the built public doors.
import assert from 'node:assert/strict'
import { preboardErasure } from './eeo-preboard-erasure.mjs'
import { invitationBrowser, invitationScreens, invitationLinkScreens, startPreboardEmploymentBrowser } from './eeo-invitations-browser.mjs'

export async function invitationJourneys(h,owner,f,links) {
 const s=f.staff, api=f.api, hr=(path,body,status)=>h.api(path,s.hr.cookie,body,status)
 const portal=async (link,body,status=200)=>{
  const response=body===undefined ? await fetch(link,{headers:{accept:'application/json'},redirect:'manual'}) : await h.raw(new URL(link).pathname,{body})
  const text=await response.text();assert.equal(response.status,status,`${new URL(link).pathname.split('/')[1]}: ${response.status} ${text.slice(0,200)}`)
  return JSON.parse(text)
 }
 const send=async(name,email)=>{
  const sent=await hr('preboarding.send',{name,email})
  assert.equal(sent.delivery.status,'accepted');assert.ok(links.get(email));assert.ok(!JSON.stringify(sent).includes('/preboarding/'))
  return {...sent,link:links.get(email)}
 }
 const expiring=await hr('preboarding.send',{name:'Brief invitation',email:'brief@example.com',expiresAt:Date.now()+4000})
 const expiryLink=links.get('brief@example.com')
 assert.equal((await portal(expiryLink)).history.length,0)
 await new Promise(resolve=>setTimeout(resolve,4100))
 await portal(expiryLink,undefined,404)
 await portal(expiryLink,{hispanic:'declined'},404)
 assert.equal((await hr('preboarding')).find(row=>row.id===expiring.id).status,'expired')
 const a=await send('Nora Newhire','nora@example.com'), b=await send('Dara Decliner','dara@example.com')
 await h.api('preboarding.send',s.managera.cookie,{name:'No',email:'no@example.com'},403)
 await hr('preboarding.send',{name:'No',email:'no@example.com',expiresOn:'2000-01-01'},400)
 const deniedOrigin=await fetch(a.link,{method:'POST',headers:{'content-type':'application/json',origin:'https://different.example'},body:JSON.stringify({hispanic:'declined'})})
 assert.equal(deniedOrigin.status,403)
 assert.equal((await h.raw('/api/willow/people')).status,401,'an invitation does not admit an employee session')
 const initial=await portal(a.link)
 assert.equal(initial.history.length,0)
 await portal(a.link,{person:s.employee.person,hispanic:'no'},400)
 const answers={hispanic:'no',races:['asian'],sex:'female',veteran:'not_protected',disability:'no'}
 const decline={hispanic:'declined',races:['declined'],sex:'declined',veteran:'declined',disability:'declined'}
 if(!await invitationBrowser(h,a.link,b.link)) {await portal(a.link,answers);await portal(b.link,decline)}
 const original=(await portal(a.link)).current
 assert.deepEqual([original.hispanic,original.races,original.sex,original.source],['no',['asian'],'female','preboarding/self-identified'])
 const denied=(await portal(b.link)).current
 assert.deepEqual([denied.hispanic,denied.sex],['declined','declined'])
 const progress=(await hr('preboarding')).filter(row=>[a.id,b.id].includes(row.id))
 assert.equal(progress.length,2)
 assert.deepEqual([...new Set(progress.map(row=>row.step))],['self-identification step done'])
 for(const row of progress) for(const key of ['current','history','hispanic','races','sex','declined','token_hash']) assert.ok(!JSON.stringify(row).includes(key),key)
 const record=await hr(`eeo/preboarding/${a.id}`)
 assert.deepEqual(record.current,original)
 assert.equal((await hr(`eeo/preboarding/${b.id}`)).current.hispanic,'declined')
 for(const cookie of [owner,s.managera.cookie,s.managerb.cookie,s.employee.cookie]) await h.api(`eeo/preboarding/${a.id}`,cookie,undefined,403)
 const audit=await api('audit')
 assert.ok(audit.some(row=>row.action==='preboarding.individual.read'&&row.subject===a.id&&row.actor===s.hr.member))
 assert.ok(!audit.some(row=>JSON.stringify(row.detail).includes('"races"')))
 // HR starts the employee through the existing joiner action. No answer or approval is submitted.
 const joined=await startPreboardEmploymentBrowser(h,s.hr.cookie,a.id,f.templates.joiner,f.schedule,new Date(Date.now()-86400000).toISOString().slice(0,10)) ?? await f.join('nora',{legalName:'Nora Newhire',preboardingPacket:a.id})
 const transferred=await hr(`eeo/person/${joined.person}`)
 assert.deepEqual(transferred.current,original,'timestamps, version, sequence, source and answers transfer unchanged')
 assert.match(transferred.filing.raceEthnicity.source,/preboarding self-identified/)
 await portal(a.link,undefined,404)
 await portal(a.link,answers,404)
 const noraMember=await api('access.give',{person:joined.person})
 const noraCookie=await h.signIn('nora@example.com',{requested:true})
 assert.deepEqual((await h.api('eeo/self',noraCookie)).current,original)
 await h.api('eeo.self.write',noraCookie,{hispanic:'yes',sex:'female',veteran:'not_protected',disability:'no'})
 assert.equal((await h.api('eeo/self',noraCookie)).history[1].source,'preboarding/self-identified')
 await hr('preboarding.withdraw',{packet:b.id})
 await portal(b.link,undefined,404);await portal(b.link,decline,404)
 // Decline was completed before withdrawal and remains restricted compliance evidence.
 assert.equal((await hr(`eeo/preboarding/${b.id}`)).current.hispanic,'declined')
 for(const cookie of [owner,s.hr.cookie,s.managera.cookie,s.managerb.cookie,noraCookie]) {
  for(const path of ['people',`people/${joined.person}`,`context/${joined.person}`]) {
   const data=await h.api(path,cookie)
   assert.ok(!JSON.stringify(data).match(/preboarding\/self-identified|"hispanic"|"veteranClasses"/))
  }
 }
 const csv=await(await h.raw('/app/exports/employees.csv?scope=organization&fields=name,workEmail,jobTitle',{cookie:s.hr.cookie})).text()
 assert.ok(!/hispanic|veteran|declined|asian|preboarding\/self-identified/i.test(csv))
 // Two repeat applications remain separate, with no transfer to a candidate, timeline or proposal.
 const opening=await hr('hiring.opening',{name:'Account coordinator',stages:['New','Offer','Rejected','Hired'],members:[s.managerb.member]})
 const candidate=async name=>hr('hiring.candidate',{opening:opening.id,name,contactEmail:'applicant@example.com',source:'Applicant link'})
 const first=await candidate('Ari Applicant'),second=await candidate('Ari Applicant')
 const invite=async(id,phase='pre-offer')=>{const sent=await hr('hiring.selfId.invite',{application:id,phase});assert.equal(sent.delivery.status,'accepted');return{...sent,link:links.get('applicant@example.com')}}
 const short=await hr('hiring.selfId.invite',{application:first.id,phase:'pre-offer',expiresAt:Date.now()+4000})
 assert.equal(short.delivery.status,'accepted')
 const shortLink=links.get('applicant@example.com')
 assert.equal((await portal(shortLink)).history.length,0)
 await new Promise(resolve=>setTimeout(resolve,4100))
 await portal(shortLink,undefined,404);await portal(shortLink,{hispanic:'declined'},404)
 const pre=await invite(first.id)
 await invitationLinkScreens(h,pre.link,'applicant-pre-offer')
 assert.ok(pre.link);assert.equal((await portal(pre.link)).phase,'pre-offer')
 await portal(pre.link,{...answers,veteran:'protected',veteranClasses:['disabled']},400)
 await portal(pre.link,answers)
 assert.equal((await portal(pre.link)).history.length,1)
 assert.equal((await hr(`eeo/applicants/${first.id}`,undefined,404)).error,'applicant_record_unavailable')
 const secondInvite=await invite(second.id)
 await portal(secondInvite.link,decline)
 for(const cookie of [owner,s.hr.cookie,s.managerb.cookie]) {
  const data=await h.api(`hiring/applications/${first.id}`,cookie)
  assert.ok(!JSON.stringify(data).match(/"hispanic"|"races"|"disability"|"selfId"/))
 }
 await hr(`eeo/applicants/${first.id}`,undefined,404)
 await hr('hiring.selfId.invite',{application:first.id,phase:'post-offer'},409)
 await hr('hiring.move',{application:first.id,revision:first.revision,stage:'Offer'})
 const post=await invite(first.id,'post-offer')
 await portal(pre.link,undefined,404)
 assert.equal((await portal(post.link)).history.length,0,'post-offer asks again')
 await portal(post.link,{...answers,veteran:'protected',veteranClasses:['disabled']})
 await hr('hiring.close',{application:first.id,revision:2,openingRevision:1,outcome:'hired'})
 await hr('hiring.close',{application:second.id,revision:1,openingRevision:1,outcome:'rejected'})
 await portal(secondInvite.link,undefined,404)
 await hr('hiring.move',{application:first.id,revision:3,stage:'Rejected'},409)
 assert.equal((await hr(`hiring/applications/${first.id}`)).closure.outcome,'hired')
 const appRecord=await hr(`eeo/applicants/${first.id}`)
 assert.equal(appRecord.history.length,2)
 assert.deepEqual(appRecord.history.map(row=>row.phase),['post-offer','pre-offer'])
 assert.deepEqual(appRecord.history[0].veteranClasses,['disabled'])
 assert.equal((await hr(`eeo/applicants/${second.id}`)).current.hispanic,'declined')
 await api('eeo.grant',{member:s.managerb.member,enabled:true})
 await h.api(`eeo/applicants/${first.id}`,s.managerb.cookie,undefined,409)
 assert.ok(!(await h.api('eeo/applicants',s.managerb.cookie)).some(row=>row.id===first.id))
 for(const cookie of [owner,s.managera.cookie,s.employee.cookie]) await h.api(`eeo/applicants/${first.id}`,cookie,undefined,403)
 assert.ok((await api('audit')).some(row=>row.action==='eeo.applicant.individual.read'&&row.subject===first.id&&row.actor===s.hr.member))
 await invitationScreens(h,{owner,hr:s.hr.cookie,applicant:post.link,withdrawn:b.link,packet:b.id,application:first.id,opening:opening.id})
 await api('eeo.grant',{member:s.hr.member,enabled:false})
 await hr(`eeo/preboarding/${b.id}`,undefined,403);await hr(`eeo/applicants/${first.id}`,undefined,403)
 await api('eeo.grant',{member:s.hr.member,enabled:true})
 // Native DATA-002 covers every linked application, keeping EEO custody restricted.
 await api('retention.adopt',{version:(await api('retention')).tableVersion})
 await api('erasure.request',{application:first.id,source:'own_request',receivedOn:new Date().toISOString().slice(0,10)})
 const oldPreview=await api(`erasure/preview?application=${first.id}`)
 await portal(post.link,{...answers,sex:'male'})
 await api('erasure.confirm',{application:first.id,digest:oldPreview.digest},409)
 const preview=await api(`erasure/preview?application=${first.id}`)
 assert.equal(preview.confirmable,true,JSON.stringify(preview.blockers))
 assert.equal(preview.items.find(row=>row.id==='applicant_eeo').rows,4)
 const erased=await api('erasure.confirm',{application:first.id,digest:preview.digest})
 assert.ok(erased.receipt)
 await hr(`eeo/applicants/${first.id}`,undefined,404);await hr(`eeo/applicants/${second.id}`,undefined,404)
 await portal(post.link,undefined,404)
 const retained=await api('retained')
 assert.ok(!JSON.stringify(retained).includes('"veteran_classes"'),'owner without compliance cannot read retained EEO')
 await preboardErasure(h,owner,s,b,expiring,portal)
 await api('eeo.grant',{member:noraMember.id,enabled:false})
 console.log('EEO-003 invitations, promotion and applicant separation: passed')
}
