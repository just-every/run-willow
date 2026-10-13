import { hero } from './copy'
import { links } from './links'

/** The dark pill and the underlined docs link, in the hero and the closing band. */
export function Actions() {
  return (
    <div className="hp-actions">
      <a className="hp-pill" href={links.run}>{hero.run}</a>
      <a className="hp-link" href={links.docs}>{hero.docs}</a>
    </div>
  )
}
