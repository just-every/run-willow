// Human-facing recovery guidance. API responses keep their original error codes.
const ERRORS: Record<string, string> = {
  stale: 'This record changed while you were working. Reload it, review the latest information and try again.',
  payroll_stale: 'The records or file mapping changed after this draft was prepared. Discard this draft, prepare a fresh batch and preview the new file before exporting.',
  payroll_preview_required: 'Preview this payroll file before exporting it. Review the columns and resolve any issues shown.',
  payroll_preview_changed: 'This payroll preview changed. Reload the batch and review the latest file preview before exporting.',
  payroll_source_exceptions: 'This batch has unresolved payroll exceptions. Review the exceptions, correct the source records, then discard this draft and create a fresh batch.',
  complete_column_mapping_required: 'Complete the payroll file mapping in Payroll settings. Include every required column once and give each column a unique heading before saving and previewing the file.',
  draft_exists: 'A payroll draft is already open. Finish it or discard it before creating another batch.',
  batch_not_draft: 'This payroll batch has already moved past the draft stage. Open its current status before taking another action.',
  manager_cycle: 'This manager would create a reporting loop, with someone reporting back to themselves. Choose a manager outside that reporting chain and check the effective date.',
  forbidden: 'Your current access does not allow this action. Ask the owner or an access administrator to review your access.',
  credential_inactive: 'This credential is no longer awaiting approval or available for rotation. Reload the credential list to check its status. If it expired or was revoked, issue a new credential.',
  independent_approval_required: 'This action requires an independent administrator’s approval. Ask another eligible administrator to review the pending request.',
  access_changed: 'Access changed while this action was being reviewed. Reload the page and ask an access administrator to check the current permissions before trying again.',
  access_ended: 'This person’s Willow access has ended. Review their access status and restore access through the authorized access process before changing their permissions.',
  insufficient_balance: 'The leave balance does not cover this request. Review the dates and hours, or ask your leave administrator to check the balance.',
  nothing_to_accrue: 'Leave has already accrued through the selected date. Check the account’s accrued-through date and choose a later date if more accrual is due.',
  request_not_approved: 'This leave request is not currently approved. Reload it to review its current status before choosing another action.',
  tasks_open: 'Finish every open task and provide its required evidence before completing this case.',
  already_handed_off: 'This change has already been handed to payroll. Record a new change to correct it.',
  period_overlap: 'This employment period overlaps another period for this person. Review the existing start and end dates before adding it.',
  required_information_missing: 'Required information is still missing. Complete the fields listed for this case before continuing.',
  evidence_required: 'Add evidence of what was done before completing this task.',
  opening_not_signed_off: 'A leave manager must review and sign off the opening balance before it can be used.',
  overlaps_existing_leave: 'These dates overlap leave already requested or approved. Review the existing request and change or cancel it before submitting another.',
  no_working_schedule: 'Some requested days have no working schedule. Ask HR to record the correct schedule before requesting leave.',
  proposal_stale: 'The records changed after this proposal was prepared. Prepare a new proposal from the current information.',
  reviewed_fingerprint_changed: 'This import changed after review. Preview it again and review the new plan before applying it.',
  undo_blocked: 'Later changes depend on this import. Review the blockers in Move in and resolve those changes before undoing the import.',
  import_door_conflict: 'This import conflicts with current records. Open Move in, review the latest plan and any undo blockers, and resolve the listed changes before continuing.',
  invalid_audit_person: 'The person filter is invalid. Return to Audit, clear the person filter and select the person again.',
  invalid_audit_action: 'The action filter is invalid. Open Audit and choose an action from the list, or clear the filter.',
  invalid_audit_cursor: 'This audit page link is invalid. Open Audit again and use its Older or Newer links to move between pages.',
  invalid_dates: 'The date range is invalid. Enter valid start and end dates, with the end on or after the start, then apply the filters again.',
  employer_not_configured: 'Ask the owner to finish company setup before continuing.',
  record_is_immutable: 'This record is kept as history. Use the correction or cancellation action to record a change.',
  not_your_task: 'This task is assigned to someone else. Ask the assignee to complete it or an authorized administrator to reassign it.',
  not_your_decision: 'This decision belongs to another reviewer. Ask the assigned reviewer to open it.',
  authentication_required: 'Sign in again, then reopen the page and review its current status before continuing.',
  owner_required: 'The owner must perform this action. Ask them to open this page and review it.',
  initial_terms_fixed: 'Use Schedule a pay change on the Compensation card to correct starting pay before handoff. For a job change, choose an effective date after the employment start date.',
  effective_before_start: 'The effective date must be after the employment start date.',
  proposal_pay_approval_required: 'This plan sets pay. A member with People management and Read compensation must approve it.',
  work_email_taken: 'That work email already belongs to another person.',
  employee_number_taken: 'That employee number already belongs to another person.',
  invalid_column_heading: 'Each column heading must contain 1–60 printable characters and cannot start with =, +, - or @. Symbols such as # are allowed.',
  payroll_calculation_changed: 'Payroll calculation rules changed after this draft was prepared. Discard it and prepare a fresh batch.',
  internal_error: 'Willow could not finish this request. Reload the page and check its current status before trying again. If the problem continues, contact your administrator.',
}

/** Give payroll forms the recovery guidance their source and mapping fences require. */
export function formErrorCode(code: string, action: string): string {
  return code === 'stale' && ['payroll.preview', 'payroll.export'].includes(action) ? 'payroll_stale' : code
}

/** `conflict` names the person already holding a refused work email or employee number. */
export function describeError(code: string, conflict?: string | null): string {
  if (conflict && code === 'work_email_taken') return `That work email already belongs to ${conflict}.`
  if (conflict && code === 'employee_number_taken') return `That employee number already belongs to ${conflict}.`
  return Object.hasOwn(ERRORS, code) ? ERRORS[code] : 'Willow could not complete this action. Review the information on this page and try again. If the problem continues, ask your administrator for help.'
}

/** Import journals carry controlled reason text, including a dependency count. */
export function describeImportBlocker(reason: string): string {
  const dependencies = reason.match(/^(\d+) later record\(s\) depend on it$/)
  if (dependencies) {
    const count = Number(dependencies[1])
    return `${count} later record${count === 1 ? ' depends' : 's depend'} on this imported record. Review and reverse the dependent changes before undoing this import.`
  }
  if (/^Import custody was withdrawn by erasure receipt /.test(reason)) return 'An approved erasure removed this import’s retained source. Review erasure history before continuing.'
  if (reason === 'removed since import') return 'This imported record was removed later. Review its history before undoing this import.'
  if (reason === 'edited since import') return 'This imported record was changed later. Review and reverse that change before undoing this import.'
  return reason
}
