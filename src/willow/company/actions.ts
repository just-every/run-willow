import type { Bindings } from '../../auth.server'
import { requirePermission, type Actor } from '../actor'
import { commit, guard, insist, newId, now, one, stmt } from '../core'
import { isDate, requireDate } from '../dates'
import { personView } from '../profile'
import { store } from '../files'
import type { Input } from '../input'
import { audienceInput, audiencePredicate, currentMembership, matchesAudience, membershipParams } from './audience'
import { latestAnnouncement, latestFolder } from './store'

export async function announce(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const supplied = input.text('id', { optional: true }), current = supplied ? await latestAnnouncement(env, supplied) : null
  insist(!supplied || current, 'not_found', 404)
  const id = current?.announcement_id ?? newId(), versionId = newId(), version = (current?.version ?? 0) + 1
  const startsOn = requireDate(input.text('startsOn'), 'invalid_startsOn'), endsOn = input.text('endsOn', { optional: true }) || null
  if (endsOn) insist(isDate(endsOn) && endsOn >= startsOn, 'invalid_endsOn')
  const audience = await audienceInput(env, input), title = input.text('title', { max: 160 }), body = input.text('body', { max: 20000 })
  await commit(env, [
    guard(env, 'company_changed', '(SELECT COUNT(*) FROM wl_company_announcement_versions WHERE announcement_id=?)=?', id, version - 1),
    ...(!current ? [stmt(env, 'INSERT INTO wl_company_announcements(id) VALUES (?)', id)] : []),
    stmt(env, `INSERT INTO wl_company_announcement_versions(id,announcement_id,version,title,body,starts_on,ends_on,pinned,ack_required,audience_kind,audience_id,retired,recorded_at,recorded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      versionId, id, version, title, body, startsOn, endsOn, +input.flag('pinned'), +input.flag('ackRequired'), audience.kind, audience.id, +input.flag('retired'), now(), actor.id),
  ], { actor: actor.id, action: 'company.announce', subject: id, detail: { versionId, version } })
  return { id, versionId, version }
}

export async function acknowledge(env: Bindings, actor: Actor, input: Input) {
  const version = input.text('version'), requested = await one(env, 'SELECT announcement_id FROM wl_company_announcement_versions WHERE id=?', version)
  const row = requested ? await latestAnnouncement(env, requested.announcement_id) : null
  insist(row && !row.retired && row.starts_on <= actor.today && (!row.ends_on || row.ends_on >= actor.today) && matchesAudience(row, await currentMembership(env, actor)), 'not_found', 404)
  insist(row.id === version, 'not_latest_version', 409)
  insist(row.ack_required, 'acknowledgement_not_requested', 409)
  insist(!await one(env, 'SELECT 1 FROM wl_company_acknowledgements WHERE version_id=? AND member_id=?', version, actor.id), 'already_acknowledged', 409)
  const at = now()
  await commit(env, [
    guard(env, 'company_changed', `EXISTS (SELECT 1 FROM wl_company_announcement_versions v WHERE v.id=? AND v.retired=0 AND v.starts_on<=? AND (v.ends_on IS NULL OR v.ends_on>=?)
      AND v.ack_required=1 AND v.version=(SELECT MAX(v2.version) FROM wl_company_announcement_versions v2 WHERE v2.announcement_id=v.announcement_id) AND ${audiencePredicate('v')})`, version, actor.today, actor.today, ...membershipParams(actor)),
    stmt(env, 'INSERT INTO wl_company_acknowledgements(version_id,member_id,at) VALUES (?,?,?)', version, actor.id, at),
  ], { actor: actor.id, action: 'company.acknowledge', subject: version })
  return { version, acknowledgedAt: at }
}

export async function folder(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const supplied = input.text('id', { optional: true }), current = supplied ? await latestFolder(env, supplied) : null
  insist(!supplied || current, 'not_found', 404)
  const id = current?.folder_id ?? newId(), versionId = newId(), version = (current?.version ?? 0) + 1
  const audience = await audienceInput(env, input), name = input.text('name', { max: 160 })
  await commit(env, [
    guard(env, 'company_changed', '(SELECT COUNT(*) FROM wl_company_folder_versions WHERE folder_id=?)=?', id, version - 1),
    ...(!current ? [stmt(env, 'INSERT INTO wl_company_folders(id) VALUES (?)', id)] : []),
    stmt(env, 'INSERT INTO wl_company_folder_versions(id,folder_id,version,name,audience_kind,audience_id,retired,recorded_at,recorded_by) VALUES (?,?,?,?,?,?,?,?,?)', versionId, id, version, name, audience.kind, audience.id, +input.flag('retired'), now(), actor.id),
  ], { actor: actor.id, action: 'company.folder', subject: id, detail: { versionId, version } })
  return { id, versionId, version }
}

export async function file(env: Bindings, actor: Actor, input: Input) {
  requirePermission(actor, 'people.manage')
  const supplied = input.text('id', { optional: true }), existing = supplied ? await one(env, 'SELECT id,folder_id FROM wl_company_files WHERE id=?', supplied) : null
  insist(!supplied || existing, 'not_found', 404)
  const folderId = input.text('folder'), parent = await latestFolder(env, folderId)
  insist(parent && !parent.retired, 'not_found', 404)
  insist(!existing || existing.folder_id === folderId, 'file_folder_is_immutable')
  const upload = (await input.file('file', { maxBytes: 10000000 }))!, stored = await store(env, upload)
  const id = existing?.id ?? newId(), versionId = newId(), version = ((await one(env, 'SELECT MAX(version) AS n FROM wl_company_file_versions WHERE file_id=?', id))?.n ?? 0) + 1
  const title = input.text('title', { optional: true, max: 160 }) || stored.filename
  await commit(env, [
    guard(env, 'company_changed', '(SELECT COUNT(*) FROM wl_company_file_versions WHERE file_id=?)=? AND (SELECT MAX(version) FROM wl_company_folder_versions WHERE folder_id=?)=?', id, version - 1, folderId, parent.version),
    ...(!existing ? [stmt(env, 'INSERT INTO wl_company_files(id,folder_id) VALUES (?,?)', id, folderId)] : []),
    stmt(env, 'INSERT INTO wl_company_file_versions(id,file_id,version,title,filename,media_type,size,sha256,recorded_at,recorded_by) VALUES (?,?,?,?,?,?,?,?,?,?)', versionId, id, version, title, stored.filename, stored.mediaType, stored.size, stored.sha256, now(), actor.id),
  ], { actor: actor.id, action: 'company.file', subject: id, detail: { versionId, version, sha256: stored.sha256 } })
  return { id, versionId, version, ...stored }
}

export async function celebrations(env: Bindings, actor: Actor, input: Input) {
  input.only(['birthday', 'anniversary', 'returnTo'])
  insist(actor.personId, 'person_required', 403)
  // Full snapshot: absent HTML checkboxes withdraw consent immediately.
  const birthday = input.flag('birthday'), anniversary = input.flag('anniversary')
  if (birthday) {
    const self = await personView(env, actor, actor.personId)
    insist((self.private as Record<string,unknown>|undefined)?.date_of_birth, 'birthday_not_recorded')
  }
  await commit(env, [stmt(env, `INSERT INTO wl_company_preferences(person_id,birthday,anniversary,updated_at,updated_by) VALUES (?,?,?,?,?)
    ON CONFLICT(person_id) DO UPDATE SET birthday=excluded.birthday,anniversary=excluded.anniversary,updated_at=excluded.updated_at,updated_by=excluded.updated_by`, actor.personId, +birthday, +anniversary, now(), actor.id)],
  { actor: actor.id, action: 'company.celebrations', subject: actor.personId, detail: { birthday, anniversary } })
  return { birthday, anniversary }
}
