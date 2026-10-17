import pkg from '../../../package.json'

// Every link the run site makes. Source comes from package.json's repository; the docs and Run page are on this site;
// Try the demo opens the hosted demo, where each visitor gets their own sample employer.
export const links = {
  home: '/',
  docs: '/docs',
  run: '/run',
  demo: 'https://demo.run-willow.com/',
  source: pkg.repository.url,
  licence: `${pkg.repository.url}/blob/main/LICENSE`,
}
