// Isolated public-door section proofs keep independent fixture rates and state separate.
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { fixture } from './regression-fixture.mjs'
import { compensationPayProof } from './levels-compensation-pay.mjs'
import { compensationRecordProof } from './levels-compensation-records.mjs'
import { compensationDefinitionProof } from './levels-compensation-definitions.mjs'
import { sectionBrowserProof } from './levels-sections-browser.mjs'
import { compensationCustodyProof } from './levels-compensation-custody.mjs'
import { leaveLevelProof } from './levels-leave.mjs'
import { personalApprovalProof } from './levels-approvals-personal.mjs'
import { approvalRoutingProof } from './levels-approvals-routing.mjs'
import { approvalBrowserProof } from './levels-approvals-browser.mjs'
import { builtinSelectionProof } from './levels-builtins.mjs'
import { builtinBrowserProof } from './levels-builtins-browser.mjs'

const sections = { pay: compensationPayProof, records: compensationRecordProof, definitions: compensationDefinitionProof, leave: leaveLevelProof,custody:compensationCustodyProof,browser:sectionBrowserProof, approvalPersonal:personalApprovalProof, approvalRouting:approvalRoutingProof, approvalBrowser:approvalBrowserProof, builtinSelection:builtinSelectionProof, builtinBrowser:builtinBrowserProof }
const selected = process.argv.slice(2)
assert.ok(selected.every(name => Object.hasOwn(sections, name)), 'Select a registered section proof')
for (const name of selected.length ? selected : Object.keys(sections)) {
 const h = await harness()
 try {
  assert.equal((await h.raw('/auth/bootstrap', { body: { token: h.vars.SETUP_TOKEN, displayName: 'synthetic-willow-600' } })).status, 303)
  const owner = await h.signIn(h.vars.OWNER_EMAIL)
  assert.equal((await h.raw('/setup', { cookie: owner, form: new URLSearchParams({ confirm: 'yes' }) })).status, 303)
  await sections[name](h, owner, await fixture(h, owner))
 } finally { await h.close() }
}
