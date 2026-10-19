export interface LedgerRow { id: string; kind: string; minutes: number; effective_date: string; event: string | null }

/** Reservations affect available funds, but not the vested funds tested for policy caps. */
export const vested = (rows: LedgerRow[], date: string) => rows.reduce((sum, r) => sum + (r.effective_date <= date && r.kind !== 'reservation' && r.kind !== 'release' ? r.minutes : 0), 0)

/** A reservation and its later use must never consume a carryover pool twice. */
export function spentFromCarryover(rows: LedgerRow[], year: string, through: string): number {
  const change = rows.reduce((sum, r) => {
    if (r.event || r.effective_date < `${year}-01-01` || r.effective_date > through) return sum
    if (r.kind === 'use' || r.kind === 'reversal') return sum + r.minutes
    return sum + (r.kind === 'adjustment' ? Math.min(0, r.minutes) : 0)
  }, 0)
  return Math.max(0, -change)
}
