import { Art, ChapterHead, Check, Clock, Initials, nb } from '../parts'

type Owner = 'DB' | 'HR' | 'IT' | 'JL'
type Task = { what: string; who: Owner; note?: string; late?: boolean }
const tone = { DB: 'lavender', HR: 'pink', IT: 'blue', JL: 'pink' } as const
// The six days before Devon's first day: fourteen tasks, each with its owner. The direct deposit form ran a day late
// on Thursday, got a reminder and was done on Friday, so it shows on both days.
const days: [string, Task[], boolean?][] = [
  ['Mon Oct 26', [{ what: 'W-4', who: 'DB' }, { what: 'Texas new‑hire report', who: 'HR' }, { what: 'Handbook signed', who: 'DB' }]],
  ['Tue Oct 27', [{ what: 'Laptop shipped', who: 'IT' }, { what: 'I-9 Section 1', who: 'DB' }, { what: 'Payroll profile', who: 'HR' }]],
  ['Wed Oct 28', [{ what: 'Okta and Google Workspace', who: 'IT', note: 'ready for Nov 2' }, { what: 'UnitedHealthcare enrollment', who: 'DB' }]],
  ['Thu Oct 29', [{ what: 'Direct deposit form', who: 'DB', note: '1 day late · reminder sent → done Fri', late: true }, { what: 'Desk and badge', who: 'IT' }]],
  ['Fri Oct 30', [{ what: 'Direct deposit form', who: 'DB' }, { what: 'Added to Gusto', who: 'HR', note: 'acknowledged' }]],
  ['Mon Nov 2', [{ what: 'Welcome lunch', who: 'JL' }, { what: 'I-9 Section 2', who: 'HR' }, { what: 'First 1:1', who: 'JL' }], true],
]

/** November: Devon's onboarding board, one column a day, every task owned and done before Monday. */
export function DayOne() {
  return <section id="day-one" className="chapter day-one" aria-labelledby="day-one-title" data-shot="day-one">
    <div className="site-wrap">
      <ChapterHead id="day-one" className="split" eyebrow="November · Day one" title="Ready before Monday.">Every task has an owner and a deadline. Willow chases each one until it is done.</ChapterHead>
      <Art className="board-art" label="Devon Brooks, Account Executive, starts Monday, November 2. Monday, October 26: W-4 by Devon, Texas new-hire report by HR, handbook signed by Devon. Tuesday: laptop shipped by IT, I-9 Section 1 by Devon, payroll profile by HR. Wednesday: Okta and Google Workspace ready for November 2 by IT, UnitedHealthcare enrollment by Devon. Thursday: the direct deposit form ran a day late and a reminder was sent; desk and badge by IT. Friday: direct deposit form done by Devon, added to Gusto and acknowledged by HR. Day one, Monday, November 2: welcome lunch with Jordan Lee, I-9 Section 2 by HR, first one-on-one with Jordan Lee. 14 of 14 done.">
        <div className="card board">
          <div className="board-head"><Initials size="lg">DB</Initials><p><strong>Devon Brooks</strong><span className="sep">·</span><span>Account Executive</span><span className="sep">·</span><span>starts Mon, Nov 2</span></p></div>
          <ol className="days">
            {days.map(([day, tasks, first]) => <li key={day} className="day">
              <p className="day-name">{day}{first ? <span className="day-pill">Day one</span> : null}</p>
              <ul>{tasks.map(task => <li key={task.what + task.who + (task.note ?? '')} className={task.late ? 'task late' : 'task'}>
                {task.late ? <Clock /> : <Check />}
                <p><span>{task.what}</span>{task.note ? <small>{nb(task.note)}</small> : null}</p>
                <Initials size="sm" tone={tone[task.who]}>{task.who}</Initials>
              </li>)}</ul>
            </li>)}
          </ol>
          <p className="board-total"><Check />14 of 14 done</p>
        </div>
      </Art>
    </div>
  </section>
}
