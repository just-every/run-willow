import { Art, ChapterHead, Check, Initials, Sep, nb } from '../parts'

// The agent's run log for Devon's move: dates drive each step, UnitedHealthcare goes quiet and is followed up through
// the broker, and a paycheck preview missing Colorado tax is resent and corrected.
const log: [string, 'green' | 'orange' | 'red', string][] = [
  ['Jun 7', 'green', 'Gusto · new pay and work state sent · acknowledged'],
  ['Jun 7', 'green', 'Okta · Sales Denver set for Jun\u00a014'],
  ['Jun 8', 'green', 'UnitedHealthcare · Denver address sent'],
  ['Jun 10', 'orange', 'No reply from UnitedHealthcare · followed up with broker'],
  ['Jun 11', 'green', 'UnitedHealthcare · Denver address confirmed'],
  ['Jun 14', 'green', 'Okta · Sales Denver active · verified'],
  ['Jun 16', 'red', 'Jun 25 paycheck preview shows no Colorado tax'],
  ['Jun 16', 'green', 'Colorado withholding resent · Gusto preview corrected'],
]

/** June, checked: Willow keeps going until Gusto, UnitedHealthcare and Okta all say what they should. */
export function Checked() {
  return <section id="checked" className="chapter checked" aria-labelledby="checked-title" data-shot="checked">
    <div className="site-wrap chapter-grid flip">
      <ChapterHead id="checked" eyebrow="June · Checked" title="Done means every system agrees.">Willow compares what each system should say with what it actually says, and keeps going until they match.</ChapterHead>
      <Art className="log-art" label={`Willow agent run log for Devon Brooks's move to Denver: ${log.map(([date, , text]) => `${date}, ${text}`).join('; ')}. Gusto, UnitedHealthcare and Okta match as of June 16 at 4:20 pm.`}>
        <div className="card runlog">
          <div className="runlog-head"><Initials size="lg">DB</Initials><p><strong>Devon Brooks<Sep />move to&nbsp;Denver</strong><span>Willow agent<span className="sep">·</span>run log</span></p></div>
          <ol className="log">{log.map(([date, tone, text], i) => <li key={i} className={tone}><time>{date}</time><span className="dot" /><span>{nb(text)}</span></li>)}</ol>
          <p className="runlog-done"><Check /><span>Gusto, UnitedHealthcare and Okta match<Sep />Jun 16, 4:20 pm</span></p>
        </div>
      </Art>
    </div>
  </section>
}
