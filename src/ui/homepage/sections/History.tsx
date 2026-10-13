import { sections } from '../copy'
import { Feature } from '../Feature'

const { history } = sections

export function History() {
  return (
    <Feature id={history.id} heading={history.heading} body={history.body} side="right" art="history">
      <div className="hp-card hp-drawn">
        <p className="hp-card-title">{history.card.title}</p>
        <ul className="hp-rows hp-rows-split">
          {history.card.rows.map(([from, role, status]) => (
            <li key={from}><span className="hp-term"><span>{from}</span><span aria-hidden="true">·</span><span>{role}</span></span><span className={`hp-chip hp-chip-${status.replace(' ', '-')}`}>{status}</span></li>
          ))}
        </ul>
      </div>
    </Feature>
  )
}
