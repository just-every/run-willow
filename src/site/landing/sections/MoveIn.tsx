import { Alert, Arrow, Art, ChapterHead, Check } from '../parts'

// The one start line every Run Edit Run page shows, and the alternative for people who already have Node.
const START = 'curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-willow'
const ALTERNATIVE = 'npx -y @runeditrun/rer dev just-every/run-willow'

/** A command that wraps only between words, keeping the installer's `install.sh | sh` together. */
function words(line: string) {
  return line.split(/(\S*install\.sh \| sh|\S+)/).map((part, index) => {
    const pipe = /^(.*\/)(install\.sh \| sh)$/.exec(part)
    if (pipe) return <span key={index}><span className="nw">{pipe[1]}</span><wbr /><span className="nw">{pipe[2]}</span></span>
    return part.trim() ? <span key={index} className="nw">{part}</span> : part
  })
}

const imported: [string, string][] = [['People', '47'], ['Job and pay history', '312 entries'], ['Documents', '1,146'], ['PTO balances', '47 matched'], ['Open checklists', '2'], ['Gusto', '47 of 47 people linked']]

/** September: Willow started with one line, then the BambooHR import of Saturday, Sep 5 with Gusto relinked. */
export function MoveIn() {
  return <section id="move-in" className="chapter move-in" aria-labelledby="move-in-title" data-shot="move-in">
    <div className="site-wrap chapter-grid">
      <ChapterHead id="move-in" eyebrow="September · Move in" title="Moved in over a weekend.">Records, pay history, documents, balances and open checklists come across from BambooHR. Gusto reconnects to the same people.</ChapterHead>
      <Art className="move-in-art" label={`A terminal runs one line, ${START}, with ${ALTERNATIVE} as the alternative for people who already have Node 22 or later, and Willow is running on your computer. The import from BambooHR on Saturday, September 5, 2026 is 100% done: 47 people, 312 job and pay history entries, 1,146 documents, 47 PTO balances matched, 2 open checklists, and Gusto linked for 47 of 47 people; manager 'T. Kim' was not found and was matched to Taylor Kim.`}>
        <div className="terminal">
          <div className="terminal-bar"><span /><span /><span /></div>
          <pre><code><span className="prompt">$</span>{words(START)}{'\n'}<span className="comment"><span className="prompt">#</span>{words(`Already have Node 22 or later? ${ALTERNATIVE}`)}</span>{'\n'}<span className="ok">✓ Willow is running on your computer</span></code></pre>
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
