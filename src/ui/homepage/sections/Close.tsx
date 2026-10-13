import { Actions } from '../Actions'
import { close } from '../copy'

export function Close() {
  return (
    <section className="hp-close" id="start" aria-labelledby="start-heading">
      <img className="hp-fronds hp-fronds-left" src="/homepage/fronds-left.webp" alt="" />
      <img className="hp-fronds hp-fronds-right" src="/homepage/fronds-right.webp" alt="" />
      <h2 id="start-heading">{close.heading}</h2>
      <p className="hp-lead">{close.body}</p>
      <Actions />
      <img className="hp-river" src="/homepage/river.webp" alt="" />
    </section>
  )
}
