import { Alert, Art, ChapterHead, Check, Icon, Initials, Sep, nb } from '../parts'

// The Sales team's calendar, Mon Dec 21 to Fri Jan 1: Dec 25 and Jan 1 are company holidays. Each bar is the first
// and last column (1-12) a person is out.
const days = ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '1']
const holidays = [5, 12]
const team: [string, 'pink' | 'lavender', [number, number]?][] = [
  ['JL', 'pink', [1, 3]],
  ['DB', 'lavender', [8, 11]],
  ['TK', 'pink'],
  ['AR', 'lavender', [8, 11]],
  ['MH', 'pink', [2, 12]],
]

/** December: Devon's own time off on the phone, over the team calendar the manager sees before approving. */
export function TimeOff() {
  return <section id="time-off" className="chapter time-off" aria-labelledby="time-off-title" data-shot="time-off">
    <div className="site-wrap chapter-grid flip">
      <ChapterHead id="time-off" eyebrow="December · Time off" title="Everyone books their own time off.">People request time off, check balances and update their details themselves. Managers see who is out before they approve.</ChapterHead>
      <Art className="time-off-art" label="Devon's phone: a time off balance of 88 hours, from 15 days a year granted at hire; December 28 to 31, 32 hours, approved by Jordan Lee; December 25 and January 1 are company holidays; links to update my address and the directory. Beside it, the Sales team's calendar from December 21 to January 1: Jordan Lee out December 21 to 23, Marcus out from December 22, Devon and Ana out December 28 to 31, and on December 28, 3 of 5 are out with Taylor Kim covering.">
        <div className="phone">
          <span className="phone-notch" />
          <div className="phone-screen">
            <Initials size="lg">DB</Initials>
            <p className="phone-hello">Hi, Devon</p>
            <div className="balance">
              <p className="balance-label">Time off balance</p>
              <p className="balance-hours">88 hours</p>
              <p className="balance-policy">{nb('15 days a year · granted at hire')}</p>
              <p className="balance-booked"><Check soft /><span>{nb('Dec 28 to Dec 31 · 32\u00a0hours ·')} <span className="keep">approved by Jordan Lee</span></span></p>
            </div>
            <p className="phone-note">Dec 25 and Jan 1 are company holidays</p>
            <ul className="phone-links">
              <li><span className="tile"><Icon name="person" /></span>Update my address<Icon name="chevron" className="chev" /></li>
              <li><span className="tile"><Icon name="people" /></span>Directory<Icon name="chevron" className="chev" /></li>
            </ul>
          </div>
        </div>
        <div className="card calendar">
          <p className="calendar-title"><b>Sales team</b><span className="sep">·</span>Dec 21 to Jan 1</p>
          <div className="cal">
            <span className="cal-corner" />
            {days.map((day, i) => <span key={day} className={`cal-day${holidays.includes(i + 1) ? ' holiday' : ''}`} style={{ gridColumn: i + 2 }}>{day}</span>)}
            {holidays.map(col => <span key={col} className="cal-holiday" style={{ gridColumn: col + 1 }} />)}
            {team.flatMap(([who, toneName, out], row) => [
              <span key={who} className="cal-who" style={{ gridRow: row + 2 }}><Initials size="sm" tone={toneName}>{who}</Initials></span>,
              out ? <span key={`${who}-out`} className="cal-bar" style={{ gridRow: row + 2, gridColumn: `${out[0] + 1} / ${out[1] + 2}` }} /> : null,
            ])}
          </div>
          <p className="note warn"><Alert /><span>Dec 28<Sep />3 of 5 out<Sep />Taylor&nbsp;Kim&nbsp;covering</span></p>
        </div>
      </Art>
    </div>
  </section>
}
