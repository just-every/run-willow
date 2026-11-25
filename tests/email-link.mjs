import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:email-link');if(queued!==null)process.exit(queued);
// The emitted production Worker uses a fake paid mail edge, with no app outbox.
import assert from 'node:assert/strict'
import { harness } from './willow/harness.mjs'
let mailRequests = 0
const h = await harness({ provider: () => { mailRequests++; return new Response(null, { status: 202 }) } })
try {
  assert.deepEqual(await (await h.raw('/setup/state')).json(), {state:'unclaimed'})
  assert.equal((await h.raw('/auth/bootstrap', {body:{token:h.vars.SETUP_TOKEN,displayName:'Owner'}})).status,303)
  const cookie = await h.signIn(h.vars.OWNER_EMAIL)
  const session = await (await h.raw('/auth/session',{cookie})).json()
  assert.equal(session.operator.email,h.vars.OWNER_EMAIL)
  assert.equal((await h.raw('/setup',{cookie,form:new URLSearchParams({confirm:'yes'})})).status,303)
  assert.deepEqual(await (await h.raw('/setup/state')).json(),{state:'claimed'})
  console.log('Email-link sign-in passed against the emitted Worker: claim, provider delivery, confirmation, session')

  const before = mailRequests
  await h.setBindings({ MAIL_PROVIDER: 'none', MAIL_FROM: '', MAIL_API_KEY: '' })
  assert.doesNotMatch(await (await h.raw('/signin')).text(), /action="\/auth\/magic-link"/)
  const off = await h.raw('/auth/magic-link', { body: { email: h.vars.OWNER_EMAIL } })
  assert.equal(off.status, 503)
  assert.deepEqual(await off.json(), { error: 'mail_off' })
  assert.equal((await h.raw('/health')).status, 200)
  assert.equal(mailRequests, before)
  console.log('Mail-off Worker stays healthy and refuses email sign-in without contacting a provider')
} finally {await h.close()}
