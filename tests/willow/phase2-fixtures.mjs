// Provider-edge fixtures only. All people, keys and completions here are invented.
import { generateKeyPairSync, sign } from 'node:crypto'
export const genericColumns = ['provider_employee_id','employee_number','name','change','effective_date','end_date','units','unit','field','from','to','note'].map(source => ({source,heading:source}))
export function providerFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {modulusLength:2048})
  const jwk = {...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'}
  const edge = { mode:'valid', mail:'accepted', oidc:'valid', email:'employee@example.test', nonce:'', calls:[], messages:[] }
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
  edge.fetch = async request => {
    const url = new URL(request.url)
    if (url.hostname === 'models.example.test') {
      const body = await request.json(); edge.calls.push({body,headers:Object.fromEntries(request.headers)})
      if (edge.mode === 'redirect') return new Response(null,{status:302,headers:{location:'https://must-not-receive-credentials.example.test/'}})
      if (edge.mode === 'failed') return json({error:'PRIVATE-PROVIDER-ERROR'},503)
      const context = JSON.parse(body.messages[1].content)
      const content = edge.mode === 'invalid' ? 'invalid-json' : JSON.stringify({ source:{id:edge.mode==='uncited'?'invented':context.id,version:context.version}, items:context.tasks.map(t=>({position:t.position,text:`${t.assignee} reviews the task at day ${t.due_offset_days}; ${t.evidence_required?'record evidence before completion':'confirm completion in Willow'}.`})) })
      return json({choices:[{message:{content}}]})
    }
    if (url.hostname === 'api.sendgrid.com') {
      edge.messages.push(await request.json())
      return edge.mail === 'accepted' ? new Response(null,{status:202,headers:{'x-message-id':'fixture-message'}}) : json({error:'PRIVATE-PROVIDER-ERROR'},edge.mail==='refused'?403:500)
    }
    if (url.hostname === 'accounts.google.com') {
      return json({issuer:'https://accounts.google.com',authorization_endpoint:'https://accounts.google.com/authorize',token_endpoint:'https://oauth2.googleapis.com/token',jwks_uri:'https://www.googleapis.com/keys',id_token_signing_alg_values_supported:['RS256'],response_types_supported:['code'],token_endpoint_auth_methods_supported:['client_secret_basic']})
    }
    if (url.hostname === 'www.googleapis.com') return json({keys:[jwk]})
    if (url.hostname === 'oauth2.googleapis.com') {
      // Discovery can stay reachable while the provider refuses this client's token access.
      if (['unavailable','token-error'].includes(edge.oidc)) return json({error:'unauthorized_client',error_description:'PRIVATE-PROVIDER-ERROR'},edge.oidc === 'token-error' ? 200 : 403)
      const clientId=Buffer.from(request.headers.get('authorization').slice('Basic '.length),'base64').toString('utf8').split(':')[0]
      const t = Math.floor(Date.now()/1000)
      const claims = {iss:edge.oidc==='issuer'?'https://attacker.example':'https://accounts.google.com',sub:edge.email,aud:edge.oidc==='audience'?'other-client':clientId,iat:t,exp:t+300,nonce:edge.nonce,email:edge.email,email_verified:edge.oidc!=='unverified',hd:'example.test',groups:['owner'],role:'owner'}
      const header = Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url')
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
      const value = `${header}.${payload}`
      const signature = sign('RSA-SHA256',Buffer.from(value),privateKey).toString('base64url')
      return json({id_token:`${value}.${signature}`,token_type:'Bearer',access_token:'unused-test-access-token'})
    }
    throw new Error(`Unexpected provider request to ${url.hostname}`)
  }
  return edge
}
export const oidcProviders = [{id:'google',preset:'google',clientId:'willow-test',clientSecret:'test-client-secret',tokenAuthMethod:'client_secret_basic'}]
