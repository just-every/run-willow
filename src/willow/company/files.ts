import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { auditRead, insist, one } from '../core'
import { serve } from '../files'
import { currentMembership, matchesAudience } from './audience'
import { latestFolder } from './store'

/** Every version inherits its folder's current targeting, including old links. */
export async function companyFile(env: Bindings, actor: Actor, versionId: string, download = false) {
  const version = await one(env, `SELECT v.*,f.folder_id FROM wl_company_file_versions v JOIN wl_company_files f ON f.id=v.file_id WHERE v.id=?`, versionId)
  const folder = version ? await latestFolder(env, version.folder_id) : null
  insist(version && folder && !folder.retired && matchesAudience(folder, await currentMembership(env, actor)), 'not_found', 404)
  await auditRead(env, actor.id, 'company.download', version.id, { file: version.file_id, folder: version.folder_id })
  return serve(env, { filename: version.filename, mediaType: version.media_type, size: version.size, sha256: version.sha256 }, { download })
}
