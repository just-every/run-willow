import { invitationResponse } from './invitation-http'
import { preboardingPage, applicantRecordsPage } from './ui/preboarding'
import { packetRecord } from './preboarding'
import { applicantRecord } from './eeo-applicants'
import { invitationRecordPage } from './ui/eeo-invitations'
import { hiringPage, hiringOpeningPage, hiringApplicationPage } from './ui/hiring'
import { reconcileRecipients } from './performance/store'
import { performancePage, reviewPage, goalsPage } from './ui/performance'
import { performanceFile } from './performance/views'
import { surveyPlanPage } from './ui/survey-plan'
import { surveyCsv } from './surveys/export'
import { surveysPage, surveyPage, surveyResultsPage } from './ui/surveys'
import { compensationPage, cyclePage, equityPage } from './ui/compensation'
import { companyPage } from './ui/company'
import { companyFile } from './company/files'
import { protectedListPage, protectedDetailPage } from './ui/protected-leave'
import { protectedCertification } from './protected-leave/records'
import { customReportsPage, customReportPage } from './ui/custom-reports'
import { customReportFile } from './reporting/files'
import { eeoSelf, diversityReport, eeoPerson, eeoPeople, mappingsView, runs, eeoRunReport, runPeople, runAggregate } from './eeo'
import { eeoSelfPage, diversityReportPage, eeoPersonPage, eeoPeoplePage } from './ui/eeo'
import { retentionPage, erasurePage, receiptPage, retainedPage, retentionReviewPage } from './ui/retention'
import { reviewList } from './retention/review'
import { erasureReceipt, retainedRecords } from './retention/view'
import { eeoAggregatePage, eeoMappingsPage, eeoRunPage, eeoRunPeoplePage, eeoRunsPage } from './ui/eeo-report'
import { selfChangesPage, selfChangePage } from './ui/self-service'
import { importForm } from './movein/forms'
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
import { employeeExport } from './employee-export'
import { employeeBundle } from './employee-bundle'
import { employer } from './employer'
import { Input } from './input'
import { batchFile } from './payroll'
import { summary, summaryCsv } from './reports'
import { tableReportCsv } from './record-tables/report'
import { h, page } from './ui/html'
import { casePage, homePage, tasksPage } from './ui/home'
import { leavePage, requestPage } from './ui/leave'
import { importPage, previewPage } from './ui/movein'
import { directoryPage, personPage } from './ui/people'
import { accessPage, customFieldsPage, employerPage, settingsPage } from './ui/settings'
import { auditPage, batchPage, payrollPage, proposalPage, proposalsPage, reportsPage } from './ui/work'
import { PAGE_DOORS, match } from './doors'
import { route } from './views'
import { connectionsPage } from './ui/connections'
import { progressPage } from './ui/progress'
import { changeRequestPage, changeRequestsPage } from './ui/change-requests'
import { changeAttachment } from './change-requests/view'
import { datesPage } from './ui/date-alerts'

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
  const invitation = await invitationResponse(env,request,url)
  if (invitation) return invitation
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
    await reconcileRecipients(env,actor.today)
    const notices = await notifyAction(env, path, result)
    return json(notices ? { ...(result as any), notices } : result)
  }
  const { view, id } = route(path)
  return json(await view(env, actor, request, id, url))
}

async function pageResponse(env: Bindings, actor: Actor, request: Request, url: URL): Promise<Response> {
  const path = url.pathname
  if (request.method === 'POST') {
    if (path === '/app/import/preview') return await previewPage(env, actor, await Input.from(request), url, request)
    if (path === '/app/import/execute') {
      const input=await Input.from(request), result=await importForm(env,actor,request,input)
      await reconcileRecipients(env,actor.today)
      if(input.text('action')==='reconcile') return page('Import reconciliation',actor,h`<p class="back"><a href="/app/import">← Move in</a></p><h1>Import reconciliation</h1><section class="card"><p>${result.ok?'The imported records agree with the reviewed source.':'Some records differ from the reviewed source.'}</p><dl><dt>Source records</dt><dd>${result.counts.sourceRecords}</dd><dt>Present</dt><dd>${result.counts.present}</dd><dt>Explained omissions</dt><dd>${result.counts.explained}</dd><dt>Native records</dt><dd>${result.counts.nativeTargets}</dd></dl></section>`,{current:'/app/import',url})
      return redirect(env,'/app/import','notice','Import updated. Review its status below.')
    }
    const name = path.match(/^\/app\/do\/([\w.]+)$/)?.[1]
    const action = name ? actions[name] : undefined
    if (!action) throw new WillowError('not_found', 404)
    const input = await Input.from(request)
    const returnTo = safeReturnTo(input.text('returnTo', { optional: true, max: 300 }) || '/app', '/app')
    try {
      const result = await action(env, actor, input, request) as { id?: string; notice?: string } | null
      await reconcileRecipients(env,actor.today)
      const notices = await notifyAction(env, name!, result)
      const failed = notices?.failure || notices?.deliveries?.some(item => ['failed','refused'].includes(item.status))
      return redirect(env, returnTo.replace('{id}', encodeURIComponent(result?.id ?? '')), 'notice', failed ? 'Saved. Email notice delivery failed; continue the work in Willow.' : result?.notice ?? 'Saved.')
    } catch (error) {
      const { code, status } = failure(error)
      if (status >= 500) throw error
      return redirect(env, returnTo.replace('/{id}', ''), 'error', code)
    }
  }
  // The owner sets up the employer before anything else.
  if (!await employer(env)) {
    if (actor.owner) return path === '/app/employer' ? employerPage(env, actor, url) : Response.redirect(`${env.AUTH_ORIGIN}/app/employer`, 303)
    return page('Not ready', actor, h`<div class="first-run"><h1>Willow is not set up yet</h1><p>The owner needs to set up the employer first.</p></div>`)
  }
  const found = match(PAGE_DOORS, path)
  if (!found) throw new WillowError('not_found', 404)
  return await pages[found.name](env, actor, request, url, found.id)
}

type Page = (env: Bindings, actor: Actor, request: Request, url: URL, id: string) => Promise<Response>
const csv = (body: string, filename: string) => new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })

const pages: Record<string, Page> = {
  preboarding: (env,actor,_request,url)=>preboardingPage(env,actor,url),
  eeoPreboarding: async (env,actor,_request,url,id)=>{const data=await packetRecord(env,actor,id);return invitationRecordPage(actor,`Preboarding EEO record: ${data.packet.name}`,data,url)},
  eeoApplicants: (env,actor,_request,url)=>applicantRecordsPage(env,actor,url),
  eeoApplicant: async (env,actor,_request,url,id)=>{const data=await applicantRecord(env,actor,id);return invitationRecordPage(actor,`Applicant EEO record: ${data.application.name}`,data,url)},
  hiring: (env,actor,request,url)=>hiringPage(env,actor,request,url),
  hiringOpening: (env,actor,request,url,id)=>hiringOpeningPage(env,actor,request,url,id),
  hiringApplication: (env,actor,_request,url,id)=>hiringApplicationPage(env,actor,url,id),
  performance: (env,actor,_request,url)=>performancePage(env,actor,url),
  performanceCycle: (env,actor,_request,url,id)=>reviewPage(env,actor,id,url),
  performanceFile: (env,actor,_request,_url,id)=>performanceFile(env,actor,id),
  goals: (env,actor,_request,url)=>goalsPage(env,actor,url),
  surveyPlan: (env,actor,_request,url,id)=>surveyPlanPage(env,actor,id,url),
  surveyCsv: (env,actor,_request,_url,id)=>surveyCsv(env,actor,id),
  surveys: (env,actor,_request,url)=>surveysPage(env,actor,url),
  survey: (env,actor,_request,url,id)=>surveyPage(env,actor,id,url),
  surveyResults: (env,actor,_request,url,id)=>surveyResultsPage(env,actor,id,url),
  compensation: (env,actor,_request,url)=>compensationPage(env,actor,url),
  compensationCycle: (env,actor,_request,url,id)=>cyclePage(env,actor,id,url),
  compensationEquity: (env,actor,_request,url)=>equityPage(env,actor,url),
  company: (env,actor,_request,url)=>companyPage(env,actor,url),
  companyFile: (env,actor,_request,_url,id)=>companyFile(env,actor,id,true),
  protectedList: (env,actor,_request,url) => protectedListPage(env,actor,url),
  protectedDetail: (env,actor,_request,url,id) => url.searchParams.has('certificate') ? protectedCertification(env,actor,id,url.searchParams.get('certificate')==='1'?undefined:url.searchParams.get('certificate')!) : protectedDetailPage(env,actor,id,url),
  customReports: (env,actor,_request,url) => customReportsPage(env,actor,url),
  customReport: (env,actor,_request,url,id) => customReportPage(env,actor,id,url),
  customReportCsv: (env,actor,_request,_url,id) => customReportFile(env,actor,id,'csv'),
  customReportXlsx: (env,actor,_request,_url,id) => customReportFile(env,actor,id,'xlsx'),
  eeoSelf: async (env,actor,_request,url) => {if(url.searchParams.has('person')) throw new WillowError('eeo_filters_not_allowed');return eeoSelfPage(actor,await eeoSelf(env,actor),url)},
  eeoPerson: async (env,actor,_request,url,id) => eeoPersonPage(actor,await eeoPerson(env,actor,id),url),
  eeoPeople: async (env,actor,_request,url) => eeoPeoplePage(actor,await eeoPeople(env,actor),url),
  eeoMappings: async (env,actor,_request,url) => eeoMappingsPage(actor,await mappingsView(env,actor),url),
  eeoRuns: async (env,actor,_request,url) => eeoRunsPage(actor,await runs(env,actor),url),
  eeoRun: async (env,actor,_request,url,id) => eeoRunPage(actor,await eeoRunReport(env,actor,id),url),
  eeoRunPeople: async (env,actor,_request,url,id) => eeoRunPeoplePage(actor,await runPeople(env,actor,id,url.searchParams),url),
  eeoRunAggregate: async (env,actor,_request,url,id) => eeoAggregatePage(actor,await runAggregate(env,actor,id),url),
  eeoReport: async (env,actor,_request,url) => diversityReportPage(actor,await diversityReport(env,actor,Object.fromEntries([...url.searchParams].filter(([k])=>!['notice','error'].includes(k)).length?url.searchParams:[['asOf',actor.today]]) as {asOf:string}),url),
  retention: (env,actor,_request,url) => retentionPage(env,actor,url),
  erasure: (env,actor,_request,url) => erasurePage(env,actor,url),
  erasureReceipt: async (env,actor,_request,url,id) => receiptPage(actor,await erasureReceipt(env,actor,id),url),
  retained: async (env,actor,_request,url) => retainedPage(actor,await retainedRecords(env,actor),url),
  retentionReview: async (env,actor,_request,url) => retentionReviewPage(actor,await reviewList(env,actor),url),
  selfChanges: (env,actor,_request,url) => selfChangesPage(env,actor,url),
  selfChange: (env,actor,_request,url,id) => selfChangePage(env,actor,id,url),
  customFields: (env, actor, _request, url) => customFieldsPage(env, actor, url),
  employeeBundle: (env, actor, request, url) => employeeBundle(env, actor, url, request),
  employeeCsv: (env, actor, _request, url) => employeeExport(env, actor, url, 'csv'),
  employeeXlsx: (env, actor, _request, url) => employeeExport(env, actor, url, 'xlsx'),
  dates: (env, actor, _request, url) => datesPage(env, actor, url),
  changes: (env, actor, _request, url) => changeRequestsPage(env, actor, url),
  change: (env, actor, _request, url, id) => url.searchParams.has('attachment') ? changeAttachment(env, actor, id, url.searchParams.get('attachment')!) : changeRequestPage(env, actor, id, url),
  connections: (env, actor, _request, url) => connectionsPage(env, actor, url),
  home: (env, actor, _request, url) => homePage(env, actor, url),
  progress: (env, actor, _request, url) => progressPage(env, actor, url),
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
  recordReportFile: async (env, actor, _request, url, id) => csv(await tableReportCsv(env, actor, id, url.searchParams.get('asOf') ?? actor.today), `willow-${id}.csv`),
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
