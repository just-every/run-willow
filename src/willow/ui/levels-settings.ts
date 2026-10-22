import { SETTINGS_KEYS, SETTINGS_LABELS, type SettingsKey } from '../levels/settings'
import { checks, h, hidden, table } from './html'

export function settingsLevelInputs(selected: string[] = [], available: readonly SettingsKey[] = SETTINGS_KEYS) {
 return h`<h4>Settings areas</h4><p>These selections require scope Everyone. They grant configuration access to the selected areas, without granting employee records, private fields or pay. Owner-only operations, including retention custody, erasure and the owner's MFA policy, remain with the owner.</p>${hidden('settingsSelection','yes')}${checks('Settings this level may use','settings',available.map(value=>({value,label:SETTINGS_LABELS[value]})),selected)}`
}
export function settingsLevelReview(review: Record<string,any>) {
 const names=(keys:string[])=>keys.map(key=>SETTINGS_LABELS[key as SettingsKey]??key).join('; ')||'None'
 return h`<h4>Settings access in this review</h4>${review.plan.kind==='level'?h`<p>${names(review.plan.settings??[])}</p>`:''}${table(['Member','Added settings','Removed settings','Before','After'],review.impact.map((item:Record<string,any>)=>[item.name,names(item.addedSettings??[]),names(item.removedSettings??[]),names(item.beforeSettings??[]),names(item.afterSettings??[])]))}`
}
