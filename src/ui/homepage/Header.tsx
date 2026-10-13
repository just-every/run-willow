import { nav } from './copy'
import { links } from './links'
import { Lockup } from './Lockup'

/** `docs` marks the Docs link as the current section on the docs pages. */
export function Header({ docs = false }: { docs?: boolean }) {
  return (
    <header className="hp-header">
      <Lockup />
      <nav aria-label="Site">
        <a href={links.docs} aria-current={docs ? 'page' : undefined}>{nav.docs}</a>
        <a href={links.source}>{nav.source}</a>
      </nav>
    </header>
  )
}
