// The run site as `rer build --site` wrote it to dist/site: the homepage's primary
// action opens the Run page, the Run page clones the repository package.json names,
// and every guide docs/site.json lists is published and reachable from /docs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const site = path => readFileSync(new URL(`../../dist/site/${path}`, import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(readFileSync(new URL('../../docs/site.json', import.meta.url), 'utf8'))
const hrefs = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1])

const home = site('index.html')
const primary = home.match(/<a class="site-pill" href="([^"]+)"/)
assert.equal(primary?.[1], '/run', 'the hero\'s primary action opens the Run page')
assert.ok(hrefs(home).includes('/docs'), 'the homepage links the on-site docs')
assert.ok(site('run.html').includes(`npx -y @runeditrun/rer dev ${pkg.repository.url.replace('https://github.com/', '')}`), 'the Run page installs the repository package.json names')

const index = hrefs(site('docs.html'))
for (const page of manifest.sections.flatMap(section => section.pages)) {
  assert.ok(index.includes(`/docs/${page.slug}`), `/docs links ${page.slug}`)
  assert.ok(site(`docs/${page.slug}.html`).includes('class="docs-body"'), `${page.slug} is published`)
}
console.log('Run site: Run Willow opens /run, and every guide is published')
