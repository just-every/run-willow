import { Icon } from '../parts'

/** Desk page 7: Willow runs where you put it, started by one line. */
export function Ownership() {
  return <section className="ownership" aria-labelledby="ownership-title">
    <div className="site-wrap ownership-grid">
      <div className="feature-copy">
        <p className="eyebrow">Ownership</p>
        <h2 id="ownership-title">Your people, your system.</h2>
        <p className="feature-body">Run Willow on your own computer or server and keep every record, document and change. Export everything, any time.</p>
        <ul className="owned">
          <li><Icon name="server" />Your own computer or server</li>
          <li><Icon name="people" />Your people, your data</li>
          <li><Icon name="export" />Export any time</li>
        </ul>
      </div>
      <figure className="terminal" aria-label="Start Willow with one line: npx -y @runeditrun/rer dev just-every/run-willow">
        <div className="terminal-bar" aria-hidden="true"><span /><span /><span /></div>
        <pre><code><span className="prompt">$</span> npx -y @runeditrun/rer dev just-every/run-willow{'\n'}<span className="comment"># clones, installs and starts Willow on your computer</span></code></pre>
      </figure>
    </div>
  </section>
}
