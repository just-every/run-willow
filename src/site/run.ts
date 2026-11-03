import type { RunData } from '../base/run-site'
import pkg from '../../package.json'
import { runPricing } from '../base/run-pricing'

/** Every string and command the run site's Run page (run-willow.com/run) shows. */
export const run: RunData = {
  name: 'Willow',
  repository: pkg.repository.url,
  clone: `npx -y @runeditrun/rer dev ${pkg.repository.url.replace('https://github.com/', '')}`,
  paths: { product: null },
  pricing: runPricing,
  licence: 'MIT',
  docs: true,
}
