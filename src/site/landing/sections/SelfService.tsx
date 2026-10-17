import { Check, Clock, Feature, Initials, Pair } from '../parts'

// Desk page 3: Marcus's own view (time off approved, address changed, the handbook to sign), and Devon's offer letter
// signed by both sides and filed, with the 2027 handbook still collecting signatures.
export function SelfService() {
  return <Pair>
    <Feature id="self-service" eyebrow="Self-service" title={<>Time off without the back-and-forth.</>} label="Marcus's home: 64 hours of PTO; time off December 22 to January 2 approved by Jordan Lee, with December 25 and January 1 company holidays not deducted; address updated to 1420 E 6th St, Austin, Texas; to do: sign the 2027 handbook." art={
      <div className="card home">
        <div className="card-head"><Initials tone="lavender" size="lg">MH</Initials><p><span className="hello">Hi, Marcus</span></p><p className="balance"><strong>64 hours</strong><span>PTO balance</span></p></div>
        <div className="row two"><Check soft /><p><span>Time off <span className="sep">·</span> Dec 22 to Jan 2 <span className="sep">·</span> approved by Jordan Lee</span><small>Dec 25 and Jan 1 are company holidays <span className="sep">·</span> not deducted</small></p></div>
        <div className="row"><Check soft /><span>Address updated <span className="sep">·</span> 1420 E 6th St, Austin, TX</span></div>
        <div className="row"><span className="todo" /><span>To do <span className="sep">·</span> Sign the 2027 handbook</span></div>
      </div>
    }>People request leave, update their details and find a teammate on their own. Managers approve in one tap, and balances stay right.</Feature>
    <Feature id="documents" flip eyebrow="Documents" title={<>Signed, and filed where it belongs.</>} label="Devon Brooks's offer letter, Account Executive at $72,000 base starting November 2: signed by Devon on October 14 at 9:41 am and by Maya Chen, CEO, at 2:05 pm, then filed to Devon's record; the 2027 handbook has 46 of 48 signatures and reminders went to the other 2." art={
      <div className="stack">
        <div className="card letter">
          <p className="letter-title">Offer letter · Devon Brooks</p>
          <p className="meta">Account Executive · $72,000 base · starts Nov 2</p>
          <div className="row"><Initials size="md">DB</Initials><Check soft /><span><b>Devon Brooks</b> <span className="muted">· signed Oct 14, 9:41 am</span></span></div>
          <div className="row"><Initials tone="lavender" size="md">MC</Initials><Check soft /><span><b>Maya Chen, CEO</b> <span className="muted">· signed Oct 14, 2:05 pm</span></span></div>
          <div className="row"><Check soft /><span>Filed to Devon's record</span></div>
        </div>
        <div className="note warn float"><Clock /><span><b>2027 handbook</b> · 46 of 48 signed · reminders sent to 2</span></div>
      </div>
    }>Offer letters and policies come from your templates, go out for e-signature and land in each person's record.</Feature>
  </Pair>
}
