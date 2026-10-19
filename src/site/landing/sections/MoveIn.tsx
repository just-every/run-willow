import { Alert, Arrow, Art, ChapterHead, Check } from '../parts'

const imported: [string, string][] = [['People', '47'], ['Job and pay history', '312 entries'], ['Documents', '1,146'], ['PTO balances', '47 matched'], ['Open checklists', '2'], ['Gusto', '47 of 47 people linked']]

/** September: Willow set up and deployed, then the BambooHR import of Saturday, Sep 5 with Gusto relinked. */
export function MoveIn() {
  return <section id="move-in" className="chapter move-in" aria-labelledby="move-in-title" data-shot="move-in">
    <div className="site-wrap chapter-grid">
      <ChapterHead id="move-in" eyebrow="September · Move in" title="Moved in over a weekend.">Records, pay history, documents, balances and open checklists come across from BambooHR. Gusto reconnects to the same people.</ChapterHead>
      <Art className="move-in-art" label="A terminal runs rer setup and rer deploy, and Willow is running at people.example.com. The import from BambooHR on Saturday, September 5, 2026 is 100% done: 47 people, 312 job and pay history entries, 1,146 documents, 47 PTO balances matched, 2 open checklists, and Gusto linked for 47 of 47 people; manager 'T. Kim' was not found and was matched to Taylor Kim.">
        <div className="terminal">
          <div className="terminal-bar"><span /><span /><span /></div>
          <pre><code><span className="prompt">$</span>rer setup{'\n'}<span className="prompt">$</span>rer deploy{'\n'}<span className="ok">✓ Willow is running at people.example.com</span></code></pre>
        </div>
        <div className="card import">
          <p className="import-title">Importing from BambooHR</p>
          <p className="meta">Sat, Sep 5, 2026</p>
          <p className="import-bar"><span className="bar"><span /></span><b>100%</b></p>
          <ul className="rows">{imported.map(([what, count]) => <li key={what}><Check soft /><span>{what}</span><span className="count">{count}</span></li>)}</ul>
          <p className="note warn"><span className="fix"><Alert /><span>Manager 'T. Kim' not found</span></span><Arrow /><span className="fix"><Check soft /><span>matched to Taylor Kim</span></span></p>
        </div>
      </Art>
    </div>
  </section>
}
