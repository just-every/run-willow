// LOCALE-001: two complete public-door journeys. Provider fakes exist only at mail's network edge.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { harness,file } from './harness.mjs'
import { fixture,day,today } from './regression-fixture.mjs'
import { nativeLocaleJourney } from './locale-native.mjs'
import { readZip } from './export-reader.mjs'
import { publishTemplate } from './publish-template.mjs'
import { evidenceDirectory } from './evidence.mjs'
const messages=[],pushes=[],invitations=new Map()
const h=await harness({provider:async request=>{
 if(new URL(request.url).hostname==='exp.host'){pushes.push(await request.json());return Response.json({data:{status:'ok',id:'recorded-ticket'}})}
 if(new URL(request.url).hostname!=='api.sendgrid.com')throw new Error('Unexpected provider edge')
 const message=await request.json();messages.push(message)
 const content=message.content.map(c=>c.value).join('\n'),link=content.match(/https?:[^\s"<>]+\/(?:preboarding|applicant-self-id)\/[^\s"<>]+/)?.[0]
 if(link)for(const p of message.personalizations)for(const to of p.to)invitations.set(to.email,link.replaceAll('&amp;','&'))
 return new Response(null,{status:202})
}})
let browser
const html=async(path,cookie)=>{const r=await h.raw(path,{cookie});const text=await r.text();assert.equal(r.status,200,`${path}: ${r.status} ${text.slice(0,250)}`);return text}
const cookies=cookie=>cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}})
const capture=async(page,path,name)=>{await page.goto(h.origin+path);await page.screenshot({path:join(evidenceDirectory,`locale-${name}-390.png`),fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:join(evidenceDirectory,`locale-${name}-1440.png`),fullPage:true});await page.setViewportSize({width:390,height:844})}
try {
 await h.raw('/auth/bootstrap',{body:{token:h.vars.SETUP_TOKEN,displayName:'Locale Owner'}})
 const owner=await h.signIn(h.vars.OWNER_EMAIL)
 await h.raw('/setup',{cookie:owner,form:new URLSearchParams({confirm:'yes'})})
 const f=await fixture(h,owner),s=f.staff,api=f.api,employee=s.employee.cookie
 if(process.env.WILLOW_LOCALE_BROWSER==='1'){
  const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH??'@playwright/test')
  browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']})
 }
 const context=browser?await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}):null
 if(context)await context.addCookies(cookies(employee))
 const page=context?await context.newPage():null
 // Journey 1: HR-authored translations, employee language, PTO, notices, native signature and phone clock.
 await api('mover.schedule',{period:s.employee.period,effectiveFrom:day(-1),payBasis:'hourly',payAmount:'25.00',reason:'Hourly employee'})
 const announcement=await api('company.announce',{title:'Safety update',body:'Review the new safety guide.',startsOn:today,audience:{kind:'everyone',id:null},ackRequired:true})
 const field=await api('customField.define',{key:'shirt',classification:'general',label:'Shirt size',type:'select',effectiveFrom:day(-1),employeeRead:true,managerRead:true,options:'small|Small\nlarge|Large'})
 await api('customField.define',{key:'badge',classification:'general',label:'Badge color',type:'text',maxLength:100,effectiveFrom:day(-1),employeeRead:true})
 await api('customField.write',{person:s.employee.person,effectiveFrom:today,values:{shirt:'small',badge:'Home'}})
 const sources=await api('translations'),shirt=sources.sources.find(x=>x.kind==='customField'&&x.original==='Shirt size')
 assert.ok(shirt,'HR can choose the exact field definition version')
 const translate=async source=>api('translation.write',{...source,language:'es-US',translated:source.translated})
 await translate({...shirt,translated:'Talla de camisa'})
 await translate({...sources.sources.find(x=>x.kind==='customField'&&x.original==='Small'),translated:'Pequeña'})
 for(const [key,text] of [['title','Aviso de seguridad'],['body','Revise la nueva guía de seguridad.']])await translate({...sources.sources.find(x=>x.source===announcement.versionId&&x.field===key),translated:text})
 await h.api('translation.write',employee,{...shirt,language:'es-US',translated:'Not allowed'},403)
 await api('connections.notices',{enabled:true})
 await nativeLocaleJourney(h,employee,page)
 await h.api('mobile.push.register',s.ended.cookie,{token:'ExpoPushToken[revoked-device]',platform:'android',enabled:true})
 await api('access.end',{person:s.ended.person})
 await h.api('mobile.push.register',s.ended.cookie,{token:'ExpoPushToken[revoked-device]',platform:'android',enabled:true},401)
 const beforePrivate=await h.api('people/'+s.employee.person,employee)
 await h.api('person.update',employee,{person:s.employee.person,revision:beforePrivate.revision,private:true,...beforePrivate.private,date_of_birth:'2000-'+today.slice(5)})
 await h.api('company.celebrations',employee,{birthday:true,anniversary:true})

 await h.api('mobile.push.register',s.managera.cookie,{token:'ExpoPushToken[manager-en]',platform:'ios',enabled:true})
 if(page){await page.goto(h.origin+'/app');await page.getByLabel('Display language').selectOption('es-US');await page.getByRole('button',{name:'Save language',exact:true}).click();await page.waitForURL('**/app?notice=*')}
 else await h.api('language.choose',employee,{language:'es-US'})
 let home=await html('/app',employee)
 assert.match(home,/<html lang="es-US">/);assert.match(home,/Aviso de seguridad/);assert.match(home,/Revise la nueva guía/)
 assert.match(home,/cumpleaños/);assert.ok(!home.includes(': birthday'));
 assert.match(home,/Solicitar permiso/);assert.ok(!home.includes('Review the new safety guide.'))
 if(page)await capture(page,'/app/people/'+s.employee.person,'profile')
 const profile=await html('/app/people/'+s.employee.person,employee)
 assert.match(profile,/Correo personal/);assert.match(profile,/Teléfono/);assert.match(profile,/Domicilio/);assert.ok(!profile.includes('>Personal email<'))
 assert.match(profile,/Talla de camisa/);assert.match(profile,/Pequeña/);assert.match(profile,/Badge color[\s\S]*Sin traducción/);assert.match(profile,/>Home</,'record value Home is never translated')
 const report=await api('report.save',{definition:{name:'Workforce',columns:['name','leaveHours','custom.shirt'],asOf:'today',status:'all'}})
 const start=day(3),end=day(3)
 if(page){
  await capture(page,'/app','home')
  await page.goto(h.origin+'/app/leave');await page.getByLabel('Primer día',{exact:true}).fill(start);await page.getByLabel('Último día',{exact:true}).fill(end);await page.getByRole('button',{name:'Calcular',exact:true}).click()
  await page.screenshot({path:join(evidenceDirectory,'locale-quote-390.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:join(evidenceDirectory,'locale-quote-1440.png'),fullPage:true});await page.setViewportSize({width:390,height:844})
  await page.getByLabel('Motivo (opcional y confidencial: su gerente no lo ve)').fill('Familia')
  await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click()
  await page.waitForURL('**/app/leave/*')
 }else await h.api('leave.request',employee,{account:s.employee.account,startDate:start,endDate:end,reason:'Familia'})
 const requests=(await h.api('people/'+s.employee.person,employee)).leave.requests,r=requests.find(r=>r.startDate===start)
 assert.ok(r)
 const error=await h.submit('leave.request',employee,{account:s.employee.account,startDate:start,endDate:end},'/app/leave')
 assert.match(await html(error.pathname+error.search,employee),/coinciden con otro permiso/)
 await h.api('leave.decide',s.managera.cookie,{request:r.id,decision:'approve'})
 assert.ok(pushes.some(p=>p.body==='Abra Willow para revisar su trabajo.'));for(const p of pushes){assert.deepEqual(p.data,{path:'/app'});assert.ok(!JSON.stringify(p).includes('Familia'))}
 const mail=messages.find(m=>m.subject==='Willow: hay una actualización disponible'&&m.personalizations.some(p=>p.to.some(t=>t.email==='employee@example.com')))
 assert.ok(mail,'recipient language applies at the mail edge');assert.match(JSON.stringify(mail),/decisión sobre un permiso/);assert.ok(!JSON.stringify(mail).includes('Familia'))
 if(page)await capture(page,'/app/leave/'+r.id,'pto')
 // Native exact-byte signing records the reviewed consent language even after a display switch.
 const pdf=await PDFDocument.create();pdf.addPage([612,792])
 const folder=await api('company.folder',{name:'Agreements',audience:{kind:'everyone',id:null}})
 const source=await api('company.file',{folder:folder.id,title:'Safety agreement',file:file('safety.pdf',await pdf.save())})
 const category=await api('category.create',{name:'Signed policies',subjectReads:true})
 const template=await api('signature.template',{source:source.versionId,title:'Safety agreement',coverText:'Read the safety policy before signing.',category:category.id,signers:['employee'],fields:[{signer:0,kind:'signature',page:1,x:.1,y:.4,width:.7,height:.08}]})
 const cover=(await api('translations')).sources.find(x=>x.source===template.id&&x.field==='cover');await translate({...cover,translated:'Lea la política de seguridad antes de firmar.'})
 const t=(await api('signature-templates')).find(t=>t.id===template.id)
 await api('signature.template.approve',{template:t.id,digest:t.digest,reviewed:true})
 const review=await api('signature.preview',{template:t.id,people:[s.employee.person],hr:s.hr.member,expiresAt:Date.now()+86400000})
 const sent=await api('signature.send',{review:review.id,digest:review.digest,approved:true}),id=sent.requests[0]
 const detail=await h.api('signature-requests/'+id,employee),bound={request:id,revision:detail.revision,digest:detail.digest}
 const payload=await h.api('signature.prepare',employee,{...bound,name:'Empleado de prueba'})
 assert.equal(payload.language,'es-US');assert.match(await html('/app/signatures/'+id,employee),/Lea la política de seguridad/);assert.match(payload.consent,/Doy mi consentimiento/)
 if(page){await capture(page,'/app/signatures/'+id,'signature');await page.getByLabel('Nombre para la firma').fill('Empleado de prueba');await page.getByRole('button',{name:'Revisar documento para firmar'}).click();assert.match(await page.locator('main').innerText(),/Doy mi consentimiento/);await page.screenshot({path:join(evidenceDirectory,'locale-consent-390.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:join(evidenceDirectory,'locale-consent-1440.png'),fullPage:true});await page.setViewportSize({width:390,height:844})}
 await h.api('language.choose',employee,{language:'en'})
 await h.api('signature.act',employee,{...bound,payload:payload.id,action:'sign',consent:true})
 const signed=await h.api('signature-requests/'+id,employee)
 assert.equal(signed.certificate.language,'es-US');assert.equal(signed.certificate.signers[0].consent,payload.consent)
 const sealed=await h.raw('/app/files/document/'+signed.sealedVersion,{cookie:employee})
 assert.equal(createHash('sha256').update(Buffer.from(await sealed.arrayBuffer())).digest('hex'),signed.certificate.sha256)
 await h.api('language.choose',employee,{language:'es-US'})
 const signatureList=await html('/app/signatures',employee);assert.match(signatureList,/Firmado/);assert.match(signatureList,/Safety agreement[\s\S]*Sin traducción/)
 if(page){await page.goto(h.origin+'/app/clock');await page.getByRole('button',{name:'Registrar entrada',exact:true}).click();await page.waitForURL('**/app/clock?notice=*')}
 else await h.api('clock.punch',employee,{kind:'in',revision:0})
 let clock=await h.api('clock',employee);assert.equal(clock.state,'in')
 await h.api('clock.punch',employee,{kind:'in',revision:0},409)
 for(const kind of ['break','resume','out']){clock=await h.api('clock',employee);await h.api('clock.punch',employee,{kind,revision:clock.revision})}
 if(page)await capture(page,'/app/clock','clock')
 const workflow=await publishTemplate(h,owner,{name:'Employee welcome',kind:'mover',taskTitle:['Read your guide','Keep this original task'],taskAssignee:['employee','employee'],taskDueDays:['0','0']})
 const workflowSources=(await api('translations')).sources
 await translate({...workflowSources.find(x=>x.kind==='workflow'&&x.source===workflow.id),translated:'Bienvenida del empleado'})
 await translate({...workflowSources.find(x=>x.kind==='task'&&x.original==='Read your guide'),translated:'Lea su guía'})
 const moved=await api('mover.schedule',{period:s.employee.period,effectiveFrom:today,template:workflow.id,reason:'Welcome workflow'})
 const caseHtml=await html('/app/cases/'+moved.case,employee);assert.match(caseHtml,/Bienvenida del empleado/);assert.match(caseHtml,/Lea su guía/);assert.match(caseHtml,/Keep this original task[\s\S]*Sin traducción/)
 if(page)await capture(page,'/app/cases/'+moved.case,'workflow')
 await api('contractor.set',{contractor:true,covered:false})
 await h.api('language.choose',employee,{language:'en'})
 assert.match(await html('/app/eeo/self',employee),/Protected veteran invitation/)
 await h.api('eeo.self.write',employee,{hispanic:'no',races:['asian'],sex:'female',veteran:'not_protected',disability:'declined'})
 const eeoEnglish=(await h.api('eeo/self',employee)).current
 await h.api('language.choose',employee,{language:'es-US'})
 assert.match(await html('/app/eeo/self',employee),/Autoidentificación voluntaria de discapacidad/)
 const eeoSpanish=(await h.api('eeo/self',employee)).current
 for(const key of ['hispanic','races','sex','veteran','disability'])assert.deepEqual(eeoEnglish[key],eeoSpanish[key])
 if(page)await capture(page,'/app/eeo/self','employee-eeo')
 // Delivery-time language, complete fixed bodies and scheduled reminders for two recipients.
 await api('work.policy',{offsets:'0',quietStart:0,quietEnd:0,defaultDays:1})
 await h.api('language.choose',employee,{language:'en'})
 await api('work.run',{})
 assert.ok(messages.some(m=>m.subject==='Willow: assigned work needs attention'&&m.personalizations.some(p=>p.to.some(t=>t.email==='employee@example.com'))))
 const spanWork=await publishTemplate(h,owner,{name:'Second welcome',kind:'mover',taskTitle:['PRIVATE-TASK-CANARY'],taskAssignee:['employee'],taskDueDays:['0']})
 const originalWorkflow=await api('mover.schedule',{period:s.employee.period,effectiveFrom:day(1),template:spanWork.id,reason:'PRIVATE-REASON-CANARY'})
 const originalTask=(await api('cases/'+originalWorkflow.case)).tasks[0];const scheduled=(await api('work')).items.find(w=>w.source==='task:'+originalTask.id)
 await api('work.schedule',{source:scheduled.source,revision:scheduled.revision,owner:s.employee.member,dueDate:today,nextAction:'Open private case'})
 await h.api('language.choose',employee,{language:'es-US'})
 assert.match(await html('/app/cases/'+originalWorkflow.case,employee),/Second welcome[\s\S]*Sin traducción/)
 await api('work.run',{})
 const reminder=messages.findLast(m=>m.subject==='Willow: hay trabajo asignado que requiere atención'&&m.personalizations.some(p=>p.to.some(t=>t.email==='employee@example.com')))
 assert.ok(reminder);assert.ok(!JSON.stringify(reminder).includes('PRIVATE-'));assert.ok(!JSON.stringify(reminder).includes('assigned work'))
 assert.ok(pushes.some(p=>p.title==='Update ready'));assert.ok(pushes.some(p=>p.title==='Actualización disponible'))
 // The same display choice governs survey questions and official-form decisions.
 const untranslatedTemplate=await api('signature.template',{source:source.versionId,title:'Original agreement',coverText:'Original cover text',category:category.id,signers:['employee'],fields:[{signer:0,kind:'signature',page:1,x:.1,y:.4,width:.7,height:.08}]})
 const originalTemplate=(await api('signature-templates')).find(t=>t.id===untranslatedTemplate.id)
 await api('signature.template.approve',{template:originalTemplate.id,digest:originalTemplate.digest,reviewed:true})
 const originalReview=await api('signature.preview',{template:originalTemplate.id,people:[s.employee.person],hr:s.hr.member,expiresAt:Date.now()+86400000})
 const originalSend=await api('signature.send',{review:originalReview.id,digest:originalReview.digest,approved:true})
 const originalCover=await html('/app/signatures/'+originalSend.requests[0],employee);assert.match(originalCover,/Original cover text[\s\S]*Sin traducción/)
 if(page)await capture(page,'/app/signatures/'+originalSend.requests[0],'original-cover')
 const survey=await api('survey.create',{name:'Shift preferences',kind:'pulse',mode:'named',questions:[{key:'shift',label:'Preferred shift',type:'choice',options:['Morning','Evening']}],members:[s.employee.member],deliveryDate:today,dueDate:day(7)})
 const surveySources=(await api('translations')).sources.filter(x=>x.source===survey.id)
 for(const [original,translated] of [['Shift preferences','Preferencias de turno'],['Preferred shift','Turno preferido'],['Morning','Mañana'],['Evening','Tarde']])await translate({...surveySources.find(x=>x.original===original),translated})
 assert.match(await html('/app/surveys/'+survey.id,employee),/Turno preferido/);assert.ok(!((await html('/app/surveys',employee)).includes('>named<')))
 const fallbackSurvey=await api('survey.create',{name:'Original survey',kind:'pulse',mode:'named',questions:[{key:'original',label:'Original question',type:'choice',options:['Original option','Other option']}],members:[s.employee.member],deliveryDate:today,dueDate:day(7)})
 const fallbackHtml=await html('/app/surveys/'+fallbackSurvey.id,employee);assert.match(fallbackHtml,/Original question[^<]*Sin traducción/);assert.match(fallbackHtml,/Original option[^<]*Sin traducción/)
 if(page){await capture(page,'/app/surveys/'+survey.id,'survey');await page.getByLabel('Turno preferido').selectOption('Morning');await page.getByRole('button',{name:'Enviar respuesta',exact:true}).click()}
 else await h.api('survey.respond',employee,{survey:survey.id,answers:{shift:'Morning'}})
 assert.equal((await api('surveys/'+survey.id+'/results')).namedAnswers[0].answers.shift,'Morning')
 const forms=await html('/app/official-forms',employee)
 assert.match(forms,/fw4sp\.pdf/);assert.match(forms,/href="[^"]+\/i-9\.pdf"/);assert.match(forms,/solo de referencia/)
 const puertoRico=await html('/app/official-forms?jurisdiction=PR',employee);assert.match(puertoRico,/solo para completar en Puerto Rico/)
 if(page)await capture(page,'/app/official-forms','official-forms')
 // A new source version never inherits an older announcement translation.
 await api('company.announce',{id:announcement.id,title:'Revised safety update',body:'Read the revised safety guide.',startsOn:today,audience:{kind:'everyone',id:null}})
 const revised=await html('/app',employee);assert.match(revised,/Revised safety update[\s\S]*Sin traducción/);assert.ok(!revised.includes('Aviso de seguridad'))

 const valuesSpanish=(await h.api('people/'+s.employee.person,employee)).customFields.fields.map(x=>[x.key,x.value])
 await h.api('language.choose',employee,{language:'en'})
 const valuesEnglish=(await h.api('people/'+s.employee.person,employee)).customFields.fields.map(x=>[x.key,x.value])
 assert.deepEqual(valuesEnglish,valuesSpanish)
 const englishReport=await api('custom-reports/'+report.id)
 const reportBytes=async(format,cookie)=>Buffer.from(await(await h.raw('/app/reports/custom/'+report.id+'.'+format,{cookie})).arrayBuffer())
 const englishCsv=(await reportBytes('csv',owner)).toString(),englishXlsx=readZip(await reportBytes('xlsx',owner))
 const exportPath='/app/exports/employees'
 const bundlePath='/app/exports/employees.zip?scope=organization&fields=name,custom.shirt&history=employment'
 const download=async(path,cookie=owner)=>{const response=await h.raw(path,{cookie});assert.equal(response.status,200,path);return Buffer.from(await response.arrayBuffer())}
 const englishBundle=readZip(await download(bundlePath))
 const employeeExportPath='/app/exports/employees.csv?scope=organization&fields=name,phone,payAmount,custom.shirt'
 const employeeRawEnglish=(await download(employeeExportPath,s.hr.cookie)).toString()


 await h.api('language.choose',owner,{language:'es-US'})
 const localizedReport=await api('custom-reports/'+report.id),spanishReportCsv=await(await h.raw('/app/reports/custom/'+report.id+'.csv',{cookie:owner})).text()
 assert.ok(spanishReportCsv.includes('Talla de camisa'));assert.ok(spanishReportCsv.includes('Pequeña'));assert.ok(englishCsv.includes('Shirt size'));
 const spanishBundle=readZip(await download(bundlePath));assert.equal(spanishBundle.get('employees.csv').toString(),englishBundle.get('employees.csv').toString());assert.deepEqual(JSON.parse(spanishBundle.get('records.json')),JSON.parse(englishBundle.get('records.json')));assert.match(spanishBundle.get('display-labels.csv').toString(),/Talla de camisa/);
 await h.api('language.choose',s.hr.cookie,{language:'es-US'});assert.equal((await download(employeeExportPath,s.hr.cookie)).toString(),employeeRawEnglish);assert.match((await download(employeeExportPath+'&labels=display',s.hr.cookie)).toString(),/Talla de camisa/);
 const spanishXlsx=readZip(await reportBytes('xlsx',owner));assert.match(spanishXlsx.get('xl/worksheets/sheet1.xml').toString(),/Talla de camisa/);assert.match(spanishXlsx.get('xl/worksheets/sheet1.xml').toString(),/Pequeña/);
 const sheetRows=files=>[...files.get('xl/worksheets/sheet1.xml').toString().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(r=>[...r[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>|<v>([^<]*)<\/v>/g)].map(c=>c[1]??c[2]))
 const englishRows=sheetRows(englishXlsx),spanishRows=sheetRows(spanishXlsx)
 assert.equal(englishRows.length,spanishRows.length)
 for(let i=4;i<4+englishReport.result.rows.length;i++)assert.deepEqual(spanishRows[i].slice(0,2),englishRows[i].slice(0,2),'XLSX name and numeric values unchanged')
 assert.ok(spanishReportCsv.includes('Nombre'));assert.ok(!spanishReportCsv.includes('employee@example.com'))
 assert.deepEqual(localizedReport.result.totals,englishReport.result.totals);assert.deepEqual(localizedReport.result.rows.map(r=>r.cells),englishReport.result.rows.map(r=>r.cells))
 await h.api('language.choose',owner,{language:'en'})
 // Sign-in carries a display choice without granting a session.
 const signInChoice=await h.raw('/signin?language=es-US')
 assert.equal(signInChoice.status,303)
 const signInCookie=signInChoice.headers.get('set-cookie').split(';')[0]
 assert.match(await html('/signin',signInCookie),/Enviar enlace para iniciar sesión/)
 if(browser){const authContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});await authContext.addCookies(cookies(signInCookie));const authPage=await authContext.newPage();await capture(authPage,'/signin','signin');await authContext.close();const hrContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});await hrContext.addCookies(cookies(owner));const hrPage=await hrContext.newPage();await capture(hrPage,'/app/translations','translations');await hrContext.close()}
 await context?.close()
 console.log('PASS LOCALE-001 employee: translation → Spanish PTO and private notice → exact consent certificate → clock → invariant values/totals')
 // Journey 2: invitation identity chooses Spanish, submits EEO and signs; public applicant chooses independently.
 await api('contractor.set',{contractor:true,covered:false})
 const packet=await api('preboarding.send',{name:'Nueva Persona',email:'newhire@example.com'}),link=invitations.get('newhire@example.com')
 assert.ok(link)
 const portal=async(path,body,status=200)=>{const r=await fetch(h.origin+path,{method:body?'POST':'GET',redirect:'manual',headers:{accept:'application/json',...(body?{'content-type':'application/json',origin:h.origin}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();assert.equal(r.status,status,text.slice(0,400));return text?JSON.parse(text):null}
 const path=new URL(link).pathname
 await portal(path,{localeAction:'choose',language:'es-US'},303)
 let candidate=await portal(path);assert.equal(candidate.language,'es-US')
 assert.match(await html(path),/Autoidentificación voluntaria/);const contractor=await html(path);assert.match(contractor,/Autoidentificación voluntaria de discapacidad/);assert.match(contractor,/Invitación para autoidentificarse como veterano protegido/);assert.ok(!contractor.includes('This employer is a Government contractor'))
 await portal(path,{hispanic:'no',races:['asian'],sex:'female'})
 candidate=await portal(path);assert.equal(candidate.current.hispanic,'no');assert.deepEqual(candidate.current.races,['asian'])
 await portal(path,{localeAction:'sign',name:'Nueva Persona',consent:true})
 candidate=await portal(path);assert.equal(candidate.signature.language,'es-US');assert.match(candidate.signature.certificate.consent,/Doy mi consentimiento/)
 const receipt=await fetch(h.origin+path+'?document=signed');assert.equal(createHash('sha256').update(Buffer.from(await receipt.arrayBuffer())).digest('hex'),candidate.signature.certificate.sha256)
 const candidateContext=browser?await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}):null,candidatePage=candidateContext?await candidateContext.newPage():null
 if(candidatePage){await capture(candidatePage,path,'preboarding');assert.match(await candidatePage.locator('main').innerText(),/Se registró su firma/)}
 const opening=await api('hiring.opening',{name:'Service associate',stages:['New','Offer','Rejected'],members:[s.hr.member]})
 await api('career.publish',{opening:opening.id,description:'Help our customers.',active:true})
 const careers=await api('translations')
 for(const [field,translated] of [['name','Atención al cliente'],['description','Ayude a nuestros clientes.']])await translate({...careers.sources.find(x=>x.kind==='career'&&x.source===opening.id&&x.field===field),translated})
 const careerPath='/careers/'+opening.id
 const choose=await h.raw(careerPath,{form:new URLSearchParams({localeAction:'choose',language:'es-US'})});assert.equal(choose.status,303)
 const displayCookie=choose.headers.get('set-cookie').split(';')[0]
 assert.match(await html(careerPath,displayCookie),/Atención al cliente/)
 const application=await h.raw(careerPath,{cookie:displayCookie,form:new URLSearchParams({opening:opening.id,revision:'1',name:'Solicitante',email:'candidate@example.com'})});assert.equal(application.status,200);assert.match(await application.text(),/Solicitud de empleo enviada/)
 const candidateLink=invitations.get('candidate@example.com');assert.ok(candidateLink)
 const candidatePath=new URL(candidateLink).pathname;assert.equal((await portal(candidatePath)).language,'es-US')
 const invitationMail=messages.findLast(m=>m.subject==='Willow: invitación de autoidentificación voluntaria');assert.ok(invitationMail);assert.ok(!JSON.stringify(invitationMail).includes('Your answers are separate'));
 await portal(candidatePath,{hispanic:'declined',races:['declined'],sex:'declined'})
 assert.equal((await portal(candidatePath)).current.hispanic,'declined')
 if(candidatePage){await capture(candidatePage,candidatePath,'candidate-eeo');await candidatePage.context().addCookies([{name:'wl_language',value:'es-US',url:h.origin+'/careers'}]);await capture(candidatePage,careerPath,'careers')}
 // A later invitation resolves the candidate's current language at send time.
 await portal(candidatePath,{localeAction:'choose',language:'en'},303)
 const englishInvite=await api('hiring.selfId.invite',{application:(await portal(candidatePath)).application.id,phase:'pre-offer'})
 const englishInvitationMail=messages.findLast(m=>m.subject==='Willow: voluntary self-identification invitation'&&m.personalizations.some(p=>p.to.some(t=>t.email==='candidate@example.com')))
 assert.ok(englishInvitationMail);assert.match(JSON.stringify(englishInvitationMail),/This invitation expires in 14 days/);assert.ok(!JSON.stringify(englishInvitationMail).includes('Solicitante'))
 await portal(candidatePath,undefined,404)
 await api('preboarding.withdraw',{packet:packet.id});await portal(path,undefined,404)
 await portal(path,{localeAction:'choose',language:'en'},404)
 assert.equal((await h.raw('/api/willow/me')).status,401)
 await candidateContext?.close()
 // Full recorded edge bodies support review without publishing bearer links or device tokens.
 const fixedMail=[...new Map(messages.filter(m=>m.subject.startsWith('Willow:')).map(m=>{const value={subject:m.subject,content:m.content.map(c=>({type:c.type,value:c.value.replace(/https?:[^\s"<>]+/g,'[authenticated link]')}))};return [JSON.stringify(value),value]})).values()]
 await writeFile(join(evidenceDirectory,'locale-delivery.json'),JSON.stringify({mail:fixedMail,push:[...new Map(pushes.map(p=>{const value={title:p.title,body:p.body,data:p.data};return [JSON.stringify(value),value]})).values()]},null,2)+'\n')
 console.log('PASS LOCALE-001 candidate: independent language → EEO → Spanish signed receipt → careers submission and separate EEO → withdrawal')
} finally {await browser?.close();await h.close()}
