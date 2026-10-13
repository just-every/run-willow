import { sections } from '../copy'
import { Feature } from '../Feature'
import { Icon } from '../Icon'

const { leave } = sections

export function Leave() {
  return (
    <Feature id={leave.id} heading={leave.heading} body={leave.body} side="left" art="leave">
      <div className="hp-card hp-drawn">
        <p className="hp-card-title">{leave.card.title}</p>
        <ul className="hp-rows">
          <li><span className="hp-disc hp-disc-small"><Icon name="calendar" /></span>{leave.card.hours}</li>
          <li><span className="hp-disc hp-disc-small"><Icon name="clock" /></span>{leave.card.balance}</li>
          <li><span className="hp-disc hp-disc-small"><Icon name="people" /></span>{leave.card.away}</li>
        </ul>
        <span className="hp-pill hp-pill-drawn">{leave.card.action}</span>
      </div>
    </Feature>
  )
}
