import './homepage.css'
import './drawings.css'
import { Footer } from './Footer'
import { Header } from './Header'
import { Hero } from './Hero'
import { Close } from './sections/Close'
import { Free } from './sections/Free'
import { History } from './sections/History'
import { Included } from './sections/Included'
import { Leave } from './sections/Leave'
import { MoveIn } from './sections/MoveIn'
import { Payroll } from './sections/Payroll'
import { Private } from './sections/Private'

// Willow's homepage (run-willow.com): the hero, six features, what else is
// included and the closing band.
export function Homepage() {
  return (
    <div className="hp">
      <div className="hp-canopy" aria-hidden="true">
        <img className="hp-fronds hp-fronds-left" src="/homepage/fronds-left.webp" alt="" />
        <img className="hp-fronds hp-fronds-right" src="/homepage/fronds-right.webp" alt="" />
      </div>
      <Header />
      <main>
        <Hero />
        <Free />
        <Leave />
        <Private />
        <Payroll />
        <History />
        <MoveIn />
        <Included />
        <Close />
      </main>
      <Footer />
    </div>
  )
}
