import { links } from './links'

/** Run Willow (to /run), then the text links: Try the demo and Read the docs, or Read the docs alone. */
export function Actions({ demo = true }: { demo?: boolean }) {
  return <div className="site-actions">
    <a className="site-pill" href={links.run}>Run Willow <span aria-hidden="true">→</span></a>
    {demo ? <a className="site-link" href={links.demo}>Try the demo</a> : null}
    <a className="site-link" href={links.docs}>Read the docs</a>
  </div>
}
