// The homepage's words, exactly as settled in the style spec (SPEC.md Part A).
export const meta = {
  title: 'Willow — your people, looked after.',
  description: 'Free, open source HR: people records, leave, joiner to leaver checklists and exact payroll changes. MIT licensed.',
}

export const hero = {
  heading: 'Your people, looked after.',
  body: 'Willow keeps every person’s record, leave and checklist, and hands payroll exactly what changed.',
  alternatives: ['BambooHR', 'HiBob', 'Rippling'],
  run: 'Run Willow',
  docs: 'Read the docs',
  label: 'A joiner, Priya Shah, starts on 3 Nov; IT, her manager and HR each finish their task; payroll receives her start.',
  steps: {
    joiner: { title: 'Start a joiner', name: 'Priya Shah', role: 'Designer', starts: 'Starts 3 Nov' },
    tasks: { title: 'Everyone gets their task', rows: [['Laptop ready', 'IT'], ['Welcome lunch', 'Manager'], ['Contract filed', 'HR']] },
    payroll: { title: 'Payroll gets the change', line: ['start', 'Priya Shah', '3 Nov'] },
  },
}

export const sections = {
  free: { id: 'free', heading: 'Free for your whole team.', body: 'Willow is MIT licensed. Run it, change it, and keep every record.', sheet: { title: 'MIT License', line: 'Permission is hereby granted, free of charge' } },
  leave: { id: 'leave', heading: 'Leave, worked out for you.', body: 'Pick the days. Willow counts the hours from your schedule and shows who else is away.', card: { title: 'Request leave', hours: '22.80 hours from your working schedule', balance: 'Balance now 76.00 h; after this request 53.20 h.', away: 'Also away then: Jordan Lee', action: 'Submit request' } },
  private: { id: 'private', heading: 'Private stays private.', body: 'Managers see work details and leave dates, never pay or home address. Preview exactly what anyone sees.', card: { title: 'Preview what a member sees', who: 'Jordan Lee (their manager)', rows: [['Directory', 'Yes'], ['Leave balances and requests', 'Yes'], ['Compensation', 'No'], ['Private contact details', 'No']] as [string, 'Yes' | 'No'][] } },
  payroll: { id: 'payroll', heading: 'Payroll gets exactly what changed.', body: 'Each pay period, starts, changes, leavers and leave go to the provider you already use, once.', card: { title: 'Changes for 1 Nov – 14 Nov', rows: [['start', 'Priya Shah'], ['change', 'Jordan Lee'], ['leave', 'Sam Patel', '22.8 hours'], ['end', 'Tom Okafor']], action: 'Export this batch' } },
  history: { id: 'history', heading: 'Every change, kept.', body: 'Promotions, new managers and new hours take effect on their date. The history stays.', card: { title: 'Employment', rows: [['1 Mar 2025', 'Producer', 'past'], ['1 Jul 2026', 'Senior producer', 'in force'], ['1 Dec 2026', 'Head of production', 'scheduled']] } },
  moveIn: { id: 'move-in', heading: 'Bring your team from BambooHR.', body: 'Preview the import before anything is written, and undo it if it is not right.', card: { title: 'Import preview', line: 'This is a dry run: nothing has been written.', action: 'Apply import' } },
}

export const included = {
  heading: 'Also included.',
  items: ['Private documents', 'Joiner, mover and leaver checklists', 'Summaries and CSV', 'Audit trail', 'Export everything', 'Proposals from your own agent'],
}

export const close = { heading: 'Look after your people today.', body: 'Free and open source.' }

export const nav = { docs: 'Docs', source: 'Source', licence: 'MIT licence' }
