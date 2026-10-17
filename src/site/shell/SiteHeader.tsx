import { links } from './links'
import { Lockup } from './Lockup'

/** The lockup, Docs and Source over a hairline; `onArt` sets the links in white over the hero's painting. */
export function SiteHeader({ onArt = false, current }: { onArt?: boolean; current?: 'docs' }) {
  return <header className={`site-header${onArt ? ' on-art' : ''}`}>
    <div className="site-wrap site-header-row">
      <Lockup />
      <nav className="site-nav" aria-label="Site">
        <a href={links.docs} aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
        <a href={links.source}>Source</a>
      </nav>
    </div>
  </header>
}
