import pkg from '../../../package.json'

// Every link the homepage makes. Source comes from package.json repository; the
// docs are on this site; Run Willow opens the Run page.
export const links = {
  home: '/',
  docs: '/docs',
  run: '/run',
  source: pkg.repository.url,
  licence: `${pkg.repository.url}/blob/main/LICENSE`,
}
