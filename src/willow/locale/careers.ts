// Public applications contain contact data, never verified identity or hiring authority.
import type { Bindings } from '../../auth.server'
import { actorFor,requirePermission,type Actor } from '../actor'
import { all,commit,guard,insist,newId,now,one,sha256Hex,WillowError } from '../core'
import { stmt } from '../core'
import { Input } from '../input'
import { inviteApplicant } from '../eeo-applicants/invitations'
import { authorityGuard } from '../preboarding/store'
import { inLocale,normalizeLanguage,msg,errorMessage } from './runtime'
import { languageStatement,translationData } from './store'
import { CAREER_DOORS,match } from '../doors'
import { h,page,field,area,form,hidden,select,content } from '../ui/html'
export async function publishCareer(env:Bindings,actor:Actor,input:Input) {
 requirePermission(actor,'people.manage')
 input.only(['opening','description','active','returnTo'])
 const id=input.text('opening',{max:100}),description=input.text('description',{max:20000})
 const row=await one(env,'SELECT revision FROM wl_hiring_openings WHERE id=?',id);insist(row,'not_found',404)
 await commit(env,[authorityGuard(env,actor,'people.manage'),guard(env,'stale','EXISTS(SELECT 1 FROM wl_hiring_openings WHERE id=? AND revision=?)',id,row.revision),stmt(env,'INSERT INTO wl_career_publications VALUES(?,?,?,?,?) ON CONFLICT(opening_id) DO UPDATE SET description=excluded.description,published_by=excluded.published_by,revision=wl_career_publications.revision+1,active=excluded.active',id,description,actor.id,1,+input.flag('active'))],{actor:actor.id,action:'career.publish',subject:id})
 return {id}
}
export async function careerResponse(env:Bindings,request:Request,url:URL):Promise<Response|null> {
 if(!match(CAREER_DOORS,url.pathname))return null
 const saved=request.headers.get('cookie')?.match(/(?:^|;\s*)wl_language=([^;]+)/)?.[1]
 const language=normalizeLanguage(saved??request.headers.get('accept-language')??'en')
 return inLocale({language,translations:await translationData(env),path:url.pathname,invitation:true},async()=>{
  try {
   insist(['GET','HEAD','POST'].includes(request.method),'method_not_allowed',405)
   if(request.method==='POST') {
    insist(request.headers.get('origin')===env.AUTH_ORIGIN,'invalid_origin',403)
    const input=await Input.from(request)
    if(input.text('localeAction',{optional:true})==='choose') {
     input.only(['localeAction','language'])
     const value=normalizeLanguage(input.text('language'))
     return new Response(null,{status:303,headers:{location:url.pathname,'set-cookie':'wl_language='+value+'; Path=/careers; HttpOnly; Secure; SameSite=Lax','cache-control':'no-store'}})
    }
    input.only(['opening','revision','name','email'])
    const window=Math.floor(now()/3600000),rateKey='careers:'+await sha256Hex(request.headers.get('cf-connecting-ip')??'unknown')
    await stmt(env,'INSERT INTO oa_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN oa_limits.window=excluded.window THEN oa_limits.count+1 ELSE 1 END',rateKey,window).run()
    insist((await one(env,'SELECT count FROM oa_limits WHERE key=?',rateKey))!.count<=10,'too_many_applications',429)

    const job=await one(env,'SELECT p.*,o.name,o.stages FROM wl_career_publications p JOIN wl_hiring_openings o ON o.id=p.opening_id WHERE p.opening_id=? AND p.active=1',input.text('opening'))
    insist(job&&job.revision===input.integer('revision'),'not_found',404)
    const name=input.text('name',{max:200}),email=input.text('email',{max:254}).toLowerCase(),id=newId(),stage=JSON.parse(job.stages)[0]
    insist(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email),'invalid_email')
    await commit(env,[guard(env,'stale','EXISTS(SELECT 1 FROM wl_career_publications WHERE opening_id=? AND revision=? AND active=1)',job.opening_id,job.revision),stmt(env,'INSERT INTO wl_hiring_applications(id,opening_id,name,contact_email,source,stage,created_at) VALUES(?,?,?,?,?,?,?)',id,job.opening_id,name,email,'careers',stage,now()),languageStatement(env,'applicant',id,language)],{actor:'applicant',action:'career.application',subject:id})
    // Publication authorizes the separate voluntary invitation, with current HR rechecked.
    // A mail/authority failure cannot roll back an application that was already saved.
    let delivered=false
    try {
     const publisher=await one(env,'SELECT m.*,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.id=?',job.published_by)
     if(publisher){const actor=await actorFor(env,{id:publisher.id,email:publisher.email,name:publisher.name,owner:publisher.role==='owner',personId:publisher.person_id,sessionId:''});const invitation=await inviteApplicant(env,actor,Input.of({application:id,phase:'pre-offer'}),request);delivered=['accepted','development'].includes(invitation.delivery.status)}
    }catch{}
    return page('Application submitted',null,h`<h1>Application submitted</h1><p>Your application was saved. Contact email is not verified identity.</p><p>${msg(delivered?'A separate voluntary self-identification invitation was emailed to you.':'Ask HR for a separate voluntary self-identification invitation.')}</p><p><a href="/careers">Careers</a></p>`,{showNav:false,url})
   }
   const rows=await all(env,'SELECT p.*,o.name FROM wl_career_publications p JOIN wl_hiring_openings o ON o.id=p.opening_id WHERE p.active=1 ORDER BY o.name'),id=url.pathname.split('/')[2],job=id?rows.find(r=>r.opening_id===id):null
   insist(!id||job,'not_found',404)
   return page('Careers',null,job?h`<h1>${content('career',job.opening_id,'name',job.name)}</h1><section class="card"><p>${content('career',job.opening_id,'description',job.description)}</p><form method="post" action="${url.pathname}">${hidden('opening',job.opening_id)}${hidden('revision',job.revision)}${field('Name','name')}${field('Email','email',{type:'email'})}<button type="submit">Submit application</button></form></section>`:h`<h1>Careers</h1>${rows.length?h`<ul>${rows.map(r=>h`<li><a href="/careers/${r.opening_id}">${content('career',r.opening_id,'name',r.name)}</a></li>`)}</ul>`:h`<p>No open positions.</p>`}`,{url,showNav:false})
  }catch(error){if(!(error instanceof WillowError))throw error;return page('That did not work',null,h`<h1>That did not work</h1><p>${errorMessage(error.code)}</p><p><a href="${url.pathname}">Return to your form</a></p>`,{status:error.status,showNav:false})}
 })
}
