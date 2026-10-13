import { iconPaths, type IconName } from '../icon-paths'

export type { IconName } from '../icon-paths'

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={iconPaths[name]} />
    </svg>
  )
}
