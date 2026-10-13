import { Actions } from './Actions'
import { hero } from './copy'
import { Icon } from './Icon'

// The hero: headline, the free line, the actions, and a sparse 1-2-3 of a joiner
// from start to payroll, drawn as the real cards in fine ink.
export function Hero() {
  const { joiner, tasks, payroll } = hero.steps
  const [first, second, last] = hero.alternatives
  return (
    <section className="hp-hero" id="top">
      <div className="hp-hero-copy">
        <h1>{hero.heading}</h1>
        <p className="hp-lead">{hero.body}</p>
        <p className="hp-free">100% free, open source alternative to <strong>{first}</strong>, <strong>{second}</strong> and <strong>{last}</strong></p>
        <Actions />
      </div>
      <figure className="hp-steps" aria-label={hero.label}>
        <ol>
          <li>
            <p className="hp-step-title"><span className="hp-num" aria-hidden="true">1</span>{joiner.title}</p>
            <div className="hp-card hp-joiner">
              <span className="hp-disc"><Icon name="person" /></span>
              <p><strong>{joiner.name}</strong><span>{joiner.role}</span><span>{joiner.starts}</span></p>
            </div>
          </li>
          <li>
            <p className="hp-step-title"><span className="hp-num" aria-hidden="true">2</span>{tasks.title}</p>
            <ul className="hp-card hp-tasks">
              {tasks.rows.map(([task, who]) => (
                <li key={task}><span className="hp-check"><Icon name="check" /></span>{task} · {who}</li>
              ))}
            </ul>
          </li>
          <li>
            <p className="hp-step-title"><span className="hp-num" aria-hidden="true">3</span>{payroll.title}</p>
            <div className="hp-card hp-payroll">
              <p className="hp-change"><span className="hp-disc hp-disc-gold"><Icon name="document" /></span>{payroll.line.join(' · ')}</p>
            </div>
          </li>
        </ol>
      </figure>
      <img className="hp-river" src="/homepage/river.webp" alt="" />
    </section>
  )
}
