import { runPurgeScheduler } from './willow/retention/purge'
import { runLeaveScheduler } from './willow/leave-policy'
import { runReportScheduler } from './willow/reporting/schedule'
import { withDemo } from './modules/demo/index.mjs'
import { seedDemo } from './demo'
import start from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'
import { dispatch } from './base/dispatch'
import { authResponse, runtimeBindings, type Bindings } from './auth.server'
import { importDoorResponse } from './willow/movein/door'
import { willowResponse } from './willow/http'
import { runWorkScheduler } from './willow/work-scheduler'
import { willowFrame } from './willow/frame'

import { lobbyResponse } from './base/lobby'
import { setupStateResponse } from './base/setup-state'
import { identity } from './identity'
import { staticAssetResponse } from './base/static-assets'
import { deploymentHealth } from './base/deployment-health'

const documentResponse = (response: Response): Response => {
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  const headers = new Headers(response.headers)
  const cache = headers.get('cache-control')
  headers.set('cache-control', cache ? `${cache}, no-transform` : 'no-transform')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const api = new Hono<{ Bindings: Bindings }>()
api.get('/health', (context) => context.json({ status: 'ok', ...deploymentHealth(context.env) }))

export default withDemo({
  async scheduled(event, env) {
    await runLeaveScheduler(runtimeBindings(env), event.scheduledTime)
    await runReportScheduler(runtimeBindings(env), event.scheduledTime)
    await runWorkScheduler(runtimeBindings(env), event.scheduledTime)
    await runPurgeScheduler(runtimeBindings(env), event.scheduledTime)
  },
  async fetch(request, env, execution) {
    const asset = await staticAssetResponse(request, env)
    if (asset) return documentResponse(asset)
    env = runtimeBindings(env)
    const lobby = await lobbyResponse(request, env, identity)
    if (lobby) return documentResponse(lobby)
    const state = await setupStateResponse(request, env)
    if (state) return state
    const imported = await importDoorResponse(request, env)
    if (imported) return imported
    const auth = await authResponse(request, env)
    if (auth) return documentResponse(await willowFrame(auth))
    const willow = await willowResponse(request, env)
    if (willow) return documentResponse(willow)
    return documentResponse(await dispatch(request, () => api.fetch(request, env, execution), () => start.fetch(request)))
  },
} satisfies ExportedHandler<Bindings>, { seed: seedDemo })
