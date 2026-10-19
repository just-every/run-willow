// Every GET door, by name. http.ts and views.ts dispatch only through these
// lists, and the privacy proof (tests/willow/flows.mjs, WIL-03) crawls every
// entry, so a new door cannot be added without being crawled.
// Patterns are relative to /api/willow/ (API) or absolute (pages).
export const API_DOORS: [string, string][] = [
  ['^work$', 'work'], ['^connections$', 'connections'], ['^payroll-layout$', 'payrollLayout'], ['^model-drafts$', 'modelDrafts'], ['^model-drafts/([\\w-]+)$', 'modelDraft'],
  ['^me$', 'me'], ['^permissions$', 'permissions'], ['^settings$', 'settings'], ['^members$', 'members'], ['^preview$', 'preview'],
  ['^people$', 'people'], ['^organization$', 'organization'], ['^people/([\\w-]+)$', 'person'], ['^context/([\\w-]+)$', 'context'], ['^templates$', 'templates'], ['^cases/([\\w-]+)$', 'case'],
  ['^tasks$', 'tasks'], ['^policies$', 'policies'], ['^leave/([\\w-]+)$', 'leave'], ['^approvals$', 'approvals'], ['^quote$', 'quote'],
  ['^payroll$', 'payroll'], ['^payroll/([\\w-]+)$', 'batch'], ['^reports$', 'reports'], ['^proposals$', 'proposals'], ['^proposals/([\\w-]+)$', 'proposal'],
  ['^imports$', 'imports'], ['^audit$', 'audit'],
]

export const PAGE_DOORS: [string, string][] = [
  ['^/app/exports/employees\\.zip$', 'employeeBundle'],
  ['^/app/exports/employees\\.csv$', 'employeeCsv'], ['^/app/exports/employees\\.xlsx$', 'employeeXlsx'],
  ['^/app/connections$', 'connections'],
  ['^/app$', 'home'], ['^/app/employer$', 'employer'], ['^/app/tasks$', 'tasks'], ['^/app/people$', 'people'], ['^/app/people/([\\w-]+)$', 'person'],
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
