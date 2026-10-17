import { Alert, Check, Icon } from './parts'

// The six cards hanging in the willow, each on its string with a glowing bead, at the painting's own positions
// (styles/landing.css places them in the art's 1536 x 1024 frame). The faces are the painting's own.
const Face = ({ name }: { name: string }) => <img className="hc-face" src={`/site/avatar-${name}.webp`} alt="" width="56" height="56" loading="eager" />

export function HeroCards() {
  return <div className="hero-cards" role="img" aria-label="Priya starts Monday, November 9 with her laptop shipped and Okta account ready; Marcus has December 22 to January 2 off, approved; Ana's raise to $84,000 is updated in payroll and benefits; Sam's offboarding removed access in 5 systems; a benefits enrollment is missing and a reminder was sent; the org chart holds 48 people.">
    <div aria-hidden="true">
      <span className="hc-string s1" /><span className="hc-string s2" /><span className="hc-string s3" /><span className="hc-string s4" /><span className="hc-string s5" /><span className="hc-string s6" />
      <div className="hc hc-welcome">
        <div className="hc-head"><Face name="priya" /><p><strong>Welcome, Priya</strong><span>starts Mon, Nov 9</span></p></div>
        <ul><li><Check />laptop shipped</li><li><Check />Okta account ready</li></ul>
      </div>
      <div className="hc hc-timeoff">
        <div className="hc-head"><Face name="marcus" /><p><strong>Time off</strong><span>Marcus</span></p></div>
        <p className="hc-line">Dec 22 – Jan 2</p>
        <ul><li><Check />approved</li></ul>
      </div>
      <div className="hc hc-raise">
        <div className="hc-head"><Face name="ana" /><p><strong>Raise</strong><span>Ana → $84,000</span></p></div>
        <ul><li><Check />payroll and benefits updated</li></ul>
      </div>
      <div className="hc hc-offboard">
        <div className="hc-head"><Face name="sam" /><p><strong>Offboarding</strong><span>Sam</span></p></div>
        <ul><li><Check />access removed in 5 systems</li></ul>
      </div>
      <div className="hc hc-benefits">
        <div className="hc-head"><Face name="devon" /><p><strong>Benefits enrollment missing</strong><span>reminder sent</span></p><Alert /></div>
      </div>
      <div className="hc hc-org">
        <div className="hc-head"><span className="hc-group"><Icon name="group" /></span><p><strong>Org chart</strong><span>48 people</span></p></div>
      </div>
    </div>
  </div>
}
