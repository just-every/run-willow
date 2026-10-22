// Settings areas confer configuration authority, never access to employee data.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, insist } from '../core'
import type { Input } from '../input'
import type { Scope } from './scope'

export const SETTINGS_KEYS = ['company','locations','schedules','custom-fields','document-categories','integrations','payroll-connections','sign-in','api-credentials','retention'] as const
export type SettingsKey = typeof SETTINGS_KEYS[number]
export const SETTINGS_LABELS: Record<SettingsKey,string> = {
 company:'Company',locations:'Locations and departments',schedules:'Schedules',
 'custom-fields':'Custom fields','document-categories':'Document categories',
 integrations:'Integrations and connections','payroll-connections':'Payroll connections',
 'sign-in':'Sign-in and security','api-credentials':'API credentials',retention:'Retention',
}
export const SETTINGS_INPUTS = ['settings','settingsSelection']
export interface SettingsGrant { level: string; keys: SettingsKey[] }
export interface SettingsRow { level_id: string; setting: SettingsKey }
const HR_SETTINGS: readonly SettingsKey[] = ['locations','schedules','custom-fields','document-categories']
type SettingsActor = Pick<Actor,'owner'|'permissions'|'settingsGrants'>

/** Native forms send a sentinel so clearing differs from an omitted JSON field. */
export function readSettings(input: Input): SettingsKey[] | undefined {
 if (!SETTINGS_INPUTS.some(name=>input.provided(name))) return undefined
 const keys=[...new Set(input.list('settings'))].sort()
 insist(keys.every(key=>(SETTINGS_KEYS as readonly string[]).includes(key)),'invalid_settings')
 return keys as SettingsKey[]
}
export function validateSettingsScope(scope: Scope, keys: readonly string[]) {
 insist(!keys.length || scope.kind==='everyone','settings_scope_everyone')
}
export const settingsRuleRows=(env: Bindings)=>all<SettingsRow>(env,'SELECT level_id,setting FROM wl_level_settings ORDER BY setting')

/** Reject scoped sources during compilation too; unrelated grants never widen them. */
export async function settingsGrants(env: Bindings, member: string): Promise<SettingsGrant[]> {
 const rows=await all<SettingsRow>(env,"SELECT r.level_id,r.setting FROM wl_level_settings r JOIN wl_member_levels a ON a.level_id=r.level_id JOIN wl_levels l ON l.id=r.level_id WHERE a.member_id=? AND l.scope_kind='everyone' ORDER BY r.setting",member)
 return [...new Set(rows.map(row=>row.level_id))].map(level=>({level,keys:rows.filter(row=>row.level_id===level).map(row=>row.setting)}))
}
export function holdsSetting(actor: SettingsActor, key: SettingsKey): boolean {
 return actor.owner || actor.permissions.has('people.manage') && HR_SETTINGS.includes(key) || actor.settingsGrants.some(grant=>grant.keys.includes(key))
}
export function requireSetting(actor: SettingsActor, key: SettingsKey) {
 insist(holdsSetting(actor,key),'forbidden',403)
}
export const hasAnySettings=(actor: SettingsActor)=>SETTINGS_KEYS.some(key=>holdsSetting(actor,key))
