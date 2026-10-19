// SELF-002: native forms, targeted home, downloads, receipts and consent at both widths.
import assert from 'node:assert/strict'
import { mkdir,readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
export async function browserEvidence(h,owner,s) {
 if(process.env.WILLOW_COMPANY_BROWSER!=='1')return
 const destination=process.env.WILLOW_EVIDENCE_DIR;assert.ok(destination);await mkdir(destination,{recursive:true})
 assert.ok(process.platform!=='darwin'||process.env.WILLOW_PLAYWRIGHT_PATH,'Mac browser requires current Playwright')
 const {chromium}=await import(process.env.WILLOW_PLAYWRIGHT_PATH?pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href:'@playwright/test')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const api=(path,body,status=200)=>h.api(path,owner,body,status),date=(await api('me')).today
 const next=d=>new Date(Date.parse(date)+d*86400000).toISOString().slice(0,10)
 const look=await api('settings'),findLocation=async name=>look.locations.find(l=>l.name===name)??await api('location.create',{name,timezone:'America/Chicago'})
 const inside=await findLocation('Austin'),outside=await findLocation('San Francisco')
 for(const [staff,location]of [[s.employee,inside],[s.managerb,outside]]){
  const p=await api(`people/${staff.person}`)
  if(p.current?.location?.id!==location.id)await api('mover.schedule',{period:staff.period,effectiveFrom:date,locationId:location.id,reason:'Office assignment'})
 }
 const seq=(await api('company-admin')).announcements.length+1
 const generalTitle=`Team gathering ${seq}`,localTitle=`Austin workshop ${seq}`,handbookName=`People handbook ${seq}`,localFolderName=`Austin office guide ${seq}`
 const contexts=[]
 const enter=async(cookie)=>{const c=await browser.newContext();contexts.push(c);await c.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin})));return c.newPage()}
 const capture=async(page,path,name,width)=>{
  await page.setViewportSize({width,height:1000});assert.equal((await page.goto(h.origin+path)).status(),200);await page.evaluate(()=>document.fonts.ready)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`SELF-002 ${name} fits ${width}`)
  await page.screenshot({path:`${destination}/SELF-002-${name}-${width}.png`,fullPage:true})
 }
 const saved=async page=>{await page.waitForURL(/notice=/);assert.ok(!new URL(page.url()).searchParams.has('error'))}
 try{
  const hr=await enter(s.hr.cookie)
  for(const [title,audience,body]of [[generalTitle,{kind:'everyone',id:null},'Join us on Friday to hear the next quarter plans and welcome our new colleagues.'],[localTitle,{kind:'location',id:inside.id},'The Austin office workshop starts at 10 am. Please bring your team questions.']]){
   await hr.goto(h.origin+'/app/company');const f=hr.locator('form[action="/app/do/company.announce"]').last()
   await f.getByLabel('Title',{exact:true}).fill(title);await f.getByLabel('Announcement',{exact:true}).fill(body)
   await f.getByLabel('Starts on (employer time zone)',{exact:true}).fill(date);await f.getByLabel('Ends on (inclusive, optional)',{exact:true}).fill(next(14));await f.getByLabel('Audience',{exact:true}).selectOption(JSON.stringify(audience))
   await f.getByLabel('Pin announcement',{exact:true}).check();await f.getByLabel('Request read acknowledgment',{exact:true}).check()
   for(const width of [1440,390]){await hr.setViewportSize({width,height:1000});await f.screenshot({path:`${destination}/SELF-002-publish-${audience.kind}-${width}.png`})}
   await f.getByRole('button',{name:'Publish announcement',exact:true}).click();await saved(hr)
  }
  for(const [name,audience]of [[handbookName,{kind:'everyone',id:null}],[localFolderName,{kind:'location',id:inside.id}]]){
   const f=hr.locator('form[action="/app/do/company.folder"]').last();await f.getByLabel('Folder name',{exact:true}).fill(name);await f.getByLabel('Audience',{exact:true}).selectOption(JSON.stringify(audience));await f.getByRole('button',{name:'Create shared folder',exact:true}).click();await saved(hr)
  }
  const admin=await api('company-admin'),generalFolder=admin.folders.find(f=>f.name===handbookName),localFolder=admin.folders.find(f=>f.name===localFolderName)
  let generalFile
  for(const [folder,title,text,revise]of [[generalFolder,'Employee handbook','Handbook 2026: working together and asking for help.',false],[generalFolder,'Employee handbook','Handbook 2026 revised: working together, time off and asking for help.',true],[localFolder,'Office guide','Austin office: building access, meeting rooms and local contacts.',false]]){
   const f=hr.locator('form[action="/app/do/company.file"]');await f.getByLabel('Folder',{exact:true}).selectOption(folder.id)
   await f.getByLabel('File title',{exact:true}).fill(title);if(revise)await f.getByLabel('File to revise (optional)',{exact:true}).selectOption(generalFile)
   await f.getByLabel('File (up to 10 MB)',{exact:true}).setInputFiles({name:folder.id===generalFolder.id?'handbook-2026.txt':'austin-office.txt',mimeType:'text/plain',buffer:Buffer.from(text)})
   await f.getByRole('button',{name:'Publish file version',exact:true}).click();await saved(hr)
   if(folder.id===generalFolder.id)generalFile=(await api('company-admin')).folders.find(f=>f.id===generalFolder.id).files[0].id
  }
  // The birthday remains a private profile field; only self publishes its month/day.
  const employee=await enter(s.employee.cookie);await employee.goto(h.origin+`/app/people/${s.employee.person}`)
  await employee.getByText('Edit private details',{exact:true}).click()
  const privateForm=employee.locator('form[action="/app/do/person.update"]').filter({has:employee.locator('input[name="private"]')})
  await privateForm.locator('[name="date_of_birth"]').fill('1990'+date.slice(4));await privateForm.getByRole('button',{name:'Save private details',exact:true}).click();await saved(employee)
  await employee.goto(h.origin+'/app');const prefs=employee.locator('form[action="/app/do/company.celebrations"]');await prefs.getByLabel('Share my birthday month and day',{exact:true}).check();await prefs.getByRole('button',{name:'Save celebration preferences',exact:true}).click();await saved(employee)
  const home=await h.api('company',s.employee.cookie),localPublication=home.announcements.find(a=>a.title===localTitle),generalPublication=home.announcements.find(a=>a.title===generalTitle)
  assert.ok(localPublication&&generalPublication)
  const version=home.folders.find(f=>f.id===generalFolder.id).files[0].versions[0]
  const receipt=employee.locator('form[action="/app/do/company.acknowledge"]').filter({has:employee.locator(`input[value="${generalPublication.versionId}"]`)})
  await receipt.getByRole('button',{name:'Acknowledge reading',exact:true}).click();await saved(employee)
  assert.ok((await h.api('company',s.employee.cookie)).announcements.find(a=>a.id===generalPublication.id).acknowledgedAt)
  for(const width of [1440,390]){
   await capture(employee,'/app','inside-home',width)
   const [download]=await Promise.all([employee.waitForEvent('download'),employee.locator(`a[href="/app/company/files/${version.id}"]`).click()])
   assert.equal(await download.failure(),null);assert.equal((await readFile(await download.path())).toString(),'Handbook 2026 revised: working together, time off and asking for help.')
  }
  const other=await enter(s.managerb.cookie),manager=await enter(s.managera.cookie)
  for(const width of [1440,390]){
   await capture(other,'/app','outside-home',width);assert.ok(!(await other.content()).includes(localTitle));assert.ok(!(await other.content()).includes(localFolderName));assert.ok(!(await other.content()).includes('1990'+date.slice(4)))
   await capture(manager,'/app','manager-home',width);await capture(hr,'/app/company','admin',width)
  }
  await employee.goto(h.origin+'/app');await employee.getByLabel('Share my birthday month and day',{exact:true}).uncheck();await employee.getByRole('button',{name:'Save celebration preferences',exact:true}).click();await saved(employee)
  assert.ok(!(await h.api('company',s.managerb.cookie)).celebrations.some(c=>c.person===s.employee.person),'SELF-002 form withdrawal hides the celebration immediately')
  for(const width of [1440,390])await capture(employee,'/app','withdrawn-home',width)
 }finally{for(const c of contexts)await c.close();await browser.close()}
}
