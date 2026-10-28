import type { Bindings } from '../../auth.server'
import { guard } from '../core'

// These schemas are installed before the company-agent adapters are mounted.
// Empty custody holds no person's records. Any row requires a native retention
// mapping before erasure can proceed; none of these stores is out of scope.
export const EMPTY_BASE_CUSTODY = new Set([
  'bs_settings', 'bs_overrides', 'bs_logo', 'bs_team', 'bs_audit', 'bs_assert',
  'agent_door_state', 'agent_door_agents', 'agent_door_audit', 'agent_door_calls',
  'agent_door_approvals', 'agent_door_reviews', 'agent_door_events', 'agent_door_usage',
])

/** Recheck empty custody inside the same transaction that removes native data. */
export const baseCustodyFence = (env: Bindings) => guard(env, 'inventory_incomplete',
  [...EMPTY_BASE_CUSTODY].map(table => `NOT EXISTS (SELECT 1 FROM ${table})`).join(' AND '))
