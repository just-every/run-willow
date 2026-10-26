import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

// The held org is injected by the owner helper. Only this run's generated users
// and groups are ever mutated or removed. Responses and credentials stay private.
export async function liveOkta() {
 const origin = new URL(process.env.OKTA_ORG_URL).origin, token = process.env.OKTA_API_TOKEN
 assert.ok(token && /^https:\/\/integrator-[0-9]+\.okta\.com$/.test(origin),'Held Integrator org required')
 const users = [], groups = [], password = randomBytes(24).toString('base64url')+'aA1!'
 const call = async (path,method='GET',body,status=200) => {
  const response = await fetch(origin+path,{method,redirect:'manual',headers:{authorization:`SSWS ${token}`,'content-type':'application/json',accept:'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  assert.equal(response.status,status,`Okta sandbox ${method} ${path.split('?')[0]} returned ${response.status}`)
  const text=await response.text();return text?JSON.parse(text):null
 }
 return { bindings:{OKTA_ORG_URL:origin,OKTA_API_TOKEN:token},
  async group(name) {const group=await call('/api/v1/groups','POST',{profile:{name,description:'Disposable Willow identity journey'}});groups.push(group.id);return group.id},
  async account(email) {const user=await call('/api/v1/users?activate=false','POST',{profile:{firstName:'Maya',lastName:'Chen',email,login:email},credentials:{password:{value:password}}});users.push(user.id);return user.id},
  async session(account,email) {
   const auth=await call('/api/v1/authn','POST',{username:email,password,options:{multiOptionalFactorEnroll:false,warnBeforePasswordExpired:false}})
   assert.equal(auth.status,'SUCCESS','Sandbox test user needs an authentication policy that permits this active-session trial')
   assert.ok(auth.sessionToken)
   const session=await call('/api/v1/sessions','POST',{sessionToken:auth.sessionToken})
   await call(`/api/v1/sessions/${session.id}`)
   return async()=>{await call(`/api/v1/sessions/${session.id}`,'GET',undefined,404)}
  },
  fetch:async request=>{
   if(new URL(request.url).hostname==='api.sendgrid.com')return new Response(null,{status:202})
   // Miniflare supplies its own Request implementation. Forward the wire
   // values explicitly to Node's native fetch; do not cast a foreign Request.
   const headers=new Headers()
   for(const name of ['authorization','accept','content-type'])if(request.headers.has(name))headers.set(name,request.headers.get(name))
   const body=['GET','HEAD'].includes(request.method)?null:await request.arrayBuffer()
   const response=await fetch(request.url,{method:request.method,headers,redirect:'manual',...(body?.byteLength?{body}:{})})
   if(!response.ok)console.log(`Okta sandbox edge ${request.method} ${new URL(request.url).pathname}: ${response.status}`)
   return response
  },
  async close() {
   const results=[]
   for (const id of users.reverse()) {
    try {const user=await call(`/api/v1/users/${id}`);if(user.status!=='DEPROVISIONED')await call(`/api/v1/users/${id}/lifecycle/deactivate?sendEmail=false`,'POST',undefined,200);await call(`/api/v1/users/${id}`,'DELETE',undefined,204)}catch(error){results.push(error)}
   }
   for (const id of groups.reverse()) {try{await call(`/api/v1/groups/${id}`,'DELETE',undefined,204)}catch(error){results.push(error)}}
   assert.equal(results.length,0,'All per-seed Okta sandbox objects were cleaned up')
   console.log('Okta sandbox cleanup: PASS')
  } }
}
