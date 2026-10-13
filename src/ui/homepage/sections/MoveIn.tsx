import { sections } from '../copy'
import { Feature } from '../Feature'

const { moveIn } = sections

export function MoveIn() {
  return (
    <Feature id={moveIn.id} heading={moveIn.heading} body={moveIn.body} side="left" art="move-in">
      <div className="hp-card hp-drawn">
        <p className="hp-card-title">{moveIn.card.title}</p>
        <p className="hp-card-line">{moveIn.card.line}</p>
        <span className="hp-bars" aria-hidden="true"><span /><span /></span>
        <span className="hp-pill hp-pill-drawn hp-pill-short">{moveIn.card.action}</span>
      </div>
    </Feature>
  )
}
