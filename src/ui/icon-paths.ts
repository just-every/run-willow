// Shared line-icon paths for the landing drawings and server-rendered app pages.
export const iconPaths = {
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 19.5c.6-3.2 3.3-5.5 6.5-5.5s5.9 2.3 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .7 3.2 2.6 3.5 5.1',
  envelope: 'M3.5 6.5h17v11h-17zM4 7l8 6 8-6',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.5l3.5 2',
  pencil: 'M15.5 4.5l4 4L9 19l-5 1 1-5zM13.5 6.5l4 4',
  minus: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12h8',
  check: 'M5.5 12.5l4 4 9-9',
  cross: 'M8 8l8 8M16 8l-8 8',
  document: 'M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4M9 12h6M9 15h6M9 18h4',
  checklist: 'M4 6.5l1.5 1.5 3-3M4 12.5l1.5 1.5 3-3M4 18.5l1.5 1.5 3-3M11 6.5h9M11 12.5h9M11 18.5h9',
  chart: 'M5 20V14h3v6zM10.5 20V10h3v10zM16 20V5h3v15z',
  shield: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6zM8.5 12l2.5 2.5 4.5-5',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v6h14v-6',
  sparkle: 'M10 4c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6ZM18 3c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5Z',
  arrow: 'M4 12h15M14 7l5 5-5 5',
} as const

export type IconName = keyof typeof iconPaths
