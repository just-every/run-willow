import type { Bindings } from '../../auth.server'
import { all, one } from '../core'

export const LATEST_ANNOUNCEMENTS = `SELECT v.* FROM wl_company_announcement_versions v WHERE v.version=(SELECT MAX(v2.version) FROM wl_company_announcement_versions v2 WHERE v2.announcement_id=v.announcement_id)`
export const LATEST_FOLDERS = `SELECT v.* FROM wl_company_folder_versions v WHERE v.version=(SELECT MAX(v2.version) FROM wl_company_folder_versions v2 WHERE v2.folder_id=v.folder_id)`
export const latestAnnouncements = (env: Bindings) => all(env, LATEST_ANNOUNCEMENTS)
export const latestFolders = (env: Bindings) => all(env, LATEST_FOLDERS)
export const latestAnnouncement = (env: Bindings, id: string) => one(env, `${LATEST_ANNOUNCEMENTS} AND v.announcement_id=?`, id)
export const latestFolder = (env: Bindings, id: string) => one(env, `${LATEST_FOLDERS} AND v.folder_id=?`, id)
export const preferencesFor = (env: Bindings, person: string | null) => person ? one(env, 'SELECT birthday,anniversary FROM wl_company_preferences WHERE person_id=?', person) : null
