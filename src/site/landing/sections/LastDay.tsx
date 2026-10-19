import { Alert, Arrow, Art, ChapterHead, Check, Initials, Sep, nb } from '../parts'

// Sam Patel's nine accounts on the last day, in the order they closed: Okta first, then every app that signs in
// through it.
const accounts: [string, string, string][] = [
  ['5:00 pm', 'Okta', 'deactivated'],
  ['5:01 pm', 'Google Workspace', 'suspended, mail to Jordan Lee'],
  ['5:01 pm', 'Slack', 'via Okta'],
  ['5:02 pm', 'GitHub', 'via Okta · removed\u00a0from\u00a0org'],
  ['5:02 pm', 'Zoom', 'via Okta'],
  ['5:03 pm', '1Password', 'via Okta'],
  ['5:03 pm', 'HubSpot', 'via Okta'],
  ['5:04 pm', 'Notion', 'via Okta'],
  ['5:04 pm', 'Figma', 'via Okta'],
]
const after = ['Final pay sent to Gusto · acknowledged', 'COBRA notice sent by UnitedHealthcare', 'Laptop return label sent']

/** August: Sam Patel's last day, every account closed and checked, final pay handed to payroll. */
export function LastDay() {
  return <section id="last-day" className="chapter last-day" aria-labelledby="last-day-title" data-shot="last-day">
    <div className="site-wrap">
      <ChapterHead id="last-day" className="split" eyebrow="August · Last day" title="A proper goodbye.">On a last day, access closes on time, final pay goes to payroll, and Willow checks every account is really gone.</ChapterHead>
      <Art className="leaver-art" label={`Sam Patel, last day Friday, August 13, 2027: ${accounts.map(([time, app, what]) => `${time}, ${app}, ${what}`).join('; ')}. At 5:08 pm the Google Workspace license was still assigned; at 5:11 pm it was removed and verified. 9 of 9 accounts closed. ${after.join('; ')}.`}>
        <div className="card leaver">
          <div className="leaver-head">
            <Initials size="lg" tone="pink">SP</Initials>
            <p><strong>Sam Patel</strong><span className="sep">·</span><span>last day Fri, Aug 13, 2027</span></p>
            <p className="closed"><Check />9 of 9 accounts closed</p>
          </div>
          <ol className="accounts">{accounts.map(([time, app, what]) => <li key={app}><Check /><p><time>{time}</time><Sep /><b>{app}</b><Sep />{nb(what.replace('via Okta', 'via\u00a0Okta'))}</p></li>)}</ol>
          <div className="recovery">
            <p className="note warn"><Alert /><span><time>5:08 pm</time><Sep />Google Workspace license still&nbsp;assigned</span></p>
            <Arrow />
            <p className="note ok"><Check /><span><time>5:11 pm</time><Sep />license removed<Sep />verified</span></p>
          </div>
          <p className="closed phone-only"><Check />9 of 9 accounts closed</p>
        </div>
        <ul className="after">{after.map(text => <li key={text} className="card"><Check /><span>{nb(text)}</span></li>)}</ul>
      </Art>
    </div>
  </section>
}
