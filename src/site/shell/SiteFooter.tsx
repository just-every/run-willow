import { links } from './links'
import { Lockup } from './Lockup'

/** The lockup, then Docs, Source and the licence. */
export function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-wrap site-footer-row">
      <Lockup className="lockup-small" />
      <nav aria-label="Footer">
        <a href={links.docs}>Docs</a>
        <a href={links.source}>Source</a>
        <a href={links.licence}>MIT licensed</a>
      </nav>
    </div>
  </footer>
}
