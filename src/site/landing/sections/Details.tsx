import { Icon } from '../parts'

const details: [string, 'pink' | 'lavender' | 'green', string, string][] = [
  ['org', 'pink', 'Org chart', 'Always current, straight from the records.'],
  ['review', 'lavender', 'Reviews and goals', 'Check-ins on the schedule you set.'],
  ['pulse', 'green', 'Pulse surveys', 'Anonymous, short and easy to answer.'],
  ['calendar', 'green', 'History by date', "See anyone's record as of any day."],
  ['form', 'pink', 'New-hire reporting', 'State forms ready for each hire.'],
  ['clock', 'lavender', 'Activity log', 'Every change and approval, recorded.'],
]

/** Desk page 8: six smaller things done properly. */
export function Details() {
  return <section className="details" aria-labelledby="details-title">
    <div className="site-wrap">
      <p className="eyebrow center">Also included</p>
      <h2 id="details-title">The quiet details.</h2>
      <ul className="detail-grid">
        {details.map(([icon, tone, title, body]) => <li key={title} className="card detail"><span className={`tile ${tone}`}><Icon name={icon} /></span><h3>{title}</h3><p>{body}</p></li>)}
      </ul>
    </div>
  </section>
}
