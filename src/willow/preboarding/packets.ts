import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, sha256Hex, stmt } from '../core'
import { addDays, requireDate, today } from '../dates'
import { requireEmployer } from '../employer'
import type { Input } from '../input'
import { deliverPacket } from './mail'
import { authorityGuard, makeToken, PACKET_SELECT, packetById, startOfDay, type PacketRow } from './store'

export interface PacketSummary {
  id: string; name: string; email: string; expiresOn: string
  status: 'active' | 'expired' | 'revoked' | 'linked'
  step: 'self-identification step done' | 'pending'
  person: string | null
  delivery: { status: PacketRow['delivery_status']; failure: string | null }
}

function summary(row: PacketRow): PacketSummary {
  return { id: row.id, name: row.name, email: row.email, expiresOn: row.expires_on,
    status: row.status === 'active' && row.expires_at <= now() ? 'expired' : row.status,
    step: row.completed_at === null ? 'pending' : 'self-identification step done', person: row.linked_person_id,
    delivery: { status: row.delivery_status, failure: row.delivery_failure } }
}

/** Deliberately creates neither a Willow person nor a member. */
export async function createPacket(env: Bindings, actor: Actor, input: Input, request: Request) {
  requirePermission(actor, 'people.manage')
  input.only(['name', 'email', 'expiresOn', 'expiresAt', 'returnTo'])
  insist(new URL(request.url).origin === new URL(env.AUTH_ORIGIN).origin, 'invalid_origin', 403)
  const name = input.text('name', { max: 200 }), email = input.text('email', { max: 254 }).toLowerCase()
  insist(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email), 'invalid_email')
  const employer = await requireEmployer(env), sourceOn = today(employer.timezone)
  const at = now(), exact = input.integer('expiresAt',{optional:true,min:at+1000,max:at+30*86_400_000})
  insist(exact === null || !input.has('expiresOn'),'conflicting_expiry')
  const expiresOn = exact === null
    ? requireDate(input.text('expiresOn', { optional: true, max: 10 }) || addDays(sourceOn, 14), 'invalid_expiresOn')
    : today(employer.timezone,exact)
  insist(exact !== null || expiresOn > sourceOn && expiresOn <= addDays(sourceOn, 30), 'invalid_expiresOn')
  const expiresAt = exact ?? startOfDay(expiresOn, employer.timezone), id = newId(), identity = newId(), token = makeToken()
  await commit(env, [
    authorityGuard(env, actor, 'people.manage'),
    stmt(env, 'INSERT INTO wl_preboard_identities (id, name, email, created_at) VALUES (?, ?, ?, ?)', identity, name, email, at),
    stmt(env, `INSERT INTO wl_preboard_packets (id, identity_id, token_hash, created_by, created_at, source_on, expires_on, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, identity, await sha256Hex(token), actor.id, at, sourceOn, expiresOn, expiresAt),
  ], { actor: actor.id, action: 'preboarding.create', subject: id })
  const delivery = await deliverPacket(env, actor.id, id, email, token, sourceOn)
  return { id, delivery }
}

export async function withdrawPacket(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  input.only(['packet', 'returnTo'])
  const packet = await packetById(env, input.text('packet', { max: 100 }))
  insist(packet.status === 'active', 'preboarding_unavailable', 409)
  await commit(env, [authorityGuard(env, actor, 'people.manage'),
    guard(env, 'stale', "EXISTS (SELECT 1 FROM wl_preboard_packets WHERE id = ? AND status = 'active' AND revision = ?)", packet.id, packet.revision),
    stmt(env, "UPDATE wl_preboard_packets SET status = 'revoked', revision = revision + 1 WHERE id = ?", packet.id),
  ], { actor: actor.id, action: 'preboarding.withdraw', subject: packet.id })
  return { id: packet.id, status: 'revoked' as const }
}

/** HR sees completion only: no answer counts, revisions, choices, or decline signal. */
export async function packets(env: Bindings, actor: Actor): Promise<PacketSummary[]> {
  requirePermission(actor, 'people.manage')
  const rows = await all<PacketRow>(env, `${PACKET_SELECT} ORDER BY p.created_at DESC, p.id`)
  return rows.map(summary)
}
