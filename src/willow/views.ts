import { signatureRequests,signatureRequest } from './sign/requests'
import { signatureTemplates } from './sign/templates'
import { policyEscalations } from './ai-policy-escalations'
import { handbookSources } from './ai-handbooks'
import { aiWorkflows, aiWorkflow, aiWorkflowApprovals } from './ai-workflows'
import { aiControls } from './ai-provider'
import { listCredentials } from './api-credentials'
import { settingAreaData } from './ui/settings-areas'
import { builtinReports,runBuiltinReport } from './reporting/builtins'
import { insist } from './core'
import { packets, packetRecord } from './preboarding'
import { applicantRecord, applicantRecordsList } from './eeo-applicants'
import { hiringOpenings, hiringOpening, hiringApplication } from './hiring'
import { selfWriteModes } from './levels/personal'
import { levels } from './levels/store'
import { levelReview } from './levels/actions'
import { performanceHome, performanceDetail } from './performance/views'
import { goalHome } from './performance/goals'
import { ownSurveyPlan } from './surveys/plans'
import { surveyList, surveyDetail } from './surveys/views'
import { surveyResults } from './surveys/results'
import { compensationHome, compensationCycle } from './compensation/cycles'
import { equityReport } from './compensation/equity'
import { companyHome,companyAdmin } from './company/views'
import { companyTeam } from './company-team'
import { protectedCases, protectedCase } from './protected-leave/records'
import { leaveOverrides } from './protected-leave/overrides'
import { savedReports, savedReport } from './reporting/definitions'
import { runReport } from './reporting/execute'
import { scheduleStatus } from './reporting/schedule'
import { eeoSelf, diversityReport, eeoPerson, eeoPeople, mappingsView, runs, eeoRunReport, runPeople, runAggregate } from './eeo'
import { retention, erasurePreview, erasureReceipt, retainedRecords } from './retention/view'
import { reviewList } from './retention/review'
import { selfChanges, selfChange, selfExceptions } from './self-service/view'
import { listFieldDefinitions } from './custom-fields/store'
import { listRecordTables } from './record-tables/schema'
import { tableReport } from './record-tables/rows'
import { doorSettings } from './movein/authority'
import { changeRequest, changeRequests } from './change-requests/view'
import { upcomingDates } from './date-alerts/view'
// Read models served at GET /api/willow/... Every view applies the same access
// rules as the pages that render it.
import type { Bindings } from '../auth.server'
import { PERMISSION_LABELS, can, requirePermission, type Actor } from './actor'
import { WillowError, all } from './core'
import { employer, settings } from './employer'
import { Input } from './input'
import { readablePolicies, approvals, leaveDetail, policies, quote } from './leave'
import { caseDetail, myTasks, templates } from './lifecycle'
import { members, visibilityPreview } from './members'
import { importJobs } from './movein/bamboohr'
import { batchDetail, batches } from './payroll'
import { directory, personView } from './profile'
import { directoryFilters, filterDirectory, organizationChart } from './organization'
import { API_DOORS, match } from './doors'
import { context, proposalDetail, proposals } from './proposals'
import { summary } from './reports'

import { connections,connectionOverview } from './connections'
import { layoutView } from './payroll-layout'
import { modelDraft, modelDrafts } from './model-drafts'

type View = (env: Bindings, actor: Actor, request: Request, id: string, url: URL) => Promise<unknown>

export async function audit(env: Bindings, actor: Actor) {
  requirePermission(actor, 'audit.read')
  return await all(env, 'SELECT seq, at, actor, action, subject, detail FROM wl_audit ORDER BY seq DESC LIMIT 500')
}

const query = (url: URL) => Input.of(Object.fromEntries(url.searchParams))

import { workList } from './work'
import { progress } from './progress'

export const views: Record<string, View> = {
  signatureRequests,signatureRequest:(env,actor,_request,id)=>signatureRequest(env,actor,id),
  signatureTemplates,
  policyEscalations,
  handbooks: (env,actor) => handbookSources(env,actor),
  handbookManagement: (env,actor) => handbookSources(env,actor,{manage:true}),
  aiControls, aiWorkflowApprovals, aiWorkflows, aiWorkflow:(env,actor,_request,id)=>aiWorkflow(env,actor,id),
  apiCredentials:listCredentials,
  settingLocations:(env,actor)=>settingAreaData(env,actor,'locations'),settingSchedules:(env,actor)=>settingAreaData(env,actor,'schedules'),settingCategories:(env,actor)=>settingAreaData(env,actor,'document-categories'),settingPayroll:(env,actor)=>settingAreaData(env,actor,'payroll-connections'),settingSecurity:(env,actor)=>settingAreaData(env,actor,'sign-in'),settingRetention:(env,actor)=>settingAreaData(env,actor,'retention'),
  preboarding: packets, eeoPreboarding: (env,actor,_request,id)=>packetRecord(env,actor,id),
  eeoApplicants: applicantRecordsList, eeoApplicant: (env,actor,_request,id)=>applicantRecord(env,actor,id),
  hiring: hiringOpenings, hiringOpening: (env,actor,_request,id)=>hiringOpening(env,actor,id), hiringApplication: (env,actor,_request,id)=>hiringApplication(env,actor,id),
  performance: performanceHome, performanceCycle: (env,actor,_request,id)=>performanceDetail(env,actor,id), goals: goalHome,
  surveyPlan: (env,actor,_request,id)=>ownSurveyPlan(env,actor,id),
  surveys: surveyList, survey: (env,actor,_request,id)=>surveyDetail(env,actor,id),
  surveyResults: (env,actor,_request,id,url)=>surveyResults(env,actor,id,Object.fromEntries(url.searchParams)),
  compensation: compensationHome,
  compensationCycle: (env,actor,_request,id)=>compensationCycle(env,actor,id),
  compensationEquity: (env,actor,_request,_id,url)=>equityReport(env,actor,Object.fromEntries(url.searchParams) as {asOf:string;level:string}),
  company: async(env,actor)=>({...await companyHome(env,actor),...await companyTeam(env,actor)}),
  companyAdmin,
  protectedCases,
  protectedCase: (env,actor,_request,id) => protectedCase(env,actor,id),
  leaveOverrides,
  builtinReports,
  builtinReport:(env,actor,_request,id,url)=>runBuiltinReport(env,actor,id,url),
  customReports: savedReports,
  customReport: async (env,actor,_request,id) => {const report=await savedReport(env,actor,id);return {report,result:await runReport(env,actor,report.definition,report.id),schedule:await scheduleStatus(env,actor,id)}},
  eeoPerson: (env,actor,_request,id,url) => { if([...url.searchParams.keys()].length) throw new WillowError('eeo_filters_not_allowed');return eeoPerson(env,actor,id) }, eeoPeople: (env,actor) => eeoPeople(env,actor),
  eeoMappings: (env,actor) => mappingsView(env,actor), eeoRuns: (env,actor) => runs(env,actor), eeoRun: (env,actor,_request,id) => eeoRunReport(env,actor,id),
  eeoRunPeople: (env,actor,_request,id,url) => runPeople(env,actor,id,url.searchParams), eeoRunAggregate: (env,actor,_request,id) => runAggregate(env,actor,id),
  eeoSelf: (env,actor,_request,_id,url) => { if([...url.searchParams.keys()].length) throw new WillowError('eeo_filters_not_allowed');return eeoSelf(env,actor) },
  eeoReport: (env,actor,_request,_id,url) => diversityReport(env,actor,Object.fromEntries(url.searchParams.size?url.searchParams:[['asOf',actor.today]]) as {asOf:string}),
  retained: (env,actor) => retainedRecords(env,actor), retentionReview: (env,actor) => reviewList(env,actor), erasureReceipt: (env,actor,_request,id) => erasureReceipt(env,actor,id),
  retention: (env,actor,_request,_id,url) => retention(env,actor,url.searchParams.get('asOf') ?? undefined), erasurePreview: (env,actor,_request,_id,url) => erasurePreview(env,actor,url),
  selfChanges,
  selfChange: (env,actor,_request,id) => selfChange(env,actor,id),
  selfExceptions,
  customFields: (env, actor, _request, _id, url) => listFieldDefinitions(env, actor, url.searchParams.get('asOf') ?? actor.today),
  recordTables: (env, actor) => listRecordTables(env, actor),
  recordReport: async (env, actor, _request, id, url) => { const asOf = url.searchParams.get('asOf') ?? actor.today; return tableReport(env, actor, id, asOf, await directory(env, actor, asOf)) },
  upcomingDates: (env, actor) => upcomingDates(env, actor),
  changeRequests: (env, actor) => changeRequests(env, actor),
  changeRequest: (env, actor, _request, id) => changeRequest(env, actor, id),
  work: workList,
  progress: (env, actor, _request, _id, url) => progress(env, actor, url.searchParams.get('select') ?? ''),
  connections:(env,actor)=>actor.owner?connections(env,actor):connectionOverview(env,actor),
  payrollLayout: layoutView,
  modelDrafts,
  modelDraft: (env, actor, _request, id) => modelDraft(env, actor, id),
  levels: (env, actor) => levels(env,actor),
  levelReview: (env, actor, request, id) => levelReview(env,actor,id!),
  me: async (env, actor) => ({ id: actor.id, email: actor.email, name: actor.name, owner: actor.owner, person: actor.personId, permissions: [...actor.permissions], scoped: actor.scoped.map(grant => ({ level: grant.level, scope: grant.scope, permissions: [...grant.permissions].sort(), people: grant.people.size })), selfWriteModes: await selfWriteModes(env,actor), manages: [...actor.reports], today: actor.today, employer: await employer(env) }),
  permissions: async () => PERMISSION_LABELS,
  settings: async (env,actor) => { insist(can(actor,'people.manage')||can(actor,'leave.manage'),'forbidden',403); return settings(env) },
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
  policies: (env,actor) => readablePolicies(env,actor),
  leave: (env, actor, _request, id) => leaveDetail(env, actor, id),
  approvals: (env, actor) => approvals(env, actor),
  quote: (env, actor, _request, _id, url) => quote(env, actor, query(url)),
  payroll: (env, actor) => batches(env, actor),
  batch: (env, actor, _request, id) => batchDetail(env, actor, id),
  reports: (env, actor, _request, _id, url) => summary(env, actor, url),
  proposals: (env, actor) => proposals(env, actor),
  proposal: (env, actor, _request, id) => proposalDetail(env, actor, id),
  importSettings: (env, actor) => doorSettings(env, actor),
  imports: (env, actor) => importJobs(env, actor),
  audit: (env, actor) => audit(env, actor),
}

export function route(path: string): { view: View; id: string } {
  const found = match(API_DOORS, path)
  if (!found) throw new WillowError('not_found', 404)
  return { view: views[found.name], id: found.id }
}
