import { hero } from './copy'
import { links } from './links'

/** The dark pills (Run Willow, Try the demo) and the underlined docs link, in the hero and the closing band. */
export function Actions() {
  return (
    <div className="hp-actions">
      <a className="hp-pill" href={links.run}>{hero.run}</a>
      <a className="hp-pill" href={links.demo}>{hero.demo}</a>
      <a className="hp-link" href={links.docs}>{hero.docs}</a>
    </div>
  )
}
