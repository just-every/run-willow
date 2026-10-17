import { Alert, Check, Feature, Initials, Pair, Tick } from '../parts'

// Desk page 5: the October 30 pay run (Ana's raise, Devon added, Sam's final pay, Marcus's 401(k) caught), and
// Sam's offboarding closing every account on the last day.
export function PayrollAccess() {
  return <Pair>
    <Feature id="payroll" eyebrow="Payroll" title={<>Payroll that matches HR.</>} label="Pay run for Friday, October 30 in Gusto: 48 people matched; Ana Reyes's new $84,000 salary, Devon Brooks added and Sam Patel's final pay acknowledged; Marcus Hill's 401(k) read 5% in Willow and 4% in Gusto and was corrected to 5%." art={
      <div className="card payrun">
        <p className="card-title">Pay run · Fri, Oct 30 · Gusto</p>
        <p className="okpill"><Check />48 people matched</p>
        <ul className="rows">
          <li><Check /><span><b>Ana Reyes</b> · new salary $84,000 · acknowledged</span></li>
          <li><Check /><span><b>Devon Brooks</b> · added · acknowledged</span></li>
          <li><Check /><span><b>Sam Patel</b> · final pay · acknowledged</span></li>
        </ul>
        <div className="note warn"><Alert /><span><b>Marcus Hill</b> · 401(k) 5% in Willow, 4% in Gusto · corrected to 5% <Tick /></span></div>
      </div>
    }>Live two-way sync with Gusto, ADP RUN and QuickBooks Payroll. Every change is acknowledged, and any difference is caught before payday.</Feature>
    <Feature id="access" flip eyebrow="Access" title={<>Accounts open and close on time.</>} label="Sam Patel's offboarding on Friday, October 30: Okta deactivated at 5:00 pm, Google Workspace suspended with mail to Jordan Lee at 5:01, Slack deactivated at 5:01, GitHub removed from 3 repositories at 5:02; a Zoom license was still active and was removed and verified at 5:12 pm." art={
      <div className="card offboard">
        <div className="card-head"><Initials size="lg">SP</Initials><p><strong className="name">Offboarding · Sam Patel</strong><span className="meta">Last day Fri, Oct 30</span></p></div>
        <ul className="rows timed">
          <li><Check /><span><b>Okta</b> · deactivated</span><time>5:00 pm</time></li>
          <li><Check /><span><b>Google Workspace</b> · suspended, mail to Jordan Lee</span><time>5:01 pm</time></li>
          <li><Check /><span><b>Slack</b> · deactivated</span><time>5:01 pm</time></li>
          <li><Check /><span><b>GitHub</b> · removed from 3 repos</span><time>5:02 pm</time></li>
        </ul>
        <div className="note warn"><Alert /><span><b>Zoom license still active</b> · removed and verified 5:12 pm <Tick /></span></div>
      </div>
    }>Google Workspace, Microsoft 365 and Okta accounts open on day one and close on the last. Willow checks each one is really gone.</Feature>
  </Pair>
}
