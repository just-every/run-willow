import { links } from './links'

export function Lockup() {
  return (
    <a className="hp-lockup" href={links.home}>
      <img src="/brand/mark.svg" alt="" width="32" height="32" />
      <span>Willow</span>
    </a>
  )
}
