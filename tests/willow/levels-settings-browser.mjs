// ROLE-013: native settings selections and owner-managed one-time credentials.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { evidenceDirectory } from './evidence.mjs'
import { day } from './regression-fixture.mjs'
import { genericColumns } from './phase2-fixtures.mjs'
import { settingsSelections } from './levels-settings.mjs'

export async function settingsBrowserProof(h, owner, fx) {
 if (process.env.WILLOW_LEVELS_BROWSER !== '1') return
 assert.ok(process.platform !== 'darwin' || process.env.WILLOW_PLAYWRIGHT_PATH, 'Use current Playwright on macOS')
 const { chromium } = await import(process.env.WILLOW_PLAYWRIGHT_PATH ? pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href : '@playwright/test')
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const contexts = []
 const open = async cookie => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  contexts.push(context)
  await context.addCookies(cookie.split('; ').map(item => ({ name: item.slice(0, item.indexOf('=')), value: item.slice(item.indexOf('=') + 1), url: h.origin })))
  return context.newPage()
 }
 const api = (path, body, status) => h.api(path, owner, body, status)
 const member = fx.staff.managerb
 const read = (path, body, status) => h.api(path, member.cookie, body, status)
 const apply = async plan => api('level.apply', { review: (await api('level.preview', plan)).id })
 try {
  const admin = await open(owner), reader = await open(member.cookie)
  const location = await api('location.create', { name: 'synthetic-willow-13300', timezone: 'UTC' })
  await api('department.create',{name:'synthetic-willow-13304'})
  await api('payroll.layout',{format:'generic',columns:genericColumns})
  await api('retention.adopt',{version:(await api('retention')).tableVersion})
  await api('retention.state',{state:'CA',decision:'none'})
  const bound = await apply({ kind: 'level', name: 'synthetic-willow-13301', permissions: [], scope: { kind: 'group', dimensions: { location: [location.id] } }, otherFields: { phone: 'view' } })
  const submit = async (page, form, button) => {
   await form.getByRole('button', { name: button, exact: true }).click()
   await page.waitForURL(url => url.searchParams.has('notice') || url.searchParams.has('error'))
   assert.ok(!new URL(page.url()).searchParams.has('error'), page.url())
  }
  const visit = async (page, path, status = 200) => assert.equal((await page.goto(h.origin + path)).status(), status, path)
  const applyReview = () => submit(admin, admin.locator('form[action="/app/do/level.apply"]'), 'Apply reviewed change')
  for (const [index, width] of [1440, 390].entries()) {
   for (const page of [admin, reader]) await page.setViewportSize({ width, height: 1000 })
   const capture = async (page, state, mask = []) => {
    await page.evaluate(() => document.fonts.ready)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state} fits ${width}`)
    await page.screenshot({ path: `${evidenceDirectory}/ROLE-013-${state}-${width}.png`, fullPage: true, mask })
   }
   await apply({ kind: 'assignment', member: member.member, levels: [] })
   const name = `synthetic-willow-${13200 + index}`
   await visit(admin, '/app/access')
   const create = admin.locator('details').filter({ has: admin.locator('summary').filter({ hasText: /^Create a level$/ }) }).first()
   await create.locator('summary').click()
   await create.getByLabel('Level name', { exact: true }).fill(name)
   await create.getByLabel('Scope', { exact: true }).selectOption('everyone')
   for (const key of settingsSelections) await create.locator(`input[name="settings"][value="${key}"]`).check()
   assert.deepEqual(await create.locator('input[name="settings"]:checked').evaluateAll(inputs => inputs.map(input => input.value).sort()), settingsSelections)
   await capture(admin, 'selected-settings-matrix')
   await submit(admin, create, 'Review level')
   const review = await api(`level-reviews/${new URL(admin.url()).searchParams.get('levelReview')}`)
   assert.deepEqual([...review.plan.settings].sort(), settingsSelections)
   await capture(admin, 'settings-definition-review')
   await applyReview()
   const level = (await api('levels')).levels.find(item => item.name === name)
   assert.ok(level)
   const assignment = admin.locator('form[action="/app/do/level.preview"]').filter({ has: admin.locator('input[name="kind"][value="assignment"]') })
   await assignment.getByLabel('Assign levels to', { exact: true }).selectOption(member.member)
   await assignment.getByLabel(name, { exact: true }).check()
   await submit(admin, assignment, 'Review assignment')
   await capture(admin, 'settings-assignment-review')
   await applyReview()

   const navigate = async path => {
    await visit(reader, '/app')
    if (width === 390) await reader.locator('label[for="menu-toggle"]').click()
    await reader.locator(`a[href="${path}"]`).first().click()
    await reader.waitForURL(url => url.pathname === path)
   }
   await navigate('/app/connections')
   assert.equal(await reader.locator('form[action^="/app/do/connections."], form[action="/auth/step-up"]').count(), 0)
   const status = await read('connections')
   assert.equal(status.history, undefined)
   assert.equal(status.identity.links, undefined)
   assert.equal(status.model.failures, undefined)
   await capture(reader, 'selected-integration-status')
   await navigate('/app/custom-fields')
   const custom = reader.locator('form[action="/app/do/customField.define"]').filter({ has: reader.locator('input[name="key"]') }).filter({ hasNot: reader.locator('input[name="id"]') })
   await custom.locator('..').locator(':scope > summary').click()
   const key = `synthetic_willow_${13202 + index}`, label = `synthetic-willow-${13202 + index}`
   await custom.getByLabel('Field key', { exact: true }).fill(key)
   await custom.getByLabel('Label', { exact: true }).fill(label)
   await custom.getByLabel('Classification', { exact: true }).selectOption('general')
   await custom.getByLabel('Type', { exact: true }).selectOption('text')
   await custom.getByLabel('Effective from', { exact: true }).fill(day(0))
   await capture(reader, 'native-custom-definition-create')
   await submit(reader, custom, 'Create field')
   const created = (await read('custom-fields')).find(field => field.key === key)
   assert.ok(created)
   await api('customField.write', { person: fx.staff.employee.person, effectiveFrom: day(0), values: { [key]: `synthetic-willow-${13204 + index}` } })
   const edit = reader.locator('form[action="/app/do/customField.define"]').filter({ has: reader.locator(`input[name="id"][value="${created.id}"]`) })
   await edit.locator('..').locator(':scope > summary').click()
   await edit.getByLabel('Label', { exact: true }).fill(`synthetic-willow-${13206 + index}`)
   await capture(reader, 'native-custom-definition-edit')
   await submit(reader, edit, 'Save new version')
   assert.equal((await read('custom-fields')).find(field => field.id === created.id).definition.label, `synthetic-willow-${13206 + index}`)
   await capture(reader, 'custom-definition-saved')
   const record = await read(`people/${fx.staff.employee.person}`)
   assert.equal(record.private, undefined)
   assert.equal(record.pay, undefined)
   assert.ok(!record.customFields.fields.some(field => field.key === key))
   assert.equal(await reader.locator('form[action="/app/do/customField.write"]').count(), 0)

   await visit(admin, '/app/access')
   const revoke = admin.locator('details').filter({ has: admin.locator('summary').filter({ hasText: new RegExp(`^${name} ·`) }) }).first()
   await revoke.locator('summary').click()
   for (const setting of settingsSelections) await revoke.locator(`input[name="settings"][value="${setting}"]`).uncheck()
   await submit(admin, revoke, 'Review level')
   await capture(admin, 'settings-revocation-review')
   await applyReview()
   for (const door of ['connections', 'custom-fields']) {
    await read(door, undefined, 403)
    await visit(reader, `/app/${door}`, 403)
   }
   await capture(reader, 'revoked-settings-page')
   await visit(reader, '/app')
   assert.equal(await reader.locator('a[href="/app/connections"], a[href="/app/custom-fields"]').count(), 0)
   await capture(reader, 'revoked-settings-navigation')

   await visit(admin, '/app/api-credentials')
   const issue = admin.locator('form[action="/app/do/apiKey.issue"]')
   const credentialName = `synthetic-willow-${13302 + index}`
   await issue.locator('[name="name"]').fill(credentialName)
   await issue.locator('[name="level"]').selectOption(bound.id)
   await issue.locator('[name="expiresAt"]').fill(new Date(Date.now() + 86400000).toISOString())
   await capture(admin, 'owner-key-issue-form')
   await Promise.all([admin.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/app/do/apiKey.issue'), issue.getByRole('button').click()])
   const tokenNode = admin.locator('#issued-api-token')
   await tokenNode.waitFor()
   const token = (await tokenNode.innerText()).trim()
   assert.ok(token.length > 0)
   assert.ok(!admin.url().includes(token))
   // Generated credential bytes are tested, and excluded from screenshot evidence.
   await capture(admin, 'owner-key-revealed-once', [tokenNode])
   const metadata = (await api('api-credentials')).find(item => item.name === credentialName)
   assert.ok(metadata)
   assert.ok(metadata.token === undefined, 'Metadata never returns credential material')
   await visit(admin, '/app/api-credentials')
   await admin.reload()
   assert.equal(await admin.locator('#issued-api-token').count(), 0)
   assert.ok(!(await admin.locator('body').innerText()).includes(token))
   await capture(admin, 'owner-key-metadata-only')
   const remove = admin.locator('form[action="/app/do/apiKey.revoke"]').filter({ has: admin.locator(`input[name="credential"][value="${metadata.id}"]`) })
   await remove.getByRole('button').click()
   await admin.waitForURL(url => url.searchParams.has('notice') || url.searchParams.has('error'))
   assert.ok(!new URL(admin.url()).searchParams.has('error'))
   assert.ok((await api('api-credentials')).find(item => item.id === metadata.id).revokedAt)
   await capture(admin, 'owner-key-revoked')
   for (const area of ['locations','schedules','document-categories','payroll-connections','sign-in','retention']) {
    await visit(admin, `/app/settings/${area}`)
    await capture(admin, `native-${area}-settings`)
   }
   await visit(admin, '/app/employer')
   await capture(admin, 'native-company-settings')
  }
  console.log('ROLE-013 native browser: PASS — selected settings/reviews/native schema changes, data withheld and revoked navigation, owner masked one-time key issue/metadata/revoke at 1440/390')
 } finally {
  for (const context of contexts) await context.close()
  await browser.close()
 }
}

export async function delegatedCredentialBrowserProof(h,owner,delegate,second,level,expiresAt) {
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')return
 const {chromium}=await import(pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href)
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const contexts=[]
 const open=async cookie=>{
  const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context)
  await context.addCookies(cookie.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  return context.newPage()
 }
 try {
  const issuer=await open(delegate.cookie),approver=await open(second.cookie)
  for(const [index,width] of [1440,390].entries()) for(const credentialType of ['key','oauth_client']) {
   for(const page of [issuer,approver])await page.setViewportSize({width,height:1000})
   const capture=async(page,state,mask=[])=>{
    await page.evaluate(()=>document.fonts.ready)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),state+' fits '+width)
    const bell=page.locator('.bell'),tip=page.getByRole('tooltip',{name:'Your tasks'})
    await bell.hover();await page.waitForTimeout(150);assert.equal(await tip.isVisible(),false)
    await tip.waitFor({state:'visible'});await page.mouse.move(0,0);await bell.focus();assert.equal(await tip.isVisible(),true)
    await page.screenshot({path:evidenceDirectory+'/API-001-'+credentialType+'-'+state+'-'+width+'.png',fullPage:true,mask})
   }
   assert.equal((await issuer.goto(h.origin+'/app/api-credentials')).status(),200)
   const form=issuer.locator('form[action="/app/do/apiKey.issue"]'),name='synthetic-willow-'+(14130+index+(credentialType==='key'?0:100))
   await form.locator('[name="credentialType"]').selectOption(credentialType);if(credentialType==='oauth_client')await form.locator('[name="redirectUri"]').fill('https://partner.example.test/callback');await form.locator('[name="name"]').fill(name);await form.locator('[name="level"]').selectOption(level);await form.locator('[name="expiresAt"]').fill(expiresAt)
   await capture(issuer,'delegate-issue')
   await Promise.all([issuer.waitForResponse(response=>new URL(response.url()).pathname==='/app/do/apiKey.issue'),form.getByRole('button').click()])
   const token=await issuer.locator('#issued-api-token').textContent()
   assert.ok(token)
   await capture(issuer,'awaiting-approval',[issuer.locator('#issued-api-token')])
   const row=(await h.api('api-credentials',owner)).find(row=>row.name===name)
   assert.ok(row.approvalRequired&&!row.approvedBy)
   let accessToken=token
   const exchange=()=>fetch(h.origin+'/api/willow/oauth/token',{method:'POST',headers:{authorization:'Basic '+Buffer.from(row.id+':'+token).toString('base64'),'content-type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'})
   const request=()=>credentialType==='oauth_client'&&accessToken===token?exchange():fetch(h.origin+'/api/willow/people',{headers:{authorization:'Bearer '+accessToken}})
   assert.equal((await request()).status,401)
   assert.equal((await approver.goto(h.origin+'/app/api-credentials')).status(),200)
   const approval=approver.locator('form[action="/app/do/apiKey.approve"]').filter({has:approver.locator('input[name="credential"][value="'+row.id+'"]')})
   await approval.locator('[name="reason"]').fill('synthetic-willow-14132')
   await capture(approver,'independent-review')
   await approval.getByRole('button').click();await approver.waitForURL(url=>url.searchParams.has('notice')||url.searchParams.has('error'))
   assert.ok(!new URL(approver.url()).searchParams.has('error'))
   if(credentialType==='oauth_client') {
    const response=await exchange();assert.equal(response.status,200);accessToken=(await response.json()).access_token
   }
   assert.equal((await request()).status,200)
   await capture(approver,'approved')
   await h.api('apiKey.revoke',delegate.cookie,{credential:row.id})
   assert.equal((await request()).status,401)
   if(credentialType==='oauth_client')assert.equal((await exchange()).status,401)
   await issuer.goto(h.origin+'/app/api-credentials');await capture(issuer,'revoked')
  }
 }finally{for(const context of contexts)await context.close();await browser.close()}
 console.log('API-001 browser: PASS — delegate issue, one-time pending disclosure, independent review, activation and revocation with tooltips at 1440 and 390')
}

export async function oauthConsentBrowserProof(h,owner,params) {
 if(process.env.WILLOW_LEVELS_BROWSER!=='1')return
 const {chromium}=await import(pathToFileURL(process.env.WILLOW_PLAYWRIGHT_PATH).href)
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true})
 try {
  await context.addCookies(owner.split('; ').map(item=>({name:item.slice(0,item.indexOf('=')),value:item.slice(item.indexOf('=')+1),url:h.origin})))
  for(const width of [1440,390]) for(const decision of ['deny','approve']) {
   // A separate page owns each outbound navigation, including a synthetic partner's terminal load.
   const page=await context.newPage()
   try {
    await page.setViewportSize({width,height:1000})
    assert.equal((await page.goto(h.origin+'/app/oauth/authorize?'+new URLSearchParams(params))).status(),200)
    await page.evaluate(()=>document.fonts.ready)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    const bell=page.locator('.bell'),tip=page.getByRole('tooltip',{name:'Your tasks'})
    await bell.hover();await page.waitForTimeout(150);assert.equal(await tip.isVisible(),false)
    await tip.waitFor({state:'visible'});await page.mouse.move(0,0);await bell.focus();assert.equal(await tip.isVisible(),true)
    if(decision==='deny')await page.screenshot({path:evidenceDirectory+'/API-001-consent-'+width+'.png',fullPage:true})
    await page.getByLabel('Consent reason').fill('synthetic-willow-14433')
    await page.route('https://partner.example.test/**',route=>route.fulfill({status:200,body:'Partner callback received'}))
    const navigation=page.waitForRequest(request=>new URL(request.url()).hostname==='partner.example.test').catch(()=>null)
    const submitted=page.waitForResponse(response=>new URL(response.url()).pathname==='/app/oauth/authorize'&&response.request().method()==='POST')
    await page.getByRole('button',{name:decision==='deny'?'Deny access':'Install app'}).click()
    const result=await submitted;assert.equal(result.status(),303,'Consent submission: '+(result.status()===303?'redirect':await result.text()))
    const callback=await navigation;assert.ok(callback,'The registered callback is reached')
    const destination=new URL(callback.url());assert.equal(destination.searchParams.get('state'),params.state)
    if(decision==='deny'){assert.equal(destination.searchParams.get('error'),'access_denied');assert.equal(destination.searchParams.has('code'),false)}
    else {assert.ok(destination.searchParams.get('code'));assert.equal(destination.searchParams.has('error'),false)}
   }finally{await page.close()}
  }
 }finally{await context.close();await browser.close()}
 console.log('API-001 browser consent: PASS — explicit installation and denial, registered destination, reason and icon tooltips at 1440 and 390')
}
