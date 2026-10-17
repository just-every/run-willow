import { Check, Painting } from '../parts'

/** Desk page 4: willow fronds trailing in the water with the heron, and payday's one line. */
export function Interlude() {
  return <section className="interlude" aria-label="Payday: 48 people, and every system agrees">
    <Painting className="interlude-art" name="interlude" widths={[768, 1152, 1536]} sizes="100vw" />
    <p className="interlude-badge" aria-hidden="true"><Check />Payday · 48 people · every system agrees</p>
  </section>
}
