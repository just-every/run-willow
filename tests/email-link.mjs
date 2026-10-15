import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:email-link');if(queued!==null)process.exit(queued);
// The emitted production Worker uses a fake paid mail edge, with no app outbox.
import assert from 'node:assert/strict'
import { harness } from './willow/harness.mjs'
const h = await harness()
try {
  assert.deepEqual(await (await h.raw('/setup/state')).json(), {state:'unclaimed'})
  assert.equal((await h.raw('/auth/bootstrap', {body:{token:h.vars.SETUP_TOKEN,displayName:'Owner'}})).status,303)
  const cookie = await h.signIn(h.vars.OWNER_EMAIL)
  const session = await (await h.raw('/auth/session',{cookie})).json()
  assert.equal(session.operator.email,h.vars.OWNER_EMAIL)
  assert.equal((await h.raw('/setup',{cookie,form:new URLSearchParams({confirm:'yes'})})).status,303)
  assert.deepEqual(await (await h.raw('/setup/state')).json(),{state:'claimed'})
  console.log('Email-link sign-in passed against the emitted Worker: claim, provider delivery, confirmation, session')
} finally {await h.close()}
