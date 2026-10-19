import '../styles/site.css'
import '../styles/landing.css'
import '../styles/cards.css'
import '../styles/year.css'
import '../styles/hiring.css'
import '../styles/changes.css'
import { SiteFooter } from '../shell/SiteFooter'
import { Hero } from './Hero'
import { Checked } from './sections/Checked'
import { Closing } from './sections/Closing'
import { DayOne } from './sections/DayOne'
import { Interlude } from './sections/Interlude'
import { LastDay } from './sections/LastDay'
import { Limits } from './sections/Limits'
import { MoveIn } from './sections/MoveIn'
import { Offer } from './sections/Offer'
import { Promotion } from './sections/Promotion'
import { TimeOff } from './sections/TimeOff'
import { Year } from './sections/Year'

// Willow's homepage (run-willow.com), the owner-approved structure s1: one illustrative company's year, Sep 2026 to
// Aug 2027. The hero; the year at a glance; moving in, the offer, day one and time off; the interlude; the promotion,
// its check and a last day; the honest limits; the closing with the footer.
export function Landing() {
  return <div className="site landing">
    <Hero />
    <main>
      <Year />
      <MoveIn />
      <Offer />
      <DayOne />
      <TimeOff />
      <Interlude />
      <Promotion />
      <Checked />
      <LastDay />
      <Limits />
      <Closing />
    </main>
    <SiteFooter />
  </div>
}
