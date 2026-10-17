import { Actions } from '../shell/Actions'
import { SiteHeader } from '../shell/SiteHeader'
import { HeroCards } from './HeroCards'
import { Painting } from './parts'

/** The willow at dusk with the people's cards hanging from it like lanterns, the promise and the actions. */
export function Hero() {
  return <section className="hero" aria-labelledby="hero-title">
    <div className="hero-stage">
      <Painting className="hero-art" name="hero" widths={[768, 1152, 1536]} sizes="(max-width: 860px) 100vw, min(100vw, 1920px)" eager phone={{ name: 'hero-phone', widths: [750], media: '(max-width: 860px)' }} />
      <SiteHeader onArt />
      <div className="hero-copy">
        <h1 id="hero-title">Look after <span>every person.</span></h1>
        <p className="hero-sub">Willow keeps your people records, welcomes new hires, handles time off and changes, and makes payroll, benefits and access agree.</p>
        <p className="hero-alt">100% free, open source alternative to <strong>BambooHR</strong>, <strong>Rippling</strong> and <strong>HiBob</strong></p>
        <Actions />
      </div>
      <HeroCards />
    </div>
  </section>
}
