import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { guard, insist, now, stmt } from '../core'
import { activeGuard, authorityGuard, packetById } from './store'

/** Read validation is useful for preparation; the returned statements enforce it again. */
export async function validatePrepare(env: Bindings, actor: Actor, packetId: string) {
  requirePermission(actor, 'people.manage')
  const packet = await packetById(env, packetId)
  insist(packet.status === 'active' && packet.expires_at > now(), 'preboarding_unavailable', 409)
  return { id: packet.id, name: packet.name, email: packet.email }
}

/** Append AFTER person/period creation in the SAME joiner commit. No EEO approval exists.
 * Nothing here reads answers into HR memory or returns them to the caller.
 */
export async function promotePacketStatements(env: Bindings, actor: Actor, packetId: string, personId: string): Promise<D1PreparedStatement[]> {
  requirePermission(actor, 'people.manage')
  const packet = await packetById(env, packetId)
  insist(packet.status === 'active' && packet.expires_at > now(), 'preboarding_unavailable', 409)
  return [authorityGuard(env, actor, 'people.manage'), activeGuard(env, packet),
    guard(env, 'stale', 'EXISTS (SELECT 1 FROM wl_periods WHERE person_id = ?) AND NOT EXISTS (SELECT 1 FROM wl_eeo_answers WHERE person_id = ?)', personId, personId),
    guard(env, 'stale', 'NOT EXISTS (SELECT 1 FROM wl_preboard_packets WHERE linked_person_id = ?)', personId),
    stmt(env, `INSERT INTO wl_eeo_answers (person_id, sequence, race_ethnicity, sex, recorded_at, recorded_on, recorded_by,
      form_version, hispanic, races, rule_version, veteran, veteran_classes, disability, contractor_forms,
      source, source_packet_id, source_sequence)
      SELECT ?, sequence, race_ethnicity, sex, recorded_at, recorded_on, NULL,
        form_version, hispanic, races, rule_version, veteran, veteran_classes, disability, contractor_forms,
        source, packet_id, sequence
      FROM wl_preboard_eeo_answers WHERE packet_id = ? ORDER BY sequence`, personId, packet.id),
    stmt(env, "UPDATE wl_preboard_packets SET status = 'linked', linked_person_id = ?, revision = revision + 1 WHERE id = ?", personId, packet.id),
    stmt(env, `INSERT INTO wl_audit (at, actor, action, subject, detail) VALUES (?, ?, 'preboarding.promote', ?, ?)`,
      now(), actor.id, packet.id, JSON.stringify({ person: personId })),
  ]
}
