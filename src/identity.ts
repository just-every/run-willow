import type { EditionIdentity } from './base/identity'
import branding from './branding.json'

export const identity: EditionIdentity = {
  product: 'Willow', deployment: branding.name,
  purpose: '{deployment} keeps your people records and employment work together.',
  tagline: 'Free, open source HR: people records, leave, joiner to leaver checklists and exact payroll changes. MIT licensed.',
  signInPath: '/signin', runSite: 'https://run-willow.com', installedHome: 'lobby',
  theme: '/rer-theme.css', mark: '/brand/mark.svg', band: '/brand/band.svg', accentColor: branding.primaryColor,
}
