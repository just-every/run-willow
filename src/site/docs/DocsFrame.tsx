import type { ReactNode } from 'react'
import { Footer } from '../../ui/homepage/Footer'
import { Header } from '../../ui/homepage/Header'
import { docsSections } from './pages'

// Every docs page: the homepage's header, fronds and footer around the contents
// list and the page. On a phone the contents fold into a "Contents" row.
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
    <div className="hp docs">
      <div className="hp-canopy" aria-hidden="true">
        <img className="hp-fronds hp-fronds-left" src="/homepage/fronds-left.webp" alt="" />
        <img className="hp-fronds hp-fronds-right" src="/homepage/fronds-right.webp" alt="" />
      </div>
      <Header docs />
      <details className="docs-contents">
        <summary>Contents</summary>
        {nav}
      </details>
      <div className="docs-layout">
        <aside className="docs-side">{nav}</aside>
        {children}
      </div>
      <Footer />
    </div>
  )
}
