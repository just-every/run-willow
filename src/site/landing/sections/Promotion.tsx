import { Arrow, Art, ChapterHead, Initials, Tick } from '../parts'

const changes: [string, string, string][] = [
  ['Job', 'Account Executive', 'Senior Account Executive'],
  ['Pay', '$72,000 a year', '$86,000 a year'],
  ['Work location', 'Austin, TX', 'Denver, CO'],
  ['Gusto', 'No state income tax', 'Colorado withholding and FAMLI'],
  ['UnitedHealthcare PPO', 'Austin address', 'Denver address, in network'],
  ['Time off', 'Texas policy', 'Colorado paid sick leave added'],
  ['Okta', 'Sales Austin', 'Sales Denver'],
]

/** June: the preview of every change Devon's promotion and Denver move makes, approved once. */
export function Promotion() {
  return <section id="promotion" className="chapter promotion" aria-labelledby="promotion-title" data-shot="promotion">
    <div className="site-wrap">
      <ChapterHead id="promotion" center eyebrow="June · A promotion and a move" title="Approve it once. Willow does the rest.">Devon is promoted and moves to Denver. Before anything changes, Willow shows every change it will make.</ChapterHead>
      <Art className="preview-art" label={`Devon Brooks, effective Monday, June 14, 2027, approved by Jordan Lee. ${changes.map(([what, today, next]) => `${what}: ${today}, then ${next}`).join('; ')}. 7 changes, effective Monday, June 14.`}>
        <div className="card preview">
          <div className="preview-head">
            <Initials size="lg">DB</Initials>
            <p><strong>Devon Brooks</strong><span>effective Mon, Jun 14, 2027</span></p>
            <span className="approved"><Tick />Approved by Jordan Lee</span>
          </div>
          <div className="preview-table">
            <p className="preview-cols"><span>Change</span><span>Today</span><span>From Jun 14</span></p>
            <ul>{changes.map(([what, today, next]) => <li key={what}><b>{what}</b><span className="today">{today}</span><span className="next"><Arrow /><b>{next}</b></span></li>)}</ul>
          </div>
          <p className="preview-foot">{changes.length} changes<span className="sep">·</span>effective Mon, Jun 14</p>
        </div>
      </Art>
    </div>
  </section>
}
