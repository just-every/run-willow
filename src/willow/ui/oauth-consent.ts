// Explicit installation consent uses the same bounded administrator grant as native issuance.
import type { Bindings } from '../../auth.server'
import { PERMISSION_LABELS, type Actor } from '../actor'
import { all, commit, insist } from '../core'
import { Input } from '../input'
import { levels } from '../levels/store'
import { READ_PERMISSIONS } from '../api-credentials/principal'
import { describeScope } from '../levels/scope'
import { effectiveFieldDefinitions } from '../custom-fields/store'
import { authorizeOAuth, oauthConsent, oauthScopes } from '../api-credentials/oauth'
import { h, page, field, hidden } from './html'

const path='/app/oauth/authorize'
const names=['response_type','client_id','redirect_uri','code_challenge','code_challenge_method','state','scope']
export async function oauthConsentPage(env:Bindings,actor:Actor,request:Request,url:URL) {
 const params=request.method==='POST'?new URLSearchParams(await request.text()):url.searchParams
 insist([...params.keys()].every(key=>[...names,'decision','reason'].includes(key))&&[...new Set(params.keys())].every(key=>params.getAll(key).length===1),'invalid_request')
 insist(params.get('response_type')==='code','unsupported_response_type')
 const input=Input.of({client:params.get('client_id'),redirectUri:params.get('redirect_uri'),codeChallenge:params.get('code_challenge'),codeChallengeMethod:params.get('code_challenge_method'),state:params.get('state'),reason:params.get('reason')})
 const {authority,row}=await oauthConsent(env,actor,input)
 const scope=oauthScopes(row)
 insist(!params.has('scope')||params.get('scope')!.split(' ').sort().join(' ')===scope,'invalid_scope')
 if(request.method==='POST') {
  const reason=input.text('reason',{max:400}),decision=params.get('decision')
  insist(decision==='approve'||decision==='deny','invalid_decision')
  let redirect:string
  if(decision==='approve')redirect=(await authorizeOAuth(env,actor,input)).redirectUri
  else {
   await commit(env,[authority.fence],{actor:actor.id,action:'oauth.consent.denied',subject:row.id,detail:{installer:actor.id,reason}})
   const target=new URL(row.redirect_uri!);target.searchParams.set('error','access_denied');target.searchParams.set('state',input.text('state',{max:500}));redirect=target.href
  }
  return new Response(null,{status:303,headers:{location:redirect,'cache-control':'no-store','referrer-policy':'no-referrer'}})
 }
 const level=(await levels(env,actor)).levels.find(level=>level.id===row.level_id)!
 const [locations,departments,divisions,entities,categories,fields]=await Promise.all([
  all<{id:string;name:string}>(env,'SELECT id,name FROM wl_locations'),all<{id:string;name:string}>(env,'SELECT id,name FROM wl_departments'),
  all<{id:string;name:string}>(env,'SELECT id,name FROM wl_divisions'),all<{id:string;name:string}>(env,'SELECT id,name FROM wl_legal_entities'),
  all<{id:string;name:string}>(env,'SELECT id,name FROM wl_doc_categories'),effectiveFieldDefinitions(env,actor.today),
 ])
 const nameMap=(rows:{id:string;name:string}[])=>new Map(rows.map(row=>[row.id,row.name]))
 const population=level.scope.kind==='direct'||level.scope.kind==='indirect'?'No people: apps have no reporting hierarchy':describeScope(level.scope,{locations:nameMap(locations),departments:nameMap(departments),divisions:nameMap(divisions),entities:nameMap(entities),fields:new Map(fields.map(field=>[field.id,field.label]))})
 const rights=[...level.permissions.filter(permission=>READ_PERMISSIONS.includes(permission)).map(permission=>PERMISSION_LABELS[permission]),...Object.entries(level.jobFields.others).filter(([,mode])=>mode!=='none').map(([field])=>'Job: '+field),...Object.entries(level.leaveFields.others).filter(([,mode])=>mode!=='none').map(([field])=>'Time off: '+field),...level.reports.map(report=>'Report: '+report),...Object.entries(level.compensationFields.others).filter(([,mode])=>mode!=='none').map(([field])=>'Compensation: '+field),...Object.entries(level.otherFields).filter(([,mode])=>mode!=='none').map(([field])=>'Personal: '+field),...Object.keys(level.documentCategories.others).filter(category=>level.documentCategories.others[category]!=='none').map(category=>'Document category: '+(categories.find(row=>row.id===category)?.name??'Unavailable category'))]
 const response=page('Install partner app',actor,h`<h1>Install partner app</h1><section class="card"><h2>${row.name}</h2><p>This app acts for the employer. It cannot sign in as an employee, approve work or make employment decisions.</p><dl><dt>Access level</dt><dd>${level?.name}</dd><dt>Granted scope</dt><dd>${scope}</dd><dt>Level rights</dt><dd style="overflow-wrap:anywhere">${rights.join(', ')||'Directory only'}</dd><dt>Population</dt><dd style="overflow-wrap:anywhere">${population}</dd><dt>Partner destination</dt><dd style="overflow-wrap:anywhere">${row.redirect_uri}</dd><dt>Expires</dt><dd>${new Date(row.expires_at).toISOString()}</dd></dl><p>The app receives only this level’s permitted data and population. Sensitive access still requires its independent approval.</p><form method="post" action="${path}">${names.filter(name=>params.has(name)).map(name=>hidden(name,params.get(name)!))}${field('Consent reason','reason')}<button name="decision" value="approve" type="submit">Install app</button> <button class="secondary" name="decision" value="deny" type="submit">Deny access</button></form></section>`,{current:'/app/api-credentials',url})
 // Browsers apply form policy to the redirect as well as the local POST.
 response.headers.set('content-security-policy',response.headers.get('content-security-policy')!.replace("form-action 'self'","form-action 'self' "+new URL(row.redirect_uri!).origin))
 response.headers.set('cache-control','no-store');response.headers.set('referrer-policy','same-origin')
 return response
}
