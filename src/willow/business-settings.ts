import type { Bindings } from '../auth.server'
import { createBusinessSettings, type BusinessManifest } from '../modules/business-settings/index.ts'
export const business:BusinessManifest={settings:1,values:['display_name']}
/** Owner-bound settings only. Team reconciliation is an undeclared family. */
export function businessSettings(env:Bindings) {
 return createBusinessSettings({db:env.DB,trust:env.RER_BUSINESS_TRUST,business})
}
