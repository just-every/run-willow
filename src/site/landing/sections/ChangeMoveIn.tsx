import { Alert, Check, Feature, Initials, Pair, Tick } from '../parts'

const steps: [string, 'accent' | 'green' | 'orange', string][] = [
  ['Oct 19', 'accent', 'Approved by Jordan Lee'],
  ['Oct 19', 'green', 'Gusto · work state set to Colorado'],
  ['Oct 20', 'green', 'Benefits · Anthem Colorado plan enrollment sent'],
  ['Oct 22', 'orange', 'No reply from Anthem · broker followed up'],
  ['Oct 23', 'green', 'Anthem confirmed enrollment'],
  ['Oct 23', 'green', 'Okta groups and Colorado PTO policy updated'],
]
const imported: [string, string][] = [['People', '48'], ['Job and pay history', '312 entries'], ['Documents', '1,146'], ['PTO balances', '48 · matched'], ['Open checklists', '2']]

// Desk page 6: Ana's move to Denver carried through payroll, benefits, access and time off until all five agree, and
// the move in from BambooHR.
export function ChangeMoveIn() {
  return <Pair>
    <Feature id="change-agent" wide eyebrow="Change agent" title={<>Approve it once. <span className="accent">Willow does the rest.</span></>} label="Ana Reyes moves to Denver, Colorado, effective Monday, November 16: approved by Jordan Lee on October 19; Gusto's work state set to Colorado the same day; the Anthem Colorado plan enrollment sent October 20; with no reply by October 22 the broker followed up; Anthem confirmed on October 23, when Okta groups and the Colorado PTO policy were updated; all 5 systems agree." art={
      <div className="card change">
        <div className="card-head"><Initials size="lg">AR</Initials><p><strong className="name">Ana Reyes moves to Denver, CO</strong><span className="meta">Effective Mon, Nov 16</span></p></div>
        <ol className="timeline">{steps.map(([date, tone, text], i) => <li key={i}><time>{date}</time><span className={`dot ${tone}`} /><span>{text}</span></li>)}</ol>
        <p className="agree"><Check />All 5 systems agree</p>
      </div>
    }>Approve a raise, a move or a leave. The agent carries it through payroll, benefits, access and time off, then checks every system agrees.</Feature>
    <Feature id="move-in" flip eyebrow="Move in" title={<>Bring your <span className="accent">people with you.</span></>} label="Importing from BambooHR, 100%: 48 people, 312 job and pay history entries, 1,146 documents, 48 PTO balances matched and 2 open checklists; 1 manager name differed and T. Kim was matched to Taylor Kim." art={
      <div className="card import">
        <p className="import-head"><b>Importing from BambooHR</b><span>100%</span></p>
        <span className="bar"><span /></span>
        <ul className="rows">{imported.map(([what, count]) => <li key={what}><Check soft /><span>{what}</span><span className="count">{count}</span></li>)}
          <li className="warnrow"><Alert /><span>1 manager name differs</span><span className="count">T. Kim matched to Taylor Kim <Tick /></span></li>
        </ul>
      </div>
    }>Move from BambooHR, Rippling or HiBob with records, history, documents, balances and open checklists. Payroll reconnects to the same people.</Feature>
  </Pair>
}
