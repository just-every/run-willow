// Invitation custody is separate from both Willow members and employee people.
import type { Bindings } from '../../auth.server'
import type { Actor, Permission } from '../actor'
import { guard, insist, now, one, sha256Hex } from '../core'
import { today } from '../dates'
import { requireEmployer } from '../employer'

export const SOURCE = 'preboarding/self-identified' as const
export const SQL_NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)"
export interface PacketRow {
  id: string; identity_id: string; name: string; email: string; token_hash: string
  created_at: number; source_on: string; expires_on: string; expires_at: number
  status: 'active' | 'revoked' | 'linked'; revision: number
  completed_at: number | null; linked_person_id: string | null
  delivery_status: 'pending' | 'accepted' | 'development' | 'refused' | 'failed'
  delivery_failure: string | null
}
export const PACKET_SELECT = `SELECT p.*, i.name, i.email FROM wl_preboard_packets p
  JOIN wl_preboard_identities i ON i.id = p.identity_id`

export async function packetById(env: Bindings, id: string): Promise<PacketRow> {
  const row = await one<PacketRow>(env, `${PACKET_SELECT} WHERE p.id = ?`, id)
  insist(row, 'preboarding_not_found', 404)
  return row
}

/** Never accept a person, packet id or signed-in session as portal authority. */
export async function packetByToken(env: Bindings, token: string): Promise<PacketRow> {
  insist(/^[A-Za-z0-9_-]{43}$/.test(token), 'preboarding_unavailable', 404)
  const hash = await sha256Hex(token)
  const row = await one<PacketRow>(env, `${PACKET_SELECT} WHERE p.token_hash = ?`, hash)
  insist(row && row.status === 'active' && row.expires_at > now(), 'preboarding_unavailable', 404)
  return row
}

/** The database clock, rather than request preparation time, closes expiry races. */
export function activeGuard(env: Bindings, packet: PacketRow) {
  return guard(env, 'stale', `EXISTS (SELECT 1 FROM wl_preboard_packets WHERE id = ?
    AND status = 'active' AND revision = ? AND token_hash = ? AND expires_at > ${SQL_NOW})`,
  packet.id, packet.revision, packet.token_hash)
}

/** Recheck the current unscoped grant and admission in the committing batch. */
export function authorityGuard(env: Bindings, actor: Actor, permission: Permission) {
  return guard(env, 'stale', `EXISTS (SELECT 1 FROM wl_members m JOIN oa_operators o ON lower(o.email) = m.email
    WHERE m.id = ? AND m.status = 'active' AND o.status = 'active' AND
    (EXISTS (SELECT 1 FROM wl_effective_permissions e WHERE e.member_id = m.id AND e.permission = ?)
      OR (? = 1 AND o.role = 'owner')))`, actor.id, permission, permission === 'eeo.individual' ? 0 : 1)
}

export async function portalToday(env: Bindings) {
  return today((await requireEmployer(env)).timezone)
}

/** expiresOn is exclusive: the invitation stops at the start of that local day. */
export function startOfDay(day: string, zone: string): number {
  const nominal = Date.parse(`${day}T00:00:00Z`)
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
  let lo = nominal - 36 * 3600000, hi = nominal + 36 * 3600000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (format.format(mid) >= day) hi = mid
    else lo = mid + 1
  }
  return lo
}

export function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
