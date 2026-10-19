import { Check, PLATE_WIDTHS, Painting } from '../parts'

/** The interlude: willow fronds trailing in the water with the heron, and payday's one line. */
export function Interlude() {
  return <section className="interlude" data-shot="interlude" aria-label="Payday: 48 people, and every system agrees">
    <Painting className="interlude-art" name="interlude" widths={PLATE_WIDTHS} sizes="100vw" />
    <p className="interlude-badge" aria-hidden="true"><Check />Payday · 48 people · every system agrees</p>
  </section>
}
