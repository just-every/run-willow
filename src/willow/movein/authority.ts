import { enableDoorAtFirstClaim } from '../../modules/import-kit/src/door/index'
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { one, insist } from '../core'
import { writeImportDoorSettings, readImportDoorHistory } from '../../modules/import-kit/src/door/operator'
import type { D1Database } from '../../modules/import-kit/src/d1/index'

/** Current owner/session checked again inside every Base mutation. */
export function ownerPredicate(actor: Actor) {
  return { sql: `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
    JOIN wl_members m ON m.email=lower(o.email) WHERE s.id=? AND s.revoked_at IS NULL
    AND s.expires_at>unixepoch()*1000 AND o.version=s.operator_version AND o.status='active'
    AND o.role='owner' AND m.id=? AND m.status='active')`, params: [actor.sessionId, actor.id] }
}

/** A persisted, server-owned key survives future claim/configuration changes. */
export async function doorKey(env: Bindings) {
  return (await one<{ installation_id: string }>(env, 'SELECT installation_id FROM wl_import_door WHERE singleton=1'))?.installation_id
    ?? env.RER_OWNER_CLAIM_INSTALLATION_ID ?? 'people/willow'
}

export async function initializeDoor(env: Bindings, actor: Actor) {
  insist(actor.owner, 'owner_required', 403)
  const predicate = ownerPredicate(actor)
  await env.DB.prepare(`INSERT OR IGNORE INTO wl_import_door(singleton,installation_id)
    SELECT 1,? WHERE (${predicate.sql})`).bind(await doorKey(env), ...predicate.params).run()
  const key = await doorKey(env)
  if (!await one(env, 'SELECT 1 FROM ik_door_settings WHERE installation_id=?', key)) {
    if(env.RER_IMPORT_DOOR==='on') await enableDoorAtFirstClaim(env.DB as unknown as D1Database,key,predicate)
    else await writeImportDoorSettings(env.DB as unknown as D1Database, key, { enabled: false }, predicate)
  }
  return key
}

export async function doorSettings(env: Bindings, actor: Actor) {
  insist(actor.owner, 'owner_required', 403)
  const key = await initializeDoor(env, actor)
  return { enabled: !!(await one<{enabled:number}>(env, 'SELECT enabled FROM ik_door_settings WHERE installation_id=?', key))?.enabled,
    revokedKids: (await env.DB.prepare('SELECT kid FROM ik_door_revoked_keys WHERE installation_id=? ORDER BY kid').bind(key).all<{kid:string}>()).results.map(row=>row.kid) }
}

export async function configureDoor(env: Bindings, actor: Actor, enabled: boolean, revokedKids: string[]) {
  const key = await initializeDoor(env, actor)
  await writeImportDoorSettings(env.DB as unknown as D1Database, key, { enabled, revokedKids }, ownerPredicate(actor))
  return doorSettings(env, actor)
}

export async function doorHistory(env: Bindings, actor: Actor) {
  insist(actor.owner, 'owner_required', 403)
  return readImportDoorHistory(env.DB as unknown as D1Database, await doorKey(env), ownerPredicate(actor))
}

/** The trusted provisioning flag is the owner's prior approval; never overwrite a later choice. */
export async function initializeProvisionedDoor(env: Bindings) {
  if(env.RER_IMPORT_DOOR!=='on') return
  const predicate={sql:"EXISTS(SELECT 1 FROM oa_operators WHERE lower(email)=lower(?) AND role='owner' AND status='active')",params:[env.OWNER_EMAIL]}
  if(!await one(env,`SELECT 1 WHERE (${predicate.sql})`,...predicate.params)) return
  await env.DB.prepare(`INSERT OR IGNORE INTO wl_import_door(singleton,installation_id) SELECT 1,? WHERE (${predicate.sql})`).bind(await doorKey(env),...predicate.params).run()
  await enableDoorAtFirstClaim(env.DB as unknown as D1Database,await doorKey(env),predicate)
}
