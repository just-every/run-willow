import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { meta } from '../ui/homepage/copy'
import { Homepage } from '../ui/homepage/Homepage'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsLead, docsPages, docsTitle } from './docs/pages'
import './docs/docs.css'
import { run } from './run'

/**
 * The run site (run-willow.com), written by `rer build --site`: the homepage at `/`, whose Run Willow opens the Run
 * page at `/run`; the docs at `/docs` and `/docs/<slug>`, built from the repository's Markdown; and the not-found page.
 * Every page is static, needs no script and links to no instance-only route. The installed `/` is the Lobby.
 */
export function sitePages({ styles }: SiteContext): SiteBuild {
  const document = (title: string, description: string, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#faf9f5" />
        <link rel="icon" href={identity.mark} />
        <link rel="preload" href="/fonts/source-serif-4/source-serif-4-latin-opsz-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href={identity.theme} />
        <link rel="stylesheet" href="/willow-tokens.css" />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body style={{ margin: 0 }}>{body}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: document(meta.title, meta.description, <Homepage />) },
      { path: '/run', html: runPageHtml(identity, run) },
      { path: '/docs', html: document(`${docsTitle}`, docsLead, <DocsIndex />) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(`${page.title} · Willow docs`, page.summary, <DocsArticle slug={page.slug} />) })),
      { path: '/404', html: siteNotFoundHtml(identity, run) },
    ],
    assets: ['rer-theme.css', 'willow-tokens.css', 'fonts', 'brand', 'homepage', 'icons'],
  }
}
