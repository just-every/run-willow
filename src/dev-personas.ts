import type { DevPersona } from './modules/operator-auth/dev/index.mjs'
import { PRESETS, type Permission } from './willow/actor'

// Local dev personas: real operators at <as>@dev.localhost, created only by
// local dev sign-in and suspended in exports. Only src/server.dev.ts uses them.
// Each is a Willow member with the permissions of a typical small team. A
// persona becomes someone's manager or an employee once HR records a person
// with the persona's work email and gives that person access.
export const PERSONA_PERMISSIONS: Record<string, { name: string; role: 'admin' | 'member'; permissions: Permission[] }> = {
  hr: { name: 'Alex Rivers (HR)', role: 'admin', permissions: PRESETS.hr },
  payroll: { name: 'Casey Moore (payroll)', role: 'member', permissions: PRESETS.payroll },
  it: { name: 'Riley Chen (IT)', role: 'member', permissions: PRESETS.it },
  manager: { name: 'Jordan Lee (manager)', role: 'member', permissions: [] },
  employee: { name: 'Sam Patel (employee)', role: 'member', permissions: [] },
}

export function devPersonas(): DevPersona[] {
  return Object.entries(PERSONA_PERMISSIONS).map(([as, persona]) => ({ as, role: persona.role, displayName: persona.name }))
}
