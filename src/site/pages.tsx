// The run site (run-willow.com) `rer build --site` writes: the homepage with its Run action, /run, the docs from
// docs/*.md, /contract from CONTRACT.md, and the not-found page. Every page is static, needs no script to read and
// links to no instance-only route; the installed `/` is the Lobby.
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import type { EditionIdentity } from '../base/identity'
import { identity } from '../identity'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsLead, docsPages, docsTitle } from './docs/pages'
import { Landing } from './landing/Landing'
import { run } from './run'

// Code cards get their Copy button only when script runs; without it the command is still there to select.
const COPY = "document.querySelectorAll('.docs-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.docs-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"

/** The run site's own tokens (public/site/theme.css) for Base's Run and not-found pages; no floor art there. */
const siteIdentity: EditionIdentity = { ...identity, theme: '/site/theme.css', band: undefined }
const SHARE_IMAGE = `${identity.runSite}/site/share.jpg`
const TITLE = 'Willow — Look after every person.'
const DESCRIPTION = 'Willow keeps your people records, welcomes new hires, handles time off and changes, and makes payroll, benefits and access agree. 100% free, open source alternative to BambooHR, Rippling and HiBob.'

export function sitePages({ styles, contract }: SiteContext): SiteBuild {
  const document = (title: string, description: string, body: ReactElement, script = '') => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#faf8f6" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Willow" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={SHARE_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preload" href="/fonts/source-serif-4/source-serif-4-latin-opsz-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/figtree/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href={siteIdentity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}{script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: document(TITLE, DESCRIPTION, <Landing />) },
      { path: '/run', html: runPageHtml(siteIdentity, run, contract) },
      ...(contract ? [{ path: '/contract', html: contractPageHtml(siteIdentity, run, contract) }] : []),
      { path: '/docs', html: document(docsTitle, docsLead, <DocsIndex />) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(`${page.title} · Willow docs`, page.summary, <DocsArticle slug={page.slug} />, COPY) })),
      { path: '/404', html: siteNotFoundHtml(siteIdentity, run, contract) },
    ],
    assets: ['fonts', 'brand', 'site', 'favicon.ico', 'apple-touch-icon.png'],
  }
}
