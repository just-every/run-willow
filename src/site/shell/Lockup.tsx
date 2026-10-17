import { links } from './links'

/** The lantern mark beside the "Willow" wordmark, set in the heading face. */
export function Lockup({ className = '' }: { className?: string }) {
  return <a className={`lockup ${className}`.trim()} href={links.home} aria-label="Willow home">
    <img className="lockup-mark" src="/brand/mark.svg" alt="" width="22" height="40" />
    <span className="lockup-word">Willow</span>
  </a>
}
