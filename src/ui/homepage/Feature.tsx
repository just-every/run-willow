import type { ReactNode } from 'react'

// One feature section: a heading and a line beside a small drawing of the real
// screen, with its watercolour sprig behind the card. `side` is where the drawing
// sits; the sections alternate.
export function Feature({ id, heading, body, side, art, children }: { id: string; heading: string; body: string; side: 'left' | 'right'; art: string; children: ReactNode }) {
  return (
    <section className={`hp-feature hp-drawing-${side}`} id={id} aria-labelledby={`${id}-heading`}>
      <div className="hp-feature-copy">
        <h2 id={`${id}-heading`}>{heading}</h2>
        <p>{body}</p>
      </div>
      <figure className={`hp-stage hp-stage-${art}`}>
        <img className="hp-sprig" src={`/homepage/sprig-${art}.webp`} alt="" />
        {children}
      </figure>
    </section>
  )
}
