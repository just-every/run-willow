// Read models served at GET /api/willow/... Every view applies the same access
// rules as the pages that render it.
import type { Bindings } from '../auth.server'
import { PERMISSION_LABELS, requirePermission, type Actor } from './actor'
import { WillowError, all } from './core'
import { employer, settings } from './employer'
import { Input } from './input'
import { approvals, leaveDetail, policies, quote } from './leave'
import { caseDetail, myTasks, templates } from './lifecycle'
import { members, visibilityPreview } from './members'
import { importJobs } from './movein/bamboohr'
import { batchDetail, batches } from './payroll'
import { directory, personView } from './profile'
import { directoryFilters, filterDirectory, organizationChart } from './organization'
import { API_DOORS, match } from './doors'
import { context, proposalDetail, proposals } from './proposals'
import { summary } from './reports'

import { connections } from './connections'
import { layoutView } from './payroll-layout'
import { modelDraft, modelDrafts } from './model-drafts'

type View = (env: Bindings, actor: Actor, request: Request, id: string, url: URL) => Promise<unknown>

export async function audit(env: Bindings, actor: Actor) {
  requirePermission(actor, 'audit.read')
  return await all(env, 'SELECT seq, at, actor, action, subject, detail FROM wl_audit ORDER BY seq DESC LIMIT 500')
}

const query = (url: URL) => Input.of(Object.fromEntries(url.searchParams))

export const views: Record<string, View> = {
  connections,
  payrollLayout: layoutView,
  modelDrafts,
  modelDraft: (env, actor, _request, id) => modelDraft(env, actor, id),
  me: async (env, actor) => ({ id: actor.id, email: actor.email, name: actor.name, owner: actor.owner, person: actor.personId, permissions: [...actor.permissions], manages: [...actor.reports], today: actor.today, employer: await employer(env) }),
  permissions: async () => PERMISSION_LABELS,
  settings: env => settings(env),
  members: (env, actor, request) => members(env, actor, request),
  preview: (env, actor, _request, _id, url) => visibilityPreview(env, actor, url.searchParams.get('member') ?? '', url.searchParams.get('person') ?? ''),
  people: async (env, actor, _request, _id, url) => {
    const filters = directoryFilters(url.searchParams, actor.today)
    return filterDirectory(await directory(env, actor, filters.date), filters)
  },
  organization: async (env, actor, _request, _id, url) => {
    const filters = directoryFilters(url.searchParams, actor.today)
    return organizationChart(await directory(env, actor, filters.date), filters.date)
  },
  person: (env, actor, _request, id, url) => personView(env, actor, id === 'me' ? actor.personId ?? '' : id, { asOf: url.searchParams.get('asOf') ?? undefined }),
  context: (env, actor, _request, id, url) => context(env, actor, id, url.searchParams.get('asOf') ?? undefined),
  templates: async (env, actor) => { requirePermission(actor, 'people.manage'); return await templates(env) },
  case: (env, actor, _request, id) => caseDetail(env, actor, id),
  tasks: (env, actor) => myTasks(env, actor),
  policies: env => policies(env),
  leave: (env, actor, _request, id) => leaveDetail(env, actor, id),
  approvals: (env, actor) => approvals(env, actor),
  quote: (env, actor, _request, _id, url) => quote(env, actor, query(url)),
  payroll: (env, actor) => batches(env, actor),
  batch: (env, actor, _request, id) => batchDetail(env, actor, id),
  reports: (env, actor, _request, _id, url) => summary(env, actor, url),
  proposals: (env, actor) => proposals(env, actor),
  proposal: (env, actor, _request, id) => proposalDetail(env, actor, id),
  imports: (env, actor) => importJobs(env, actor),
  audit: (env, actor) => audit(env, actor),
}

export function route(path: string): { view: View; id: string } {
  const found = match(API_DOORS, path)
  if (!found) throw new WillowError('not_found', 404)
  return { view: views[found.name], id: found.id }
}
