// The pieces every section is made of. Text in the drawings is real text; the
// drawings are HTML and CSS (styles/cards.css and the section styles), never screenshots.
import type { ReactNode } from 'react'

/** A month of the year: eyebrow, heading and its paragraph. `center` sets them over a full-width drawing. */
export function ChapterHead({ id, eyebrow, title, children, center = false, className = '' }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode; center?: boolean; className?: string }) {
  return <header className={`chapter-head${center ? ' center' : ''} ${className}`.trim()}>
    <p className="eyebrow">{eyebrow}</p>
    <h2 id={`${id}-title`}>{title}</h2>
    <p className="chapter-body">{children}</p>
  </header>
}

/** A drawing: hidden from the accessibility tree and described once by `label`. */
export const Art = ({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) =>
  <div className={`chapter-art ${className}`.trim()} role="img" aria-label={label}><div aria-hidden="true">{children}</div></div>

/** Keeps each separator on the line of the word before it, so no wrapped line starts with "·", "›" or "→". */
export const nb = (text: string) => text.replace(/ ([·›→])/g, '\u00a0$1')

/** A separator inside running text: glued to the word before it, with a break allowed after it. */
export const Sep = () => <>{'\u00a0'}<span className="sep in-text">·</span>{' '}</>

/** A painted plate: AVIF, then WebP, at the sizes public/site holds, with an optional phone crop. */
export function Painting({ name, widths, sizes, className, phone, eager = false }: { name: string; widths: number[]; sizes: string; className?: string; phone?: { name: string; widths: number[]; media: string }; eager?: boolean }) {
  const set = (n: string, ws: number[], ext: string) => ws.map(w => `/site/${n}-${w}.${ext} ${w}w`).join(', ')
  return <picture className={className}>
    {phone && <source media={phone.media} type="image/avif" srcSet={set(phone.name, phone.widths, 'avif')} sizes="100vw" />}
    {phone && <source media={phone.media} type="image/webp" srcSet={set(phone.name, phone.widths, 'webp')} sizes="100vw" />}
    <source type="image/avif" srcSet={set(name, widths, 'avif')} sizes={sizes} />
    <img src={`/site/${name}-1536.webp`} srcSet={set(name, widths, 'webp')} sizes={sizes} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} />
  </picture>
}

/** The full-bleed plates' widths: 1x and 2x of the page from phones to 2560 wide screens. */
export const PLATE_WIDTHS = [768, 1152, 1536, 2304, 3072]

/** Done: a white tick on a green disc. `soft` is the pale disc with a green tick. */
export const Check = ({ soft = false }: { soft?: boolean }) =>
  <svg className={soft ? 'check soft' : 'check'} viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" /><path d="m7.2 12.3 3.1 3.1 6.5-6.7" /></svg>
/** Needs attention: an exclamation on an orange disc. */
export const Alert = () => <svg className="alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" /><path d="M12 6.5v7" /><circle className="dot" cx="12" cy="17.4" r="1.4" /></svg>
/** Waiting on a date: a white clock on an orange disc. */
export const Clock = () =>
  <svg className="clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" /><path d="M12 6.8v5.4l3.4 2.1" /></svg>
export const Tick = () => <svg className="tick" viewBox="0 0 16 16"><path d="m3 8.6 3.1 3.1L13 4.8" /></svg>
/** A thin right arrow between two values. */
export const Arrow = () => <svg className="arrow" viewBox="0 0 20 20"><path d="M3 10h13M11 5l5 5-5 5" /></svg>

/** Initials on a tinted disc; the year's people are never photographs in the sections. */
export const Initials = ({ children, tone = 'lavender', size = 'md' }: { children: string; tone?: 'pink' | 'lavender' | 'blue'; size?: 'sm' | 'md' | 'lg' }) =>
  <span className={`initials ${tone} ${size}`}>{children}</span>

const PATHS: Record<string, ReactNode> = {
  group: <><circle cx="12" cy="8" r="3" /><path d="M6.5 19c.4-3 2.7-5 5.5-5s5.1 2 5.5 5" /><circle cx="5.6" cy="10" r="2.2" /><circle cx="18.4" cy="10" r="2.2" /><path d="M2.5 18c.2-2 1.4-3.4 3.2-3.7M21.5 18c-.2-2-1.4-3.4-3.2-3.7" /></>,
  person: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5.5 19.5c.6-3.6 3.1-5.6 6.5-5.6s5.9 2 6.5 5.6" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.4-3.3 2.6-5.3 5.5-5.3s5.1 2 5.5 5.3" /><circle cx="16.6" cy="9" r="2.6" /><path d="M16.2 14c2.6.1 4.1 2 4.4 5" /></>,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.2" /><circle cx="12" cy="7.8" r=".6" /></>,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  seal: <path d="M12 2.5l2.2 1.6 2.7-.2 1 2.5 2.4 1.3-.5 2.7L21 12.5l-1.4 2.3.5 2.7-2.4 1.3-1 2.5-2.7-.2L12 22.5l-2.2-1.6-2.7.2-1-2.5-2.4-1.3.5-2.7L3 12.5l1.2-2.1-.5-2.7L6.1 6.4l1-2.5 2.7.2z" />,
}
export const Icon = ({ name, className = '' }: { name: keyof typeof PATHS | string; className?: string }) =>
  <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24">{PATHS[name]}</svg>
