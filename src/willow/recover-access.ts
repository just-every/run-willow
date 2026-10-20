// Auth credentials are installation-local and are never restored. Willow's
// durable active membership is the authority to recreate a missing sign-in
// identity after the new installation's owner has completed bootstrap. Actual
// admission still requires Base's ordinary email proof; no session is minted here.
// This also handles older Willow archives without changing their portable schema.
import type { Bindings } from '../auth.server'

export async function recoverMemberIdentities(env: Bindings) {
  await env.DB.prepare(`INSERT INTO oa_operators (id, email, display_name, role, status, created_at)
    SELECT lower(hex(randomblob(16))), m.email, m.name,
      CASE WHEN EXISTS(SELECT 1 FROM wl_effective_permissions p WHERE p.member_id = m.id AND p.permission = 'people.manage')
        THEN 'admin' ELSE 'member' END, 'active', ?
    FROM wl_members m WHERE m.status = 'active'
      AND m.email NOT LIKE '%@dev.localhost'
      AND EXISTS(SELECT 1 FROM oa_bootstrap b JOIN oa_operators o ON o.id = b.claim_id WHERE o.status = 'active' AND o.role = 'owner')
      AND NOT EXISTS(SELECT 1 FROM oa_operators o WHERE lower(o.email) = m.email)
    ON CONFLICT(email) DO NOTHING`).bind(Date.now()).run()
}
