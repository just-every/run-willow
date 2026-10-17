import type { ReactNode } from 'react'
import '../styles/site.css'
import '../styles/docs.css'
import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { docsSections } from './pages'

// Every docs page in the homepage's look: its header and footer around the contents list and the page. On a phone the
// contents fold into a "Contents" row.
export function DocsFrame({ current, children }: { current?: string; children: ReactNode }) {
  const nav = (
    <nav className="docs-nav" aria-label="Docs">
      {docsSections.map(section => (
        <div key={section.title}>
          <p className="docs-nav-title">{section.title}</p>
          <ul>
            {section.pages.map(page => (
              <li key={page.slug}><a href={`/docs/${page.slug}`} aria-current={page.slug === current ? 'page' : undefined}>{page.title}</a></li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
  return (
    <div className="site docs">
      <SiteHeader current="docs" />
      <details className="docs-contents">
        <summary>Contents</summary>
        {nav}
      </details>
      <div className="docs-layout">
        <aside className="docs-side">{nav}</aside>
        {children}
      </div>
      <SiteFooter />
    </div>
  )
}
