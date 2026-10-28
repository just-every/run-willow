import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

const h = await harness({
  upgrade: {
    before: '0099_member_operator_identity.sql',
    sql: `
      INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES
        ('legacy-owner-operator','owner@example.com','Legacy Owner','owner','active',1),
        ('legacy-member-operator','legacy.member@example.com','Legacy Member','member','active',1);
      INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at) VALUES(1,'legacy-owner-operator',1);
      INSERT INTO wl_members(id,email,name,status,created_at) VALUES
        ('legacy-owner-member','owner@example.com','Legacy Owner','active',1),
        ('legacy-member','legacy.member@example.com','Legacy Member','active',1);
    `,
    snapshot: "SELECT id,email FROM wl_members ORDER BY id",
  },
})

try {
  assert.equal(h.upgradeSnapshot.some(row => row.id === 'legacy-member'), true)
  const cookie = await h.signIn('legacy.member@example.com')
  const member = await h.api('me', cookie)
  assert.equal(member.id, 'legacy-member')
  assert.equal(member.email, 'legacy.member@example.com')
  console.log('Existing Willow memberships resolve after operator-id migration: PASS')
} finally {
  await h.close()
}
