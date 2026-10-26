import assert from 'node:assert/strict'
import { enterpriseOidcProviders, enterpriseSubjects } from './phase2-fixtures.mjs'

const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')

// Called inside WIL-19: the Worker owns protocol verification, binding and access.
export async function enterpriseOidcJourney(h, owner, s, api, edge) {
  const originalProviders = h.vars.OIDC_PROVIDERS, originalEnterprise = edge.enterprise
  const baselines = Object.fromEntries(await Promise.all(['employee','hr','payroll'].map(async name => [name,await h.api('me',s[name].cookie)])))
  const providers = [...JSON.parse(originalProviders),...enterpriseOidcProviders]
  const login = async (provider, name = 'employee', changes = {}) => {
    edge.enterprise = {subject:enterpriseSubjects[name],...changes}
    const start = await h.raw(`/auth/oidc/${provider.id}/start`,{body:{returnTo:'/app'}})
    assert.equal(start.status,303,await start.clone().text())
    const authorization = new URL(start.headers.get('location'))
    assert.equal(authorization.origin,new URL(provider.issuer).origin)
    edge.nonce = authorization.searchParams.get('nonce')
    const callback = new URL(authorization.searchParams.get('redirect_uri'))
    assert.equal(callback.origin,h.origin)
    callback.searchParams.set('state',authorization.searchParams.get('state'))
    callback.searchParams.set('code','synthetic-willow-4220')
    const response = await h.raw(callback.pathname + callback.search,{cookie:cookies(start)})
    return {response,cookie:cookies(response)}
  }
  const accepted = async (provider, name = 'employee', changes = {}) => {
    const result = await login(provider,name,changes)
    assert.equal(result.response.status,303,await result.response.clone().text())
    assert.deepEqual(await h.api('me',result.cookie),baselines[name])
    return result.cookie
  }
  const refused = async (provider, name, changes, error) => {
    const result = await login(provider,name,changes)
    assert.ok(result.response.status >= 400 && result.response.status < 600,`${provider.id} refuses the untrusted identity`)
    if (error) assert.equal((await result.response.json()).error,error)
    assert.equal((await h.raw('/auth/session',{cookie:result.cookie})).status,401)
    await h.api('me',result.cookie,undefined,401)
  }
  const deniedSession = async cookie => {
    assert.equal((await h.raw('/auth/session',{cookie})).status,401)
    await h.api('me',cookie,undefined,401)
    const app = await h.raw('/app',{cookie})
    assert.equal(app.status,303)
    assert.equal(new URL(app.headers.get('location'),h.origin).pathname,'/signin')
  }
  try {
    await h.setBindings({OIDC_PROVIDERS:JSON.stringify(providers)})
    for (const provider of enterpriseOidcProviders) {
      await h.api('connections.identity',s.employee.cookie,{provider:provider.id,operation:'relink'},403)
      await api('connections.identity',{provider:provider.id,operation:'relink'})
      // The token claims the owner's email and groups; the explicit subject map
      // still selects the existing member and contributes no application grants.
      for (const name of ['employee','hr','payroll']) {
        const cookie = await accepted(provider,name)
        const expected = await h.raw(`/api/willow/people/${s.employee.person}`,{cookie:s[name].cookie})
        const actual = await h.raw(`/api/willow/people/${s.employee.person}`,{cookie})
        assert.equal(actual.status,expected.status)
        assert.deepEqual(await actual.json(),await expected.json())
        await h.api('payroll',cookie,undefined,name === 'payroll' ? 200 : 403)
        await h.api('connections',cookie,undefined,403)
      }
      await accepted(provider,'employee',{groups:[]})
      await refused(provider,'employee',{mode:'issuer'},'oidc_issuer_mismatch')
      if (provider.preset === 'microsoft') await refused(provider,'employee',{mode:'tenant'},'oidc_issuer_mismatch')
      await refused(provider,'employee',{subject:'synthetic-willow-4299',email:'employee@example.com'})
      await refused(provider,'ended',{})

      const active = await accepted(provider)
      const sessionResponse = await h.raw('/auth/session',{cookie:active})
      assert.equal(sessionResponse.status,200)
      const session = await sessionResponse.json()
      const revoked = await h.raw('/auth/session/revoke',{cookie:owner,body:{sessionId:session.id}})
      assert.equal(revoked.status,204)
      await deniedSession(active)
      const beforeRelink = await accepted(provider)
      await api('connections.identity',{provider:provider.id,operation:'unlink'})
      await deniedSession(beforeRelink)
      await api('connections.identity',{provider:provider.id,operation:'relink'})
      await accepted(provider)
      await api('connections.identity',{provider:provider.id,operation:'unlink'})
      assert.deepEqual(await h.api('me',s.employee.cookie),baselines.employee)
    }
  } finally {
    edge.enterprise = originalEnterprise
    await h.setBindings({OIDC_PROVIDERS:originalProviders})
  }
}
