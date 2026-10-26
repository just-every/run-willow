import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { one } from '../core'
import { MEMBERSHIP, matchesAudience } from '../company/audience'
import { latestFolder } from '../company/store'

/** A pinned file still follows its shared folder's current audience. */
export async function eligibleSource(env:Bindings,actor:Actor,version:string,person:string) {
 const file=await one(env,'SELECT f.folder_id FROM wl_company_file_versions v JOIN wl_company_files f ON f.id=v.file_id WHERE v.id=?',version)
 const folder=file?await latestFolder(env,file.folder_id):null
 const membership=await one(env,MEMBERSHIP,person,actor.today,actor.today,actor.today)
 return !!folder&&!folder.retired&&matchesAudience(folder,membership)
}
