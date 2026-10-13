import { sections } from '../copy'
import { Feature } from '../Feature'
import { Icon } from '../Icon'

const { private: privacy } = sections

export function Private() {
  return (
    <Feature id={privacy.id} heading={privacy.heading} body={privacy.body} side="right" art="private">
      <div className="hp-card hp-drawn">
        <p className="hp-card-title">{privacy.card.title}</p>
        <p className="hp-card-meta">{privacy.card.who}</p>
        <ul className="hp-rows hp-rows-split">
          {privacy.card.rows.map(([what, visible]) => (
            <li key={what}>{what}<span className={`hp-chip hp-chip-${visible === 'Yes' ? 'yes' : 'no'}`}><span className="hp-chip-icon"><Icon name={visible === 'Yes' ? 'check' : 'cross'} /></span>{visible}</span></li>
          ))}
        </ul>
      </div>
    </Feature>
  )
}
