import { included } from '../copy'
import { Icon, type IconName } from '../Icon'

const icons: IconName[] = ['document', 'checklist', 'chart', 'shield', 'upload', 'sparkle']

export function Included() {
  return (
    <section className="hp-included" id="included" aria-labelledby="included-heading">
      <img className="hp-fronds hp-fronds-right hp-fronds-small" src="/homepage/fronds-right.webp" alt="" />
      <h2 id="included-heading">{included.heading}</h2>
      <ul>
        {included.items.map((item, index) => (
          <li key={item}><span className={`hp-disc hp-disc-large${index % 2 ? ' hp-disc-gold' : ''}`}><Icon name={icons[index]} /></span>{item}</li>
        ))}
      </ul>
    </section>
  )
}
