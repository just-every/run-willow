import assert from 'node:assert/strict'

export function oktaEdge() {
 const users = new Map(), groups = new Map(), calls = []
 const edge = {users,groups,calls,failNext:false,lag:false,afterWrite:null}
 const json = (value,status=200) => Response.json(value,{status})
 edge.fetch = async request => {
  const url = new URL(request.url), method = request.method, path = url.pathname
  if (url.hostname === 'api.sendgrid.com') return new Response(null,{status:202})
  assert.equal(url.origin,'https://synthetic-willow-900.okta.com')
  assert.equal(request.headers.get('authorization'),'SSWS synthetic-willow-901')
  calls.push({method,path})
  if (edge.failNext && method !== 'GET') {edge.failNext=false;return json({error:'synthetic-willow-902'},503)}
  const [,kind,id,action] = path.match(/^\/api\/v1\/(users|groups)\/([^/]+)(.*)$/) ?? []
  if (kind === 'groups') {
   const group = groups.get(id)
   if (!group) return json({},404)
   if (!action) return json({id,type:'OKTA_GROUP',profile:{name:group}})
   const user = users.get(action.split('/').at(-1))
   assert.ok(user)
   if (!edge.lag) {if(method==='PUT')user.groups.add(id);else if(method==='DELETE')user.groups.delete(id);else assert.fail('Unexpected membership method')}
  } else if (kind === 'users') {
   const user = users.get(id)
   if (!user) return json({},404)
   if (method === 'GET') {
    if (!action) return json({id,status:user.status,profile:user.profile})
    if (action === '/groups') return json([...user.groups].map(id=>({id,type:'OKTA_GROUP',profile:{name:groups.get(id)}})))
    if (action === '/appLinks') return json(user.apps ?? [])
    assert.fail('Unexpected Okta read')
   }
   if (!edge.lag) {
    if (!action && method === 'POST') Object.assign(user.profile,(await request.json()).profile)
    else if (action === '/lifecycle/suspend') user.status='SUSPENDED'
    else if (['/lifecycle/activate','/lifecycle/unsuspend'].includes(action)) user.status='ACTIVE'
    else if (action === '/sessions' && method === 'DELETE') {assert.equal(url.searchParams.get('oauthTokens'),'true');user.session=false}
    else assert.fail('Unexpected Okta write')
   }
  } else assert.fail('Unexpected provider path')
  if (edge.afterWrite) {const callback=edge.afterWrite;edge.afterWrite=null;await callback()}
  return new Response(null,{status:204})
 }
 edge.account = (id,email) => users.set(id,{profile:{email,login:email,displayName:'Maya Chen',title:'Before',department:''},status:'STAGED',groups:new Set(),session:false})
 return edge
}
