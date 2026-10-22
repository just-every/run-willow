// ROLE-013: selected configuration never supplies the employee data it governs.
import assert from 'node:assert/strict'
import { day } from './regression-fixture.mjs'

export const settingsSelections = ['custom-fields', 'integrations']
export const settingsDefinition = n => ({ key: `synthetic_willow_${n}`, label: `synthetic-willow-${n}`, classification: 'general', type: 'text', validation: { maxLength: 80 }, effectiveFrom: day(0), required: false, employeeRead: false, managerRead: false, retired: false })

export async function settingsSelectionProof(h, owner, fx) {
 const api = (path, body, status) => h.api(path, owner, body, status)
 const reader = fx.staff.managerb, person = fx.staff.employee.person
 const read = (path, body, status) => h.api(path, reader.cookie, body, status)
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 const plan = { kind: 'level', name: 'synthetic-willow-13000', permissions: [], settings: settingsSelections, scope: { kind: 'everyone' } }
 await apply({ kind: 'assignment', member: reader.member, levels: [] })
 for (const door of ['connections', 'custom-fields']) await read(door, undefined, 403)
 await api('level.preview', { ...plan, settings: ['synthetic-willow-13001'] }, 400)
 await api('level.preview', { ...plan, scope: { kind: 'direct' } }, 400)
 const level = await apply(plan)
 const review = await api('level.preview', { kind: 'assignment', member: reader.member, levels: [level.id] })
 assert.deepEqual([...review.impact[0].addedSettings].sort(), settingsSelections)
 await api('level.apply', { review: review.id })
 const connection = await read('connections')
 assert.equal(typeof connection.notices, 'boolean')
 assert.equal(typeof connection.mailConfigured, 'boolean')
 assert.equal(typeof connection.identity.enabled, 'boolean')
 for (const key of ['history', 'billing']) assert.equal(connection[key], undefined)
 for (const key of ['links', 'health', 'tokenHealth', 'client_id', 'issuer']) assert.equal(connection.identity[key], undefined)
 assert.equal(connection.model.failures, undefined)
 for (const provider of connection.identity.providers) for (const key of ['client_id', 'issuer', 'clientSecret']) assert.equal(provider[key], undefined)
 for (const action of ['connections.notices', 'connections.model', 'connections.identity']) {
  const body = action.endsWith('notices') ? { enabled: true } : action.endsWith('model') ? { model: '' } : { provider: 'synthetic-willow-13002', operation: 'relink' }
  await read(action, body, 403)
  assert.ok((await h.submit(action, reader.cookie, body, '/app/connections')).searchParams.has('error'))
 }
 const definition = settingsDefinition(13003)
 const created = await read('customField.define', { definition })
 assert.ok((await read('custom-fields')).some(field => field.id === created.id && field.definition.label === definition.label))
 const privateDefinition = { ...settingsDefinition(13004), classification: 'hr' }
 await api('customField.define', { definition: privateDefinition })
 await api('customField.write', { person, effectiveFrom: day(0), values: { [definition.key]: 'synthetic-willow-13005', [privateDefinition.key]: 'synthetic-willow-13006' } })
 const metadata = await read('custom-fields')
 assert.ok(metadata.some(field => field.key === privateDefinition.key), 'Schema management reads metadata independently of person values')
 assert.ok(!JSON.stringify(metadata).includes('synthetic-willow-13005') && !JSON.stringify(metadata).includes('synthetic-willow-13006'))
 const native = { id: created.id, key: definition.key, classification: 'general', type: 'text', maxLength: '80', effectiveFrom: day(0), label: 'synthetic-willow-13007' }
 assert.ok(!(await h.submit('customField.define', reader.cookie, native, '/app/custom-fields')).searchParams.has('error'))
 const edited = (await read('custom-fields')).find(field => field.id === created.id)
 assert.equal(edited.definition.label, native.label)
 assert.ok(edited.versions.some(version => version.label === definition.label))
 const profile = await read(`people/${person}`)
 assert.equal(profile.pay, undefined)
 assert.equal(profile.private, undefined)
 assert.ok(!profile.customFields.fields.some(field => field.key === definition.key || field.key === privateDefinition.key))
 const values = { person, effectiveFrom: day(0), values: { [definition.key]: 'synthetic-willow-13008' } }
 await read('customField.write', values, 403)
 assert.ok((await h.submit('customField.write', reader.cookie, { person, effectiveFrom: day(0), customField: definition.key, [`custom.${definition.key}`]: 'synthetic-willow-13008' }, `/app/people/${person}`)).searchParams.has('error'))
 assert.equal((await api(`people/${person}`)).customFields.fields.find(field => field.key === definition.key).value, 'synthetic-willow-13005')
 assert.deepEqual((await read('me')).permissions, [])
 for (const door of ['settings', 'levels', 'members', 'retention', 'retained', 'retention/review', 'payroll-layout', 'import-settings', 'audit', 'api-credentials']) await read(door, undefined, 403)
 for (const path of ['/app/settings', '/app/employer', '/app/access', '/app/payroll', '/app/retention', '/app/retention/retained', '/app/api-credentials', '/auth/settings/identity']) assert.equal((await h.raw(path, { cookie: reader.cookie })).status, 403, path)
 for (const path of ['/app/connections', '/app/custom-fields']) assert.equal((await h.raw(path, { cookie: reader.cookie })).status, 200)
 await read('level.preview', plan, 403)
 assert.equal((await h.raw('/api/willow/apiKey.issue', { cookie: reader.cookie, body: { name: 'synthetic-willow-13009', level: level.id, expiresAt: new Date(Date.now() + 86400000).toISOString() } })).status, 403)
 // A review consumes current authority; revoking a definition applies to the same session.
 await apply({ ...plan, level: level.id, settings: [] })
 for (const door of ['connections', 'custom-fields']) await read(door, undefined, 403)
 for (const path of ['/app/connections', '/app/custom-fields']) assert.equal((await h.raw(path, { cookie: reader.cookie })).status, 403)
 await read('customField.define', { definition: { ...definition, id: created.id, label: 'synthetic-willow-13010' } }, 403)
 assert.ok((await h.submit('customField.define', reader.cookie, { ...native, label: 'synthetic-willow-13010' }, '/app/custom-fields')).searchParams.has('error'))
 // Assignment revocation independently removes the selected pages and actions.
 await apply({ ...plan, level: level.id })
 assert.equal((await h.raw('/app/custom-fields', { cookie: reader.cookie })).status, 200)
 await apply({ kind: 'assignment', member: reader.member, levels: [] })
 for (const door of ['connections', 'custom-fields']) await read(door, undefined, 403)
 await read('customField.define', { definition: settingsDefinition(13011) }, 403)
 // All other settings expose native definitions without granting the governed records.
 const areas = ['company','locations','schedules','document-categories','payroll-connections','sign-in','api-credentials','retention']
 const definitionsOnly = await apply({ kind:'level', name:'synthetic-willow-13012', permissions:[], settings:areas, scope:{kind:'everyone'} })
 await apply({kind:'assignment',member:reader.member,levels:[definitionsOnly.id]})
 for(const area of areas) {
  const path=area==='company'?'/app/employer':area==='api-credentials'?'/app/api-credentials':`/app/settings/${area}`
  assert.equal((await h.raw(path,{cookie:reader.cookie})).status,200,path)
  if(!['company','api-credentials'].includes(area)) await read(`setting-areas/${area}`)
 }
 await read('api-credentials',undefined,403)
 for(const action of ['retention.adopt','retention.state','retention.map','payroll.layout']) await read(action,{},403)
 for(const path of ['/app/access','/app/retention','/app/retention/retained','/auth/settings/identity'])assert.equal((await h.raw(path,{cookie:reader.cookie})).status,403,path)
 const governed=await read(`people/${person}`)
 assert.equal(governed.pay,undefined);assert.equal(governed.private,undefined)
 await apply({kind:'assignment',member:reader.member,levels:[]})
 for(const area of areas) {
  const path=area==='company'?'/app/employer':area==='api-credentials'?'/app/api-credentials':`/app/settings/${area}`
  assert.equal((await h.raw(path,{cookie:reader.cookie})).status,403,path)
 }
 console.log('ROLE-013 settings: PASS — exact selected configuration, metadata-only integration status, immutable native field definitions without person values, owner boundaries and same-session definition/assignment revocation')
}

export async function apiKeyProof(h, owner, fx) {
 const api = (path, body, status) => h.api(path, owner, body, status)
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 const location = await api('location.create', { name: 'synthetic-willow-13100', timezone: 'UTC' })
 const near = await fx.join('synthetic-willow-13101', { locationId: location.id, phone: 'synthetic-willow-13102', payAmount: '93456.78' })
 const far = await fx.join('synthetic-willow-13103', { phone: 'synthetic-willow-13104', payAmount: '76543.21' })
 const plan = { kind: 'level', name: 'synthetic-willow-13105', permissions: [], scope: { kind: 'group', dimensions: { location: [location.id] } }, otherFields: { phone: 'view' } }
 const level = await apply(plan), expiresAt = new Date(Date.now() + 86400000).toISOString()
 const issue = (n, selected = level.id) => api('apiKey.issue', { name: `synthetic-willow-${n}`, level: selected, expiresAt })
 const bearer = async (token, path, status = 200, body) => {
  const response = await fetch(h.origin + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { origin: h.origin, 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert.equal(response.status, status, `Credential response for ${path}`)
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : null
 }
 const suppliedInvalid=await fetch(h.origin+'/api/willow/people',{headers:{cookie:owner,authorization:'Bearer synthetic-willow-13114'}})
 assert.equal(suppliedInvalid.status,401,'An invalid supplied key never falls through to an owner cookie')
 const issued = await issue(13106)
 assert.equal(issued.level, level.id)
 assert.equal(issued.readOnly, true)
 assert.ok(typeof issued.token === 'string' && issued.token.length > 0)
 const roster = await bearer(issued.token, '/api/willow/people')
 assert.deepEqual(roster.map(row => row.id), [near.person])
 const profile = await bearer(issued.token, `/api/willow/people/${near.person}`)
 assert.deepEqual(profile.private, { phone: 'synthetic-willow-13102' })
 assert.equal(profile.pay, undefined)
 assert.ok(!JSON.stringify(profile).includes('93456.78'))
 await bearer(issued.token, `/api/willow/people/${far.person}`, 404)
 for (const path of ['me', 'people/me', `context/${near.person}`, 'settings', 'connections', 'api-credentials', 'levels', 'members', 'eeo/self', 'eeo/people', `eeo/person/${near.person}`]) await bearer(issued.token, `/api/willow/${path}`, 403)
 await bearer(issued.token, '/app/people', 403)
 await bearer(issued.token, '/api/willow/person.field', 403, { person: near.person, revision: profile.revision, field: 'phone', value: 'synthetic-willow-13107' })
 assert.equal((await h.raw('/api/willow/apiKey.issue', { cookie: fx.staff.managerb.cookie, body: { name: 'synthetic-willow-13108', level: level.id, expiresAt } })).status, 403)
 const listing = await api('api-credentials')
 const metadata = listing.find(row => row.id === issued.id)
 assert.ok(metadata.lastUsedAt)
 for (const row of listing) for (const key of ['token', 'token_hash', 'hash']) assert.ok(row[key] === undefined, 'Credential listings exclude secret material')
 assert.ok(!JSON.stringify(listing).includes(issued.token))
 assert.ok(!JSON.stringify(await api('audit')).includes(issued.token))
 // EEO rights on a bound level cannot become credential EEO authority.
 const eeo = await apply({ kind: 'level', name: 'synthetic-willow-13109', permissions: ['eeo.individual'], scope: { kind: 'everyone' } })
 const eeoKey = await issue(13110, eeo.id)
 await bearer(eeoKey.token, '/api/willow/eeo/people', 403)
 await api('apiKey.revoke', { credential: eeoKey.id })
 // Rotation reveals fresh bytes once, and both explicit revocation and edits stop the old key.
 const rotated = await api('apiKey.rotate', { credential: issued.id, expiresAt })
 assert.ok(rotated.token !== issued.token, 'Rotation returns distinct credential material')
 await bearer(issued.token, '/api/willow/people', 401)
 assert.deepEqual((await bearer(rotated.token, '/api/willow/people')).map(row => row.id), [near.person])
 await api('apiKey.revoke', { credential: rotated.id })
 await bearer(rotated.token, '/api/willow/people', 401)
 const changed = await issue(13111)
 await apply({ ...plan, level: level.id, otherFields: { phone: 'edit' } })
 await bearer(changed.token, '/api/willow/people', 401)
 await apply({ ...plan, level: level.id })
 await bearer(changed.token, '/api/willow/people', 401)
 const fresh = await issue(13112)
 assert.deepEqual((await bearer(fresh.token, '/api/willow/people')).map(row => row.id), [near.person])

 // Base's public owner transition preserves the original owner while ending this issuer.
 const freshOwner = await h.signIn(h.vars.OWNER_EMAIL)
 const operatorsResponse = await h.raw('/auth/operators', { cookie: freshOwner })
 assert.equal(operatorsResponse.status, 200)
 const operator = (await operatorsResponse.json()).find(row => row.email === 'managera@example.com')
 assert.ok(operator)
 assert.equal((await h.raw('/auth/operator/role', { cookie: freshOwner, body: { operatorId: operator.id, role: 'owner' } })).status, 200)
 const issuer = await h.signIn('managera@example.com')
 const ended = await h.api('apiKey.issue', issuer, { name: 'synthetic-willow-13113', level: level.id, expiresAt })
 assert.deepEqual((await bearer(ended.token, '/api/willow/people')).map(row => row.id), [near.person])
 assert.equal((await h.raw('/auth/operator/status', { cookie: freshOwner, body: { operatorId: operator.id, status: 'inactive' } })).status, 200)
 await bearer(ended.token, '/api/willow/people', 401)
 assert.ok(!JSON.stringify(await api('api-credentials')).includes(ended.token))
 console.log('ROLE-013 read-only keys: PASS — one-time metadata-safe issue, exact level scope/phone read, no impersonation/owner/EEO/writes, rotation/revoke, permanent level-revision invalidation and ended native owner issuer')
}
