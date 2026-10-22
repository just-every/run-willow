import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { all, commit, guard, stmt } from '../core'
import { Input } from '../input'
import { RULE_VERSION } from '../eeo/forms'
import { projection, type AnswerRow } from '../eeo/self'
import { parseEeoSubmission } from '../eeo/submission'
import { contractorStatus } from '../retention/settings'
import { activeGuard, authorityGuard, packetById, packetByToken, portalToday, SOURCE, type PacketRow } from './store'

const COLUMNS = `sequence, recorded_at, recorded_on, race_ethnicity, sex, form_version,
  hispanic, races, rule_version, veteran, veteran_classes, disability, source,
  packet_id AS source_packet_id, sequence AS source_sequence`

async function historyFor(env: Bindings, packetId: string) {
  const rows = await all<AnswerRow & { contractor_forms: string | null }>(env,
    `SELECT ${COLUMNS}, contractor_forms FROM wl_preboard_eeo_answers WHERE packet_id = ? ORDER BY sequence DESC`, packetId)
  return rows.map(row => ({ ...projection(row), source: SOURCE, sourcePacketId: packetId,
    sourceSequence: row.sequence, contractorForms: row.contractor_forms ? JSON.parse(row.contractor_forms) : null }))
}

/** Public portal read: the bearer authorizes this packet's EEO and nothing else. */
export async function packetSelf(env: Bindings, token: string) {
  const packet = await packetByToken(env, token), date = await portalToday(env)
  const history = await historyFor(env, packet.id)
  const contractor = (await contractorStatus(env, date)).contractor
  await commit(env, [activeGuard(env, packet)], { actor: `preboarding:${packet.id}`, action: 'preboarding.self.read', subject: packet.id })
  return { packet: { id: packet.id, name: packet.name, expiresOn: packet.expires_on, expiresAt: packet.expires_at },
    current: history[0] ?? null, history, recorded: [],
    form: { version: 2 as const, ruleVersion: RULE_VERSION, contractor } }
}

async function save(env: Bindings, packet: PacketRow, date: string, input: Input) {
  const parsed = await parseEeoSubmission(env, date, input)
  const c = parsed.columns, recordedAt = parsed.revision.recordedAt
  // Packet revisions also fence withdraw/link and concurrent submissions. Sequence comes
  // from immutable answers so no HR-visible distinction is stored for a decline.
  const previous = await all<{ sequence: number }>(env, 'SELECT MAX(sequence) AS sequence FROM wl_preboard_eeo_answers WHERE packet_id = ?', packet.id)
  const prior = previous[0]?.sequence ?? 0, sequence = prior + 1
  await commit(env, [activeGuard(env, packet),
    guard(env, 'stale', 'COALESCE((SELECT MAX(sequence) FROM wl_preboard_eeo_answers WHERE packet_id = ?), 0) = ?', packet.id, prior),
    stmt(env, `INSERT INTO wl_preboard_eeo_answers (packet_id, sequence, recorded_at, recorded_on, race_ethnicity, sex,
      form_version, hispanic, races, rule_version, veteran, veteran_classes, disability, contractor_forms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, packet.id, sequence, recordedAt, date,
    c.raceEthnicity, c.sex, c.formVersion, c.hispanic, c.races, c.ruleVersion, c.veteran, c.veteranClasses, c.disability, c.contractorForms),
    stmt(env, 'UPDATE wl_preboard_packets SET completed_at = COALESCE(completed_at, ?), revision = revision + 1 WHERE id = ?', recordedAt, packet.id),
  ], { actor: `preboarding:${packet.id}`, action: 'preboarding.self.write', subject: packet.id })
  return { ...parsed.revision, sequence, source: SOURCE, sourcePacketId: packet.id, sourceSequence: sequence }
}

export async function writePacketSelf(env: Bindings, token: string, input: Input) {
  const packet = await packetByToken(env, token)
  return save(env, packet, await portalToday(env), input)
}

/** Deliberate whole-step decline uses the same immutable voluntary snapshot path. */
export async function declinePacketSelf(env: Bindings, token: string, input: Input) {
  input.only(['returnTo'])
  const packet = await packetByToken(env, token), date = await portalToday(env)
  const contractor = (await contractorStatus(env, date)).contractor
  return save(env, packet, date, Input.of({ hispanic: 'declined', races: ['declined'], sex: 'declined',
    ...(contractor ? { veteran: 'declined', disability: 'declined' } : {}) }))
}

/** Separate compliance door; ownership and people.manage never satisfy this grant. */
export async function packetRecord(env: Bindings, actor: Actor, packetId: string) {
  requirePermission(actor, 'eeo.individual')
  const packet = await packetById(env, packetId), history = await historyFor(env, packet.id)
  await commit(env, [authorityGuard(env, actor, 'eeo.individual')],
    { actor: actor.id, action: 'preboarding.individual.read', subject: packet.id })
  return { packet: { id: packet.id, name: packet.name, email: packet.email, person: packet.linked_person_id },
    current: history[0] ?? null, history, source: SOURCE }
}
