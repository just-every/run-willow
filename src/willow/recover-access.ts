// Auth credentials are installation-local and are never restored. Willow's
// durable active membership is the authority to recreate a missing sign-in
// identity after the new installation's owner has completed bootstrap. Actual
// admission still requires Base's ordinary email proof; no session is minted here.
// This also handles older Willow archives without changing their portable schema.
import type { Bindings } from '../auth.server'

export async function recoverMemberIdentities(env: Bindings) {
  const activeOwner = "EXISTS(SELECT 1 FROM oa_bootstrap b JOIN oa_operators o ON o.id=b.claim_id WHERE o.status='active' AND o.role='owner')"
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO oa_operators (id,email,display_name,role,status,created_at)
      SELECT lower(hex(randomblob(16))),m.email,m.name,
        CASE WHEN EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id=m.id AND p.permission='people.manage') THEN 'admin' ELSE 'member' END,
        'active',?
      FROM wl_members m WHERE m.status='active' AND m.operator_id IS NULL
        AND m.email NOT LIKE '%@dev.localhost' AND ${activeOwner}
        AND (SELECT COUNT(*) FROM wl_members candidate WHERE lower(candidate.email)=lower(m.email))=1
        AND NOT EXISTS(SELECT 1 FROM oa_operators o WHERE lower(o.email)=lower(m.email))
      ON CONFLICT(email) DO NOTHING`).bind(Date.now()),
    env.DB.prepare(`UPDATE wl_members AS member SET operator_id=(
        SELECT operator.id FROM oa_operators operator WHERE lower(operator.email)=lower(member.email)
      ) WHERE member.status='active' AND member.operator_id IS NULL AND ${activeOwner}
        AND (SELECT COUNT(*) FROM oa_operators operator WHERE lower(operator.email)=lower(member.email))=1
        AND (SELECT COUNT(*) FROM wl_members candidate WHERE lower(candidate.email)=lower(member.email))=1`),
  ])
}
