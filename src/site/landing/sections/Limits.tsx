import { Icon } from '../parts'
import { links } from '../../shell/links'

/** The honest limits: one short band, linking to the contract's boundary clause. */
export function Limits() {
  return <section className="limits" aria-labelledby="limits-title" data-shot="limits">
    <div className="site-wrap">
      <div className="limits-band">
        <span className="limits-icon"><Icon name="info" /></span>
        <p><strong id="limits-title">What Willow doesn't do.</strong> It doesn't run payroll, pay people or file taxes; Gusto, ADP, QuickBooks Payroll or Paychex still does. Your broker and carrier still run coverage.</p>
        <a className="limits-link" href={`${links.contract}#BOUNDARY-001`}>Read the limits <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </section>
}
