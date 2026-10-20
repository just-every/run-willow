// Every GET door, by name. http.ts and views.ts dispatch only through these
// lists, and the privacy proof (tests/willow/flows.mjs, WIL-03) crawls every
// entry, so a new door cannot be added without being crawled.
// Patterns are relative to /api/willow/ (API) or absolute (pages).
export const API_DOORS: [string, string][] = [
  ['^levels$', 'levels'], ['^level-reviews/([\\w-]+)$', 'levelReview'],
  ['^performance$', 'performance'], ['^performance/([\\w-]+)$', 'performanceCycle'], ['^goals$', 'goals'],
  ['^survey-plans/([\\w-]+)$', 'surveyPlan'],
  ['^surveys$', 'surveys'], ['^surveys/([\\w-]+)/results$', 'surveyResults'], ['^surveys/([\\w-]+)$', 'survey'],
  ['^compensation$', 'compensation'], ['^compensation/equity$', 'compensationEquity'], ['^compensation/([\\w-]+)$', 'compensationCycle'],
  ['^company$', 'company'], ['^company-admin$', 'companyAdmin'],
  ['^protected-leave$', 'protectedCases'], ['^protected-leave/([\\w-]+)$', 'protectedCase'], ['^leave-overrides$', 'leaveOverrides'],
  ['^custom-reports$', 'customReports'], ['^custom-reports/([\\w-]+)$', 'customReport'], ['^eeo/self$', 'eeoSelf'], ['^eeo/report$', 'eeoReport'],
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
  ['^/app/performance$', 'performance'], ['^/app/performance/([\\w-]+)\\.json$', 'performanceFile'], ['^/app/performance/([\\w-]+)$', 'performanceCycle'], ['^/app/goals$', 'goals'],
  ['^/app/survey-plans/([\\w-]+)$', 'surveyPlan'],
  ['^/app/surveys/([\\w-]+)\\.csv$', 'surveyCsv'], ['^/app/surveys$', 'surveys'], ['^/app/surveys/([\\w-]+)/results$', 'surveyResults'], ['^/app/surveys/([\\w-]+)$', 'survey'],
  ['^/app/compensation$', 'compensation'], ['^/app/compensation/equity$', 'compensationEquity'], ['^/app/compensation/([\\w-]+)$', 'compensationCycle'],
  ['^/app/company$', 'company'], ['^/app/company/files/([\\w-]+)$', 'companyFile'],
  ['^/app/protected-leave$', 'protectedList'], ['^/app/protected-leave/([\\w-]+)$', 'protectedDetail'],
  ['^/app/reports/custom$', 'customReports'], ['^/app/reports/custom/([\\w-]+)\\.csv$', 'customReportCsv'], ['^/app/reports/custom/([\\w-]+)\\.xlsx$', 'customReportXlsx'], ['^/app/reports/custom/([\\w-]+)$', 'customReport'], ['^/app/eeo/self$', 'eeoSelf'], ['^/app/eeo/report$', 'eeoReport'],
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
