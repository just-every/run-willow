// The pieces every section is made of. Text in the drawings is real text; the
// drawings are HTML and CSS (styles/cards.css), never screenshots.
import type { ReactNode } from 'react'

/** One idea: eyebrow, heading and a short paragraph beside its drawing; `flip` puts the drawing first, `wide` gives a
 * long heading the larger share of the row. */
export function Feature({ id, eyebrow, title, children, art, label, flip = false, wide = false }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode; art: ReactNode; label: string; flip?: boolean; wide?: boolean }) {
  return <section id={id} className={`feature${flip ? ' flip' : ''}${wide ? ' wide' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="feature-copy">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="feature-body">{children}</p>
    </div>
    <div className="feature-art" role="img" aria-label={label}><div aria-hidden="true">{art}</div></div>
  </section>
}

/** Two features to one band, as the desk pairs them. */
export const Pair = ({ children, className = '' }: { children: ReactNode; className?: string }) =>
  <div className={`pair ${className}`.trim()}><div className="site-wrap pair-grid">{children}</div></div>

/** A painted plate: AVIF, then WebP, at the sizes public/site holds, with an optional phone crop. */
export function Painting({ name, widths, sizes, className, phone, eager = false }: { name: string; widths: number[]; sizes: string; className?: string; phone?: { name: string; widths: number[]; media: string }; eager?: boolean }) {
  const set = (n: string, ws: number[], ext: string) => ws.map(w => `/site/${n}-${w}.${ext} ${w}w`).join(', ')
  return <picture className={className}>
    {phone && <source media={phone.media} type="image/avif" srcSet={set(phone.name, phone.widths, 'avif')} sizes="100vw" />}
    {phone && <source media={phone.media} type="image/webp" srcSet={set(phone.name, phone.widths, 'webp')} sizes="100vw" />}
    <source type="image/avif" srcSet={set(name, widths, 'avif')} sizes={sizes} />
    <img src={`/site/${name}-${Math.max(...widths)}.webp`} srcSet={set(name, widths, 'webp')} sizes={sizes} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} />
  </picture>
}

/** Done: a white tick on a green disc. `soft` is the pale disc with a green tick. */
export const Check = ({ soft = false }: { soft?: boolean }) =>
  <svg className={soft ? 'check soft' : 'check'} viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" /><path d="m7.2 12.3 3.1 3.1 6.5-6.7" /></svg>
/** Needs attention: an exclamation on an orange disc. */
export const Alert = () => <svg className="alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" /><path d="M12 6.5v7" /><circle className="dot" cx="12" cy="17.4" r="1.4" /></svg>
/** Waiting on a date: a clock ring. */
export const Clock = ({ tone = 'orange' }: { tone?: 'orange' | 'accent' }) =>
  <svg className={`clock ${tone}`} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5.2l3.2 2" /></svg>
export const Tick = () => <svg className="tick" viewBox="0 0 16 16"><path d="m3 8.6 3.1 3.1L13 4.8" /></svg>

/** Initials on a tinted disc; the desk's people are never photographs in the sections. */
export const Initials = ({ children, tone = 'pink', size = 'md' }: { children: string; tone?: 'pink' | 'lavender'; size?: 'sm' | 'md' | 'lg' }) =>
  <span className={`initials ${tone} ${size}`}>{children}</span>

const PATHS: Record<string, ReactNode> = {
  server: <><rect x="3.5" y="4" width="17" height="7" rx="2" /><rect x="3.5" y="13" width="17" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5c.4-3.3 2.6-5.3 5.5-5.3s5.1 2 5.5 5.3" /><circle cx="16.6" cy="8.6" r="2.6" /><path d="M16.2 13.6c2.6.1 4.1 2 4.4 5" /></>,
  export: <><path d="M12 14.5V3.5M7.8 7.7 12 3.5l4.2 4.2" /><path d="M5 11.5v8h14v-8" /></>,
  org: <><circle cx="12" cy="5.5" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="18" r="2.4" /><path d="M12 8v4M6 15.6V12h12v3.6" /></>,
  review: <><path d="M7 3h7.5L19 7.5V21H7z" /><path d="M14 3v5h5M9.8 13.6l2.2 2.2 4-4.3" /></>,
  pulse: <><rect x="4.5" y="12" width="3" height="8" rx="1.2" /><rect x="10.5" y="8" width="3" height="12" rx="1.2" /><rect x="16.5" y="4" width="3" height="16" rx="1.2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  form: <><path d="M7 3h7.5L19 7.5V21H7z" /><path d="M14 3v5h5M10 13h6M10 16.5h6" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2.2" /></>,
  group: <><circle cx="12" cy="8" r="3" /><path d="M6.5 19c.4-3 2.7-5 5.5-5s5.1 2 5.5 5" /><circle cx="5.6" cy="10" r="2.2" /><circle cx="18.4" cy="10" r="2.2" /><path d="M2.5 18c.2-2 1.4-3.4 3.2-3.7M21.5 18c-.2-2-1.4-3.4-3.2-3.7" /></>,
}
export const Icon = ({ name, className = '' }: { name: keyof typeof PATHS | string; className?: string }) =>
  <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24">{PATHS[name]}</svg>

