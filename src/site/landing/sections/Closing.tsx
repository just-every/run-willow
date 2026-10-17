import { Actions } from '../../shell/Actions'
import { Painting, Tick } from '../parts'

/** Desk page 9: the closing line over the lakeside office at dusk, where Devon starts Monday and payroll has gone. */
export function Closing() {
  return <section className="closing" aria-labelledby="closing-title">
    <div className="closing-copy">
      <h2 id="closing-title">Everyone, looked after.</h2>
      <p className="closing-sub">Open source HR software for small and mid-size businesses.</p>
      <Actions demo={false} />
      <p className="closing-free">Free and open source, MIT licensed.</p>
    </div>
    <div className="closing-stage">
      <Painting className="closing-art" name="closing" widths={[768, 1152, 1536]} sizes="min(100vw, 1920px)" phone={{ name: 'closing-phone', widths: [636], media: '(max-width: 860px)' }} />
      <p className="closing-tag t1" aria-hidden="true">Devon starts Monday <Tick /></p>
      <p className="closing-tag t2" aria-hidden="true">Payroll sent <Tick /></p>
    </div>
  </section>
}
