import { Alert, Check, Clock, Feature, Initials, Pair } from '../parts'

// Desk page 2: one dated record per person (Ana Reyes, whose raise and move run through the page), and Devon
// Brooks's first-day checklist with an owner on every step.
export function Records() {
  return <Pair>
    <Feature id="records" eyebrow="People records" title={<>Every person, one record.</>} label="Ana Reyes's record: Senior Designer in Design, Austin, Texas, managed by Jordan Lee; pay $84,000 a year from October 1, 2026, after $78,000 from January 1, 2025 to September 30, 2026; offer letter signed and W-4 on file; I-9 reverification due November 30 with a reminder set." art={
      <div className="card record">
        <div className="card-head"><Initials size="lg">AR</Initials><p><strong className="name">Ana Reyes</strong><span className="meta">Senior Designer · Design · Austin, TX</span></p></div>
        <div className="row"><b>Manager</b><span className="sep">·</span><span>Jordan Lee</span></div>
        <div className="row pay"><b>Pay</b><span className="sep">·</span><span>$84,000 a year</span><span className="sep">·</span><span>from Oct 1, 2026</span><span className="pill">current</span></div>
        <div className="row past"><span>$78,000 a year</span><span className="sep">·</span><span>Jan 1, 2025 to Sep 30, 2026</span></div>
        <div className="row"><Check /><span>Offer letter</span><span className="sep">·</span><span>signed</span></div>
        <div className="row"><Check /><span>W-4</span><span className="sep">·</span><span>on file</span></div>
        <div className="note warn"><Clock /><span><b>I-9 reverification due Nov 30</b><span className="sep">·</span>reminder set</span></div>
      </div>
    }>Job, pay, manager, documents and history live in one place, dated, so you always know what was true and when.</Feature>
    <Feature id="onboarding" flip eyebrow="Onboarding" title={<>A warm welcome on day one.</>} label="Devon Brooks, Account Executive, starts Monday, November 2: offer letter signed, I-9 Section 1 and W-4, California DE 4, laptop shipped, Okta and Google Workspace ready; I-9 Section 2 with HR is due November 5; the direct deposit form is a day late and Devon has been reminded." art={
      <div className="card checklist">
        <div className="card-head"><Initials tone="lavender" size="lg">DB</Initials><p><strong className="name">Welcome, Devon Brooks</strong><span className="meta">Account Executive · starts Mon, Nov 2</span></p></div>
        <ul className="rows">
          <li><Check /><span className="what">Offer letter signed</span><Initials size="sm">JL</Initials></li>
          <li><Check /><span className="what">I-9 Section 1 and W-4 <span className="who">· Devon</span></span><Initials size="sm">HR</Initials></li>
          <li><Check /><span className="what">California DE 4 <span className="who">· Devon</span></span><Initials size="sm">HR</Initials></li>
          <li><Check /><span className="what">Laptop shipped <span className="who">· IT</span></span><Initials size="sm">MK</Initials></li>
          <li><Check /><span className="what">Okta and Google Workspace ready <span className="who">· IT</span></span><Initials size="sm">MK</Initials></li>
          <li><Clock tone="accent" /><span className="what">I-9 Section 2 <span className="who">· HR · due Nov 5</span></span><Initials size="sm">HR</Initials></li>
        </ul>
        <div className="note warn"><Alert /><span><b>Direct deposit form 1 day late</b><span className="sep">·</span>reminder sent to Devon</span></div>
      </div>
    }>Every new hire gets a checklist with owners and deadlines, from laptop and accounts to I-9, W-4 and state forms. Willow chases each step until it is done.</Feature>
  </Pair>
}
