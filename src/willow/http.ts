// Willow's public doors: /app pages, /app/do/ACTION form posts, /api/willow
// JSON, and access-checked downloads. Every request resolves the signed-in
// member first; private data is never served to a signed-out request.
import { runtimeBindings, type Bindings } from '../auth.server'
import { AuthError, safeReturnTo } from '../modules/operator-auth/index.mjs'
import { notifyAction } from './notices'
import { actions } from './actions'
import { currentActor, type Actor } from './actor'
import { WillowError } from './core'
import { documentFile } from './documents'
import { employer } from './employer'
import { Input } from './input'
import { batchFile } from './payroll'
import { summary, summaryCsv } from './reports'
import { h, page } from './ui/html'
import { casePage, homePage, tasksPage } from './ui/home'
import { leavePage, requestPage } from './ui/leave'
import { importPage, previewPage } from './ui/movein'
import { directoryPage, personPage } from './ui/people'
import { accessPage, employerPage, settingsPage } from './ui/settings'
import { auditPage, batchPage, payrollPage, proposalPage, proposalsPage, reportsPage } from './ui/work'
import { PAGE_DOORS, match } from './doors'
import { route } from './views'
import { connectionsPage } from './ui/connections'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })

function failure(error: unknown): { code: string; status: number; detail?: unknown } {
  if (error instanceof WillowError) return { code: error.code, status: error.status, detail: error.detail }
  if (error instanceof AuthError) return { code: error.code, status: error.status }
  const code = error instanceof Error ? error.message : ''
  if (/^(IMPORT_|PROVENANCE_|TARGET_|NATIVE_EDIT_CONFLICT|REVERSAL_|UNDO_|CREDENTIAL_IN_DURABLE_DATA|SOURCE_|DUPLICATE_)/.test(code)) return { code: code.split(/[:\s]/)[0].toLowerCase(), status: 409 }
  console.error('willow_internal_error', error)
  return { code: 'internal_error', status: 500 }
}

export async function willowResponse(request: Request, original: Bindings): Promise<Response | null> {
  const env = runtimeBindings(original)
  const url = new URL(request.url)
  const api = url.pathname.startsWith('/api/willow/')
  if (!api && url.pathname !== '/app' && !url.pathname.startsWith('/app/')) return null
  if (request.method === 'POST' && request.headers.get('origin') !== env.AUTH_ORIGIN) return api ? json({ error: 'invalid_origin' }, 403) : new Response('Forbidden', { status: 403 })
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, POST' } })
  let actor: Actor | null = null
  try {
    actor = await currentActor(env, request)
    if (!actor) return api ? json({ error: 'authentication_required' }, 401) : Response.redirect(`${env.AUTH_ORIGIN}/signin?returnTo=${encodeURIComponent(url.pathname)}`, 303)
    if (api) return await apiResponse(env, actor, request, url)
    return await pageResponse(env, actor, request, url)
  } catch (error) {
    const { code, status, detail } = failure(error)
    if (api) return json({ error: code, ...(detail === undefined ? {} : { detail }) }, status)
    if (status === 404) return page('Not found', actor, h`<h1>Not found</h1><p>There is nothing here you can open.</p><p><a href="/app">Back to Willow</a></p>`, { status: 404 })
    return page('Something went wrong', actor, h`<h1>That did not work</h1><p>${code.replace(/_/g, ' ')}</p><p><a href="/app">Back to Willow</a></p>`, { status })
  }
}

async function apiResponse(env: Bindings, actor: Actor, request: Request, url: URL) {
  const path = url.pathname.slice('/api/willow/'.length)
  if (request.method === 'POST') {
    const action = actions[path]
    if (!action) throw new WillowError('not_found', 404)
    const result = await action(env, actor, await Input.from(request), request)
    const notices = await notifyAction(env, path, result)
    return json(notices ? { ...(result as any), notices } : result)
  }
  const { view, id } = route(path)
  return json(await view(env, actor, request, id, url))
}

async function pageResponse(env: Bindings, actor: Actor, request: Request, url: URL): Promise<Response> {
  const path = url.pathname
  if (request.method === 'POST') {
    if (path === '/app/import/preview') return await previewPage(env, actor, await Input.from(request), url)
    const name = path.match(/^\/app\/do\/([\w.]+)$/)?.[1]
    const action = name ? actions[name] : undefined
    if (!action) throw new WillowError('not_found', 404)
    const input = await Input.from(request)
    const returnTo = safeReturnTo(input.text('returnTo', { optional: true, max: 300 }) || '/app', '/app')
    try {
      const result = await action(env, actor, input, request) as { id?: string } | null
      const notices = await notifyAction(env, name!, result)
      const failed = notices?.failure || notices?.deliveries?.some(item => ['failed','refused'].includes(item.status))
      return redirect(env, returnTo.replace('{id}', encodeURIComponent(result?.id ?? '')), 'notice', failed ? 'Saved. Email notice delivery failed; continue the work in Willow.' : 'Saved.')
    } catch (error) {
      const { code, status } = failure(error)
      if (status >= 500) throw error
      return redirect(env, returnTo.replace('/{id}', ''), 'error', code)
    }
  }
  // The owner sets up the employer before anything else.
  if (!await employer(env)) {
    if (actor.owner) return path === '/app/employer' ? employerPage(env, actor, url) : Response.redirect(`${env.AUTH_ORIGIN}/app/employer`, 303)
    return page('Not ready', actor, h`<div class="first-run"><h1>Willow is not set up yet</h1><p>The owner needs to set up the employer first.</p></div>`, { art: 'frame' })
  }
  const found = match(PAGE_DOORS, path)
  if (!found) throw new WillowError('not_found', 404)
  return await pages[found.name](env, actor, request, url, found.id)
}

type Page = (env: Bindings, actor: Actor, request: Request, url: URL, id: string) => Promise<Response>
const csv = (body: string, filename: string) => new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })

const pages: Record<string, Page> = {
  connections: (env, actor, _request, url) => connectionsPage(env, actor, url),
  home: (env, actor, _request, url) => homePage(env, actor, url),
  employer: (env, actor, _request, url) => employerPage(env, actor, url),
  tasks: (env, actor, _request, url) => tasksPage(env, actor, url),
  people: (env, actor, _request, url) => directoryPage(env, actor, url),
  person: (env, actor, _request, url, id) => personPage(env, actor, id, url),
  case: (env, actor, _request, url, id) => casePage(env, actor, id, url),
  leave: (env, actor, _request, url) => leavePage(env, actor, url),
  request: (env, actor, _request, url, id) => requestPage(env, actor, id, url),
  settings: (env, actor, _request, url) => settingsPage(env, actor, url),
  access: (env, actor, request, url) => accessPage(env, actor, request, url),
  payroll: (env, actor, _request, url) => payrollPage(env, actor, url),
  batchFile: (env, actor, _request, _url, id) => batchFile(env, actor, id),
  batch: (env, actor, _request, url, id) => batchPage(env, actor, id, url),
  reports: (env, actor, _request, url) => reportsPage(env, actor, url),
  reportsFile: async (env, actor, _request, url) => csv(summaryCsv(await summary(env, actor, url)), 'willow-summary.csv'),
  proposals: (env, actor, _request, url) => proposalsPage(env, actor, url),
  proposal: (env, actor, _request, url, id) => proposalPage(env, actor, id, url),
  import: (env, actor, _request, url) => importPage(env, actor, url),
  audit: (env, actor, _request, url) => auditPage(env, actor, url),
  document: (env, actor, _request, url, id) => documentFile(env, actor, id, url.searchParams.has('download')),
}

function redirect(env: Bindings, target: string, key: 'notice' | 'error', value: string) {
  const location = new URL(target, env.AUTH_ORIGIN)
  location.searchParams.set(key, value)
  return new Response(null, { status: 303, headers: { location: location.pathname + location.search, 'cache-control': 'no-store' } })
}
