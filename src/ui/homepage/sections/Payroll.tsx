import { sections } from '../copy'
import { Feature } from '../Feature'
import { Icon, type IconName } from '../Icon'

const { payroll } = sections
const icons: Record<string, [IconName, string]> = { start: ['person', ''], change: ['pencil', ' hp-disc-gold'], leave: ['clock', ''], end: ['minus', ' hp-disc-gold'] }

export function Payroll() {
  return (
    <Feature id={payroll.id} heading={payroll.heading} body={payroll.body} side="left" art="payroll">
      <div className="hp-card hp-drawn">
        <p className="hp-card-title">{payroll.card.title}</p>
        <ul className="hp-rows">
          {payroll.card.rows.map(row => (
            <li key={row[0]}><span className={`hp-disc hp-disc-small${icons[row[0]][1]}`}><Icon name={icons[row[0]][0]} /></span>{row.join(' · ')}</li>
          ))}
        </ul>
        <span className="hp-pill hp-pill-drawn">{payroll.card.action}</span>
      </div>
    </Feature>
  )
}
