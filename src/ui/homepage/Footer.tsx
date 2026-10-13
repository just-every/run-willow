import { nav } from './copy'
import { links } from './links'
import { Lockup } from './Lockup'

export function Footer() {
  return (
    <footer className="hp-footer">
      <Lockup />
      <nav aria-label="Footer">
        <a href={links.docs}>{nav.docs}</a>
        <a href={links.source}>{nav.source}</a>
        <a href={links.licence}>{nav.licence}</a>
      </nav>
    </footer>
  )
}
