import { Actions } from '../../shell/Actions'
import { PLATE_WIDTHS, Painting, Tick } from '../parts'

/** The closing line over the lakeside office at dusk: the year ends with Devon in Denver and payroll sent. */
export function Closing() {
  return <section className="closing" data-shot="closing" aria-labelledby="closing-title">
    <div className="closing-copy">
      <h2 id="closing-title">Everyone, looked after.</h2>
      <p className="closing-sub">Open source HR software for small and mid&#8209;size businesses.</p>
      <Actions demo={false} />
      <p className="closing-free">Free and open source, MIT licensed.</p>
    </div>
    <div className="closing-stage">
      <Painting className="closing-art" name="closing" widths={PLATE_WIDTHS} sizes="100vw" phone={{ name: 'closing-phone', widths: [636], media: '(max-width: 860px)' }} />
      <p className="closing-tag t1" aria-hidden="true">Devon · Denver <Tick /></p>
      <p className="closing-tag t2" aria-hidden="true">Payroll sent <Tick /></p>
    </div>
  </section>
}
