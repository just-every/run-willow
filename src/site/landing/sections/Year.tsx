import { Check, ChapterHead, Initials, nb } from '../parts'

type Pin = { side: 'up' | 'down'; href: string; text: string; who?: string }
// Sep 2026 to Aug 2027 at the illustrative 48-person company: each month's change count (173 in all) and the six
// events the rest of the page tells, each pin a link to its section.
const months: [string, string, number, Pin?][] = [
  ['Sep', '2026', 47, { side: 'up', href: '#move-in', text: 'Moved in from BambooHR · 47\u00a0people' }],
  ['Oct', '', 6, { side: 'down', href: '#offer', text: 'Offer signed · Devon Brooks' }],
  ['Nov', '', 9, { side: 'up', href: '#day-one', text: 'Day one · 14\u00a0of\u00a014\u00a0tasks done' }],
  ['Dec', '', 31, { side: 'down', href: '#time-off', text: 'Time off · 31\u00a0requests approved' }],
  ['Jan', '2027', 12],
  ['Feb', '', 8],
  ['Mar', '', 15],
  ['Apr', '', 7],
  ['May', '', 10],
  ['Jun', '', 14, { side: 'up', href: '#promotion', text: 'Devon promoted, moves to Denver · 7\u00a0changes, all checked', who: 'DB' }],
  ['Jul', '', 5],
  ['Aug', '', 9, { side: 'down', href: '#last-day', text: 'Last day · Sam Patel · 9\u00a0accounts closed' }],
]
const total = months.reduce((sum, [, , n]) => sum + n, 0)

/** One company, one year: the page's table of contents, Sep to Aug on one line (a month list on a phone). */
export function Year() {
  return <section id="year" className="year" aria-labelledby="year-title" data-shot="year">
    <div className="site-wrap">
      <ChapterHead id="year" center eyebrow="A year with Willow" title="One company, one year.">A 48-person company in Austin, TX, month by month.</ChapterHead>
      <div className="year-line">
        <p className="year-label">Changes</p>
        <ol className="months">
          {months.map(([month, year, count, pin]) => <li key={month} className={pin ? `has-pin ${pin.side}` : undefined}>
            <span className="dot" aria-hidden="true" />
            <span className="mon">{month}{year ? <span className="yr"> {year}</span> : null}</span>
            <span className="count" aria-label={`${count} changes`}>{count}</span>
            {pin ? <a className={`pin ${pin.side}`} href={pin.href}><Check />{pin.who ? <Initials size="sm">{pin.who}</Initials> : null}<span className="pin-text">{nb(pin.text)}</span></a> : null}
          </li>)}
        </ol>
        <p className="year-total">{nb(`${total} changes · every one verified`)}</p>
      </div>
    </div>
  </section>
}
