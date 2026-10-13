// Local-only Worker entry. vite.config.ts loads it only for `vite dev`; the
// deployed main stays src/server.ts, and `rer build` refuses any output that
// contains the dev layer. It adds dev sign-in, personas and the dev badge,
// and gives each persona its Willow membership once dev sign-in has created it.
import worker from './server'
import { withDevIdentity } from './modules/operator-auth/dev/index.mjs'
import { authConfig, runtimeBindings, type Bindings } from './auth.server'
import { PERSONA_PERMISSIONS, devPersonas } from './dev-personas'

const devWorker = withDevIdentity<Bindings, typeof worker>(worker, { bindings: runtimeBindings, config: authConfig, personas: devPersonas })

/** Seeds each persona's membership and permissions once, when its operator first exists; later changes are the owner's. */
async function personaMembers(env: Bindings) {
  const existing = new Set((await env.DB.prepare("SELECT email FROM wl_members WHERE email LIKE '%@dev.localhost'").all<{ email: string }>()).results.map(row => row.email))
  const missing = Object.entries(PERSONA_PERMISSIONS).filter(([as]) => !existing.has(`${as}@dev.localhost`))
  if (!missing.length) return
  await env.DB.batch(missing.flatMap(([as, persona]) => {
    const email = `${as}@dev.localhost`
    return [
      env.DB.prepare("INSERT OR IGNORE INTO wl_members (id, email, name, status, created_at) SELECT lower(hex(randomblob(16))), email, ?, 'active', ? FROM oa_operators WHERE email = ?").bind(persona.name, Date.now(), email),
      ...persona.permissions.map(permission => env.DB.prepare("INSERT OR IGNORE INTO wl_permissions (member_id, permission, granted_by, granted_at) SELECT id, ?, 'dev-persona', ? FROM wl_members WHERE email = ?").bind(permission, Date.now(), email)),
    ]
  }))
}

export default {
  ...devWorker,
  async fetch(request, env, execution) {
    await personaMembers(env)
    return devWorker.fetch!(request as never, env, execution as never) as Promise<Response>
  },
} satisfies ExportedHandler<Bindings>
