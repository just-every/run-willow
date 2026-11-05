// A leaver does not rewrite approved leave or its append-only ledger.
// Callers supply only an employment end date the current reader may see.
export interface LeaveEmploymentConflict {
  code: 'after_employment_end'
  lastEmploymentDay: string
}

export function leaveEmploymentConflict(request: { status: string; endDate: string }, lastEmploymentDay: string | null | undefined): LeaveEmploymentConflict | null {
  return request.status === 'approved' && lastEmploymentDay && request.endDate > lastEmploymentDay
    ? { code: 'after_employment_end', lastEmploymentDay }
    : null
}
