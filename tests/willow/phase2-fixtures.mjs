// Provider-edge fixtures only. All people, keys and completions here are invented.
import { generateKeyPairSync, sign } from 'node:crypto'
export const genericColumns = ['provider_employee_id','employee_number','name','change','effective_date','end_date','units','unit','field','from','to','note'].map(source => ({source,heading:source}))
export function providerFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {modulusLength:2048})
  const jwk = {...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'}
  const edge = { mode:'valid', workflowMode:'valid', mail:'accepted', oidc:'valid', email:'employee@example.com', nonce:'', enterprise:{}, calls:[], messages:[] }
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
  edge.fetch = async request => {
    const url = new URL(request.url)
    if (url.hostname === 'api.openai.com') {
      const body = await request.json(); edge.calls.push({body,headers:Object.fromEntries(request.headers)})
      assertWorkflowFeature(request)
      if (edge.workflowMode === 'failed') return json({error:'PRIVATE-PROVIDER-ERROR'},503)
      if (edge.workflowMode === 'redirect') return new Response(null,{status:302,headers:{location:'https://must-not-receive-credentials.example.test/'}})
      const output = JSON.parse(body.messages[1].content)
      if (edge.workflowMode === 'uncited') output.source.id = 'synthetic-willow-3301'
      if (edge.workflowMode === 'cycle') output.steps[0].dependencies = [2]
      if (edge.workflowMode === 'mapping') output.steps[0].connectorSource = 2
      if (edge.workflowMode === 'injected') output.steps[0].permissions = ['people.manage']
      const content = edge.workflowMode === 'invalid' ? 'invalid-json' : JSON.stringify(output)
      return json({id:'synthetic-willow-3302',usage:{prompt_tokens:100,completion_tokens:100},choices:[{message:{content}}]})
    }
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
    const enterpriseProvider = enterpriseOidcProviders.find(provider => url.origin === new URL(provider.issuer).origin)
    if (enterpriseProvider) {
      const issuer = enterpriseProvider.issuer
      if (url.href === `${issuer}/.well-known/openid-configuration`) return json({issuer,authorization_endpoint:`${issuer}/authorize`,token_endpoint:`${issuer}/token`,jwks_uri:`${issuer}/keys`,id_token_signing_alg_values_supported:['RS256'],response_types_supported:['code'],token_endpoint_auth_methods_supported:['client_secret_basic']})
      if (url.href === `${issuer}/keys`) return json({keys:[jwk]})
      if (url.href === `${issuer}/token`) {
        const clientId = Buffer.from(request.headers.get('authorization').slice('Basic '.length),'base64').toString('utf8').split(':')[0]
        const t = Math.floor(Date.now()/1000), identity = edge.enterprise
        const tokenIssuer = identity.mode === 'issuer' ? 'https://synthetic-willow-4298.example.test' : identity.mode === 'tenant' ? issuer.replace('synthetic-willow-4202','synthetic-willow-4297') : issuer
        const claims = {iss:tokenIssuer,sub:identity.subject,aud:clientId,iat:t,exp:t+300,nonce:edge.nonce,email:identity.email ?? 'owner@example.com',email_verified:true,groups:identity.groups ?? ['owner','hr','payroll'],role:'owner'}
        const header = Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url')
        const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
        const value = `${header}.${payload}`
        const signature = sign('RSA-SHA256',Buffer.from(value),privateKey).toString('base64url')
        return json({id_token:`${value}.${signature}`,token_type:'Bearer',access_token:'synthetic-willow-4203'})
      }
      throw new Error(`Unexpected enterprise provider request to ${url.pathname}`)
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
      const claims = {iss:edge.oidc==='issuer'?'https://attacker.example':'https://accounts.google.com',sub:edge.email,aud:edge.oidc==='audience'?'other-client':clientId,iat:t,exp:t+300,nonce:edge.nonce,email:edge.email,email_verified:edge.oidc!=='unverified',hd:edge.email.split('@')[1],groups:['owner'],role:'owner'}
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
function assertWorkflowFeature(request) {
  if (request.headers.get('x-models-feature') !== 'willow-workflow-draft') throw new Error('Unexpected AI capability at workflow fixture edge')
}
export const oidcProviders = [{id:'google',preset:'google',clientId:'willow-test',clientSecret:'test-client-secret',tokenAuthMethod:'client_secret_basic'}]
export const enterpriseSubjects = {employee:'synthetic-willow-4211',hr:'synthetic-willow-4212',payroll:'synthetic-willow-4213',ended:'synthetic-willow-4214'}
const subjectEmails = Object.fromEntries(Object.entries(enterpriseSubjects).map(([name,subject]) => [subject,`${name}@example.com`]))
export const enterpriseOidcProviders = [
  {id:'entra',preset:'microsoft',tenant:'synthetic-willow-4202',issuer:'https://login.microsoftonline.com/synthetic-willow-4202/v2.0',clientId:'synthetic-willow-4204',clientSecret:'synthetic-willow-4205',tokenAuthMethod:'client_secret_basic',subjectEmails},
  {id:'okta',preset:'okta',issuer:'https://synthetic-willow-4201.okta.example.test',clientId:'synthetic-willow-4206',clientSecret:'synthetic-willow-4207',tokenAuthMethod:'client_secret_basic',subjectEmails},
]
