import { Art, ChapterHead, Icon, Tick } from '../parts'

const terms: [string, string][] = [['Base salary', '$72,000 a year'], ['Benefits', 'UnitedHealthcare PPO and 401(k) with a 4% match'], ['Time off', '15 days a year']]
const signers: [string, string, string][] = [['Devon Brooks', 'Email link and code', 'Oct\u00a014, 9:41\u00a0am'], ['Maya Chen', 'Willow session', 'Oct\u00a014, 2:05\u00a0pm']]

/** October: Devon's offer letter on Tamberline letterhead, signed by both sides the same day, and its certificate. */
export function Offer() {
  return <section id="offer" className="chapter offer" aria-labelledby="offer-title" data-shot="offer">
    <div className="site-wrap offer-grid">
      <Art className="offer-letter" label="Tamberline's offer letter to Devon Brooks, dated October 14, 2026: the role of Account Executive starting Monday, November 2, 2026, at a base salary of $72,000 a year, with UnitedHealthcare PPO and a 401(k) with a 4% match, and 15 days of time off a year; signed by Devon Brooks and by Maya Chen, CEO.">
        <div className="letter">
          <p className="letterhead">Tamberline</p>
          <p className="letter-date">October 14, 2026</p>
          <p>Dear Devon,</p>
          <p>We are delighted to offer you the role of Account Executive, starting Monday, November&nbsp;2, 2026.</p>
          <dl className="terms">{terms.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
          <div className="signatures">
            <figure><img src="/site/sig-devon.svg" alt="" width="280" height="90" loading="lazy" /><figcaption>Devon Brooks</figcaption></figure>
            <figure><img src="/site/sig-maya.svg" alt="" width="268" height="86" loading="lazy" /><figcaption>Maya Chen, CEO</figcaption></figure>
          </div>
        </div>
      </Art>
      <div className="offer-side">
        <ChapterHead id="offer" eyebrow="October · Offer" title="Signed the same day.">Offers come from your templates, go out for e-signature and file themselves to the new hire's record.</ChapterHead>
        <Art className="offer-cert" label="Signing certificate, sealed: Devon Brooks signed with an email link and code on October 14 at 9:41 am, and Maya Chen in a Willow session at 2:05 pm; ESIGN consent was given by both signers; SHA-256 4f9c 21ab … e07d; filed to Devon Brooks, Offer letters.">
          <div className="card cert">
            <div className="cert-head"><span className="seal"><Icon name="seal" /><Tick /></span><p className="cert-title">Signing certificate</p><span className="sealed">Sealed</span></div>
            <table>
              <thead><tr><th>Signer</th><th>Signed in with</th><th>Signed</th></tr></thead>
              <tbody>{signers.map(([who, how, when]) => <tr key={who}><td>{who}</td><td>{how}</td><td>{when}</td></tr>)}</tbody>
            </table>
            <p className="cert-line"><span className="key">ESIGN consent</span><span className="sep">·</span>given by both signers</p>
            <p className="cert-line"><span className="key">SHA-256</span><span className="sep">·</span><span className="mono">4f9c 21ab … e07d</span></p>
            <p className="cert-filed"><Icon name="folder" />Filed to Devon Brooks <span className="sep">›</span> Offer letters</p>
          </div>
        </Art>
      </div>
    </div>
  </section>
}
