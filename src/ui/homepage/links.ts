import pkg from '../../../package.json'

// Every link the homepage makes. Source comes from package.json repository; the
// docs are on this site; Run Willow opens the Run page; Try the demo opens the hosted demo.
export const links = {
  home: '/',
  docs: '/docs',
  run: '/run',
  demo: 'https://demo.run-willow.com/',
  source: pkg.repository.url,
  licence: `${pkg.repository.url}/blob/main/LICENSE`,
}
