// Audit codes remain unchanged in storage and the API. These are descriptions
// of completed events, rather than code identifiers with punctuation removed.
const ACTIONS: Record<string, string> = {
  'person.private.read': 'Read private person details', 'person.update': 'Updated a person’s details',
  'person.field': 'Updated a personal field', 'job.field': 'Updated a job field',
  'joiner.start': 'Started employment', 'joiner.rehire': 'Rehired a person',
  'mover.schedule': 'Scheduled an employment change', 'mover.case': 'Opened a change case',
  'leaver.start': 'Scheduled an employment end', 'case.complete': 'Completed a lifecycle case',
  'case.upgrade': 'Applied a workflow revision', 'case.upgrade.preview': 'Reviewed a workflow revision',
  'task.complete': 'Completed a task', 'task.fail': 'Recorded an unsuccessful task attempt',
  'template.create': 'Created a workflow draft', 'template.preview': 'Reviewed a workflow draft',
  'template.publish': 'Published a workflow template', 'terms.schedule': 'Scheduled employment terms',
  'terms.cancel': 'Canceled scheduled employment terms', 'period.payroll': 'Updated a payroll identifier',
  'period.entity': 'Assigned a legal entity', 'employer.configure': 'Updated employer settings',
  'location.create': 'Created a location', 'department.create': 'Created a department',
  'division.create': 'Created a division', 'department.division': 'Assigned a department to a division',
  'entity.create': 'Created a legal entity', 'schedule.create': 'Created a working schedule',
  'category.create': 'Created a document category', 'member.permissions': 'Changed a member’s access',
  'access.give': 'Granted sign-in access', 'access.end': 'Ended sign-in access',
  'access.default': 'Changed the default access level', 'access.bulk': 'Invited selected employees',
  'access.import': 'Recorded imported employees’ access decision', 'access.denied': 'Refused an access change',
  'level.level': 'Changed an access level', 'level.assignment': 'Assigned access levels',
  'level.bulk-assignment': 'Assigned access levels to selected members', 'level.revert': 'Reverted an access assignment',
  'level.preview': 'Reviewed an access change', 'policy.write': 'Saved a leave policy version',
  'policy.approve': 'Approved a leave policy', 'account.open': 'Opened a leave account',
  'account.opening.approve': 'Approved an opening leave balance', 'leave.accrue': 'Posted leave accrual',
  'leave.request': 'Requested leave', 'leave.approve': 'Approved leave', 'leave.decline': 'Declined leave',
  'leave.cancel': 'Canceled approved leave', 'leave.withdraw': 'Withdrew a leave request',
  'leave.correct': 'Corrected approved leave', 'leave.reason.read': 'Read confidential leave reasons',
  'document.download': 'Downloaded a document', 'document.upload': 'Uploaded a document',
  'document.add': 'Filed a document', 'document.acknowledge': 'Acknowledged a document',
  'employee.bundle.export': 'Exported employee records and files', 'employee.export': 'Exported employee records',
  'payroll.draft': 'Prepared a payroll batch', 'payroll.discard': 'Discarded a payroll draft',
  'payroll.export': 'Exported a payroll batch', 'payroll.acknowledge': 'Recorded payroll provider acknowledgment',
  'report.compensation.read': 'Read compensation totals', 'recordTable.private.read': 'Read a restricted record table',
  'recordRow.write': 'Saved a record table entry', 'recordRow.remove': 'Removed a record table entry',
  'customField.private.read': 'Read restricted custom fields', 'customField.define': 'Defined a custom field',
  'proposal.create': 'Submitted an employment proposal', 'proposal.approve': 'Approved an employment proposal',
  'proposal.decline': 'Declined an employment proposal', 'change.request': 'Requested an employment change',
  'change.approve': 'Approved an employment change', 'change.decline': 'Declined an employment change',
  'change.return': 'Returned an employment change for revision', 'change.edit': 'Revised an employment change request',
  'change.execute': 'Applied an approved employment change', 'change.chain': 'Changed the approval chain',
  'selfChange.request': 'Submitted a profile change for approval', 'selfChange.approve': 'Approved a profile change',
  'selfChange.reject': 'Rejected a profile change', 'selfChange.reconcile': 'Recorded downstream follow-up',
  'company.announce': 'Published an announcement', 'company.acknowledge': 'Acknowledged an announcement',
  'company.folder': 'Published a shared folder', 'company.file': 'Published a company file',
  'company.file.download': 'Downloaded a company file', 'company.celebrations': 'Changed celebration preferences',
  'apiKey.issue': 'Issued an API credential', 'apiKey.rotate': 'Replaced an API credential',
  'apiKey.revoke': 'Revoked an API credential', 'apiKey.approve': 'Approved an API credential',
  'apiKey.invalidate': 'Stopped an API credential after access changed', 'apiKey.list.read': 'Read the API credential list',
  'apiKey.read': 'Used an API credential', 'apiKey.denied.read': 'Refused an API credential request',
  'apiKey.rate_limited.read': 'Limited API credential requests', 'oauth.token.read': 'Issued an OAuth access token',
  'erasure.preview': 'Reviewed a personal-data erasure', 'erasure.confirm': 'Confirmed a personal-data erasure',
  'retention.read': 'Read retention settings', 'retained.read': 'Read retained records',
  'import.apply': 'Applied an import', 'import.undo': 'Undid an import',
}

const DOMAINS: Record<string, string> = {
  person: 'person records', people: 'person records', terms: 'employment terms', period: 'employment records',
  joiner: 'new employment', mover: 'employment changes', leaver: 'employment endings', case: 'lifecycle cases', task: 'tasks',
  template: 'workflow templates', employer: 'employer settings', location: 'locations', department: 'departments',
  division: 'divisions', entity: 'legal entities', schedule: 'working schedules', category: 'document categories',
  member: 'members', access: 'sign-in access', level: 'access levels', policy: 'leave policies', account: 'leave accounts',
  leave: 'leave records', document: 'documents', employee: 'employee records', payroll: 'payroll batches',
  report: 'reports', reports: 'reports', recordTable: 'record tables', recordRow: 'record table entries',
  customField: 'custom fields', proposal: 'employment proposals', change: 'employment change requests',
  selfChange: 'profile changes', self: 'profile changes', company: 'company publications',
  apiKey: 'API credentials', oauth: 'OAuth access', compensation: 'compensation records',
  hiring: 'hiring records', preboarding: 'preboarding records', eeo: 'EEO compliance records',
  signature: 'signature requests', training: 'training records', performance: 'performance reviews',
  goal: 'goals', survey: 'surveys', protectedLeave: 'protected leave', protected: 'protected leave',
  retention: 'retention settings', retained: 'retained records', erasure: 'personal-data erasure',
  import: 'imports', connection: 'connections', connections: 'connections', webhook: 'webhooks',
  ai: 'assistant settings and requests', model: 'model drafts', workflow: 'workflows', reminder: 'reminders',
  dateAlert: 'date alerts', signing: 'signature requests', agent: 'agent activity',
}
const VERBS: Record<string, string> = {
  read: 'Read', download: 'Downloaded', export: 'Exported', create: 'Created',
  approve: 'Approved', reject: 'Rejected', decline: 'Declined', cancel: 'Canceled',
  update: 'Updated', edit: 'Revised', write: 'Saved', publish: 'Published',
  preview: 'Reviewed', complete: 'Completed', request: 'Requested changes to',
  delete: 'Deleted', remove: 'Removed', revoke: 'Revoked access to',
  schedule: 'Scheduled', configure: 'Configured', define: 'Defined',
  acknowledge: 'Acknowledged', invite: 'Sent an invitation for', withdraw: 'Withdrew',
  send: 'Sent', apply: 'Applied changes to', stop: 'Stopped', pause: 'Paused', resume: 'Resumed',
}

export function auditActionLabel(action: string): string {
  if (Object.hasOwn(ACTIONS, action)) return ACTIONS[action]
  const parts = action.split('.'), domain = DOMAINS[parts[0]]
  const verb = VERBS[parts.at(-1)!]
  return domain ? verb ? `${verb} ${domain}` : `Recorded activity for ${domain}` : 'Recorded a Willow action'
}

/** A removed or restricted record still has a useful kind, never a raw ID. */
export function auditRecordKind(action: string): string {
  const root = action.split('.')[0], domain = DOMAINS[root]
  const kinds: Record<string, string> = {
    person: 'Person record', terms: 'Employment terms', period: 'Employment record',
    payroll: 'Payroll batch', apiKey: 'API credential', oauth: 'OAuth access',
    company: 'Company publication', leave: 'Leave record', account: 'Leave account',
    task: 'Lifecycle task', case: 'Lifecycle case', proposal: 'Employment proposal',
    recordTable: 'Record table', recordRow: 'Record table entry', level: 'Access level',
    access: 'Sign-in access', document: 'Document', template: 'Workflow template',
  }
  return kinds[root] ?? (domain ? domain[0].toUpperCase() + domain.slice(1) : 'Willow record')
}
