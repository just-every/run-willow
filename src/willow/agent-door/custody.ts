import type { Bindings } from '../../auth.server'
import { insist, one } from '../core'
export const AGENT_CUSTODY=['wl_agent_installation_owner','agent_door_state','agent_door_agents','agent_door_audit','agent_door_calls','agent_door_approvals','agent_door_reviews','agent_door_events','agent_door_usage','bs_settings','bs_overrides','bs_logo','bs_team','bs_audit','bs_assert','wl_agent_people']
/** Retained decision evidence may contain private reads, arguments and text.
 * Until subject-scoped custody/redaction is agreed, erasure cannot claim to
 * remove these copies. Never delete approval/audit evidence opportunistically. */
export async function requireNoAgentCustody(env:Bindings) {
 const row=await one<{n:number}>(env,'SELECT COUNT(*) AS n FROM agent_door_audit')
 insist(!row?.n,'agent_custody_unresolved',409,{reason:'Retained agent decisions, pending work and replay outcomes need a subject-scoped custody review before erasure.'})
}
