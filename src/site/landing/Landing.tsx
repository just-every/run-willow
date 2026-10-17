import '../styles/site.css'
import '../styles/landing.css'
import '../styles/cards.css'
import { SiteFooter } from '../shell/SiteFooter'
import { Hero } from './Hero'
import { ChangeMoveIn } from './sections/ChangeMoveIn'
import { Closing } from './sections/Closing'
import { Details } from './sections/Details'
import { Interlude } from './sections/Interlude'
import { Ownership } from './sections/Ownership'
import { PayrollAccess } from './sections/PayrollAccess'
import { Records } from './sections/Records'
import { SelfService } from './sections/SelfService'

// Willow's homepage (run-willow.com), the design desk's nine pages in order: the hero; people records and onboarding;
// self-service and documents; the interlude; payroll and access; the change agent and moving in; ownership; the quiet
// details; the closing with the footer.
export function Landing() {
  return <div className="site landing">
    <Hero />
    <main>
      <Records />
      <SelfService />
      <Interlude />
      <PayrollAccess />
      <ChangeMoveIn />
      <Ownership />
      <Details />
      <Closing />
    </main>
    <SiteFooter />
  </div>
}
