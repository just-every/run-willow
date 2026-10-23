// Every GET door, by name. http.ts and views.ts dispatch only through these
// lists, and the privacy proof (tests/willow/flows.mjs, WIL-03) crawls every
// entry, so a new door cannot be added without being crawled.
// Patterns are relative to /api/willow/ (API) or absolute (pages).
export const API_DOORS: [string, string][] = [
  ['^api-credentials$','apiCredentials'],['^setting-areas/locations$','settingLocations'],['^setting-areas/schedules$','settingSchedules'],['^setting-areas/document-categories$','settingCategories'],['^setting-areas/payroll-connections$','settingPayroll'],['^setting-areas/sign-in$','settingSecurity'],['^setting-areas/retention$','settingRetention'],
  ['^preboarding$', 'preboarding'], ['^eeo/preboarding/([\\w-]+)$', 'eeoPreboarding'],
  ['^eeo/applicants$', 'eeoApplicants'], ['^eeo/applicants/([\\w-]+)$', 'eeoApplicant'],
  ['^hiring$', 'hiring'], ['^hiring/openings/([\\w-]+)$', 'hiringOpening'], ['^hiring/applications/([\\w-]+)$', 'hiringApplication'],
  ['^levels$', 'levels'], ['^level-reviews/([\\w-]+)$', 'levelReview'],
  ['^performance$', 'performance'], ['^performance/([\\w-]+)$', 'performanceCycle'], ['^goals$', 'goals'],
  ['^survey-plans/([\\w-]+)$', 'surveyPlan'],
  ['^surveys$', 'surveys'], ['^surveys/([\\w-]+)/results$', 'surveyResults'], ['^surveys/([\\w-]+)$', 'survey'],
  ['^compensation$', 'compensation'], ['^compensation/equity$', 'compensationEquity'], ['^compensation/([\\w-]+)$', 'compensationCycle'],
  ['^company$', 'company'], ['^company-admin$', 'companyAdmin'],
  ['^protected-leave$', 'protectedCases'], ['^protected-leave/([\\w-]+)$', 'protectedCase'], ['^leave-overrides$', 'leaveOverrides'],
  ['^builtin-reports$', 'builtinReports'], ['^builtin-reports/([\\w-]+)$', 'builtinReport'],
  ['^custom-reports$', 'customReports'], ['^custom-reports/([\\w-]+)$', 'customReport'], ['^eeo/self$', 'eeoSelf'], ['^eeo/report$', 'eeoReport'],
  ['^eeo/person/([\\w-]+)$', 'eeoPerson'], ['^eeo/people$', 'eeoPeople'], ['^eeo/mappings$', 'eeoMappings'], ['^eeo/runs$', 'eeoRuns'], ['^eeo/runs/([\\w-]+)$', 'eeoRun'], ['^eeo/runs/([\\w-]+)/people$', 'eeoRunPeople'], ['^eeo/runs/([\\w-]+)/aggregate$', 'eeoRunAggregate'],
  ['^retention$', 'retention'], ['^erasure/preview$', 'erasurePreview'], ['^erasure/receipts/([\\w-]+)$', 'erasureReceipt'], ['^retained$', 'retained'], ['^retention/review$', 'retentionReview'],
  ['^self-changes$', 'selfChanges'], ['^self-changes/([\\w-]+)$', 'selfChange'], ['^self-exceptions$', 'selfExceptions'],
  ['^custom-fields$', 'customFields'], ['^record-tables$', 'recordTables'], ['^record-tables/([a-z][a-z0-9_]*)$', 'recordReport'],
  ['^upcoming-dates$', 'upcomingDates'], ['^change-requests$', 'changeRequests'], ['^change-requests/([\\w-]+)$', 'changeRequest'],
  ['^work$', 'work'], ['^connections$', 'connections'], ['^payroll-layout$', 'payrollLayout'], ['^model-drafts$', 'modelDrafts'], ['^model-drafts/([\\w-]+)$', 'modelDraft'],
  ['^progress$', 'progress'], ['^me$', 'me'], ['^permissions$', 'permissions'], ['^settings$', 'settings'], ['^members$', 'members'], ['^preview$', 'preview'],
  ['^people$', 'people'], ['^organization$', 'organization'], ['^people/([\\w-]+)$', 'person'], ['^context/([\\w-]+)$', 'context'], ['^templates$', 'templates'], ['^cases/([\\w-]+)$', 'case'],
  ['^tasks$', 'tasks'], ['^policies$', 'policies'], ['^leave/([\\w-]+)$', 'leave'], ['^approvals$', 'approvals'], ['^quote$', 'quote'],
  ['^payroll$', 'payroll'], ['^payroll/([\\w-]+)$', 'batch'], ['^reports$', 'reports'], ['^proposals$', 'proposals'], ['^proposals/([\\w-]+)$', 'proposal'],
  ['^import-settings$', 'importSettings'], ['^imports$', 'imports'], ['^audit$', 'audit'],
]

export const PAGE_DOORS: [string, string][] = [
  ['^/app/settings/webhooks$','webhooks'],
  ['^/app/api-credentials$','apiCredentials'],['^/app/settings/locations$','settingLocations'],['^/app/settings/schedules$','settingSchedules'],['^/app/settings/document-categories$','settingCategories'],['^/app/settings/payroll-connections$','settingPayroll'],['^/app/settings/sign-in$','settingSecurity'],['^/app/settings/retention$','settingRetention'],
  ['^/app/reports/library$', 'builtinReports'], ['^/app/reports/library/([\\w-]+)\\.csv$', 'builtinReportCsv'], ['^/app/reports/library/([\\w-]+)\\.xlsx$', 'builtinReportXlsx'], ['^/app/reports/library/([\\w-]+)$', 'builtinReport'],
  ['^/app/preboarding$', 'preboarding'], ['^/app/eeo/preboarding/([\\w-]+)$', 'eeoPreboarding'],
  ['^/app/eeo/applicants$', 'eeoApplicants'], ['^/app/eeo/applicants/([\\w-]+)$', 'eeoApplicant'],
  ['^/app/hiring$', 'hiring'], ['^/app/hiring/openings/([\\w-]+)$', 'hiringOpening'], ['^/app/hiring/applications/([\\w-]+)$', 'hiringApplication'],
  ['^/app/performance$', 'performance'], ['^/app/performance/([\\w-]+)\\.json$', 'performanceFile'], ['^/app/performance/([\\w-]+)$', 'performanceCycle'], ['^/app/goals$', 'goals'],
  ['^/app/survey-plans/([\\w-]+)$', 'surveyPlan'],
  ['^/app/surveys/([\\w-]+)\\.csv$', 'surveyCsv'], ['^/app/surveys$', 'surveys'], ['^/app/surveys/([\\w-]+)/results$', 'surveyResults'], ['^/app/surveys/([\\w-]+)$', 'survey'],
  ['^/app/compensation$', 'compensation'], ['^/app/compensation/equity$', 'compensationEquity'], ['^/app/compensation/([\\w-]+)$', 'compensationCycle'],
  ['^/app/company$', 'company'], ['^/app/company/files/([\\w-]+)$', 'companyFile'],
  ['^/app/protected-leave$', 'protectedList'], ['^/app/protected-leave/([\\w-]+)$', 'protectedDetail'],
  ['^/app/reports/custom$', 'customReports'], ['^/app/reports/custom/([\\w-]+)\\.csv$', 'customReportCsv'], ['^/app/reports/custom/([\\w-]+)\\.xlsx$', 'customReportXlsx'], ['^/app/reports/custom/([\\w-]+)$', 'customReport'], ['^/app/eeo/self$', 'eeoSelf'], ['^/app/eeo/report$', 'eeoReport'],
  ['^/app/eeo/person/([\\w-]+)$', 'eeoPerson'], ['^/app/eeo/person$', 'eeoPeople'], ['^/app/eeo/mappings$', 'eeoMappings'], ['^/app/eeo/runs$', 'eeoRuns'], ['^/app/eeo/runs/([\\w-]+)$', 'eeoRun'], ['^/app/eeo/runs/([\\w-]+)/people$', 'eeoRunPeople'], ['^/app/eeo/runs/([\\w-]+)/aggregate$', 'eeoRunAggregate'],
  ['^/app/retention$', 'retention'], ['^/app/retention/erasure$', 'erasure'], ['^/app/retention/receipts/([\\w-]+)$', 'erasureReceipt'], ['^/app/retention/retained$', 'retained'], ['^/app/retention/review$', 'retentionReview'],
  ['^/app/self-changes$', 'selfChanges'], ['^/app/self-changes/([\\w-]+)$', 'selfChange'],
  ['^/app/custom-fields$', 'customFields'], ['^/app/reports/tables/([a-z][a-z0-9_]*)\\.csv$', 'recordReportFile'],
  ['^/app/exports/employees\\.zip$', 'employeeBundle'],
  ['^/app/exports/employees\\.csv$', 'employeeCsv'], ['^/app/exports/employees\\.xlsx$', 'employeeXlsx'],
  ['^/app/dates$', 'dates'], ['^/app/changes$', 'changes'], ['^/app/changes/([\\w-]+)$', 'change'],
  ['^/app/connections$', 'connections'],
  ['^/app$', 'home'], ['^/app/progress$', 'progress'], ['^/app/employer$', 'employer'], ['^/app/tasks$', 'tasks'], ['^/app/people$', 'people'], ['^/app/people/([\\w-]+)$', 'person'],
  ['^/app/cases/([\\w-]+)$', 'case'], ['^/app/leave$', 'leave'], ['^/app/leave/([\\w-]+)$', 'request'], ['^/app/settings$', 'settings'], ['^/app/access$', 'access'],
  ['^/app/payroll$', 'payroll'], ['^/app/payroll/([\\w-]+)\\.csv$', 'batchFile'], ['^/app/payroll/([\\w-]+)$', 'batch'], ['^/app/reports$', 'reports'], ['^/app/reports\\.csv$', 'reportsFile'],
  ['^/app/proposals$', 'proposals'], ['^/app/proposals/([\\w-]+)$', 'proposal'], ['^/app/import$', 'import'], ['^/app/audit$', 'audit'], ['^/app/files/document/([\\w-]+)$', 'document'],
]

export function match(doors: [string, string][], path: string): { name: string; id: string } | null {
  for (const [pattern, name] of doors) {
    const found = path.match(new RegExp(pattern))
    if (found) return { name, id: found[1] ?? '' }
  }
  return null
}

/** Bearer invitations are independent of employee admission and expose one EEO record only. */
export const INVITATION_DOORS: [string,string][] = [
 ['^/preboarding/([A-Za-z0-9_-]+)$','preboarding'],
 ['^/applicant-self-id/([A-Za-z0-9_-]+)$','applicant'],
]

/** Credential-only versioned reads; exercised as a complete library by the API journey. */
export const V1_API_DOORS: [string,string][] = [
 ['^webhooks$','v1Webhooks'],['^webhooks/([\\w-]+)/deliveries$','v1WebhookLog'],
 ['^employees$','v1Employees'],['^employees/([\\w-]+)$','v1Employee'],
 ['^organization$','v1Organization'],['^custom-fields$','v1CustomFields'],
 ['^tables$','v1Tables'],['^tables/([a-z][a-z0-9_]*)$','v1Table'],
 ['^balances$','v1Balances'],['^requests$','v1Requests'],['^calendar$','v1Calendar'],
 ['^documents$','v1Documents'],['^documents/([\\w-]+)/download$','v1DocumentFile'],
 ['^access-level$','v1AccessLevel'],
]

/** Public machine-readable documentation contains no employer data. */
export const PUBLIC_API_DOORS:[string,string][]=[['^/api/willow/v1/openapi\\.json$','openapi']]
