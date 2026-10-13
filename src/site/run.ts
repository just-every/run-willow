import type { RunData } from '../base/run-site'
import pkg from '../../package.json'

/** Every string and command the run site's Run page (run-willow.com/run) shows. */
export const run: RunData = {
  name: 'Willow',
  repository: pkg.repository.url,
  clone: `git clone ${pkg.repository.url}.git willow`,
  folder: 'willow',
  requirements: 'Needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}
