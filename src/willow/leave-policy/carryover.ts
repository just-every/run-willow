// A year's reviewed carryover pool retains its own expiry after a transfer.
// Settlement remains revisable by additive ledger entries when an old absence
// is cancelled/corrected, without restoring already-expired entitlement.
import type { Row } from '../core'
import { addDays } from '../dates'
import { spentFromCarryover, vested, type LedgerRow } from './balances'
import type { Variant } from './rules'

export interface CarryoverPool {
  year: string
  initial_minutes: number
  expires_on: string | null
  expired_minutes: number
  settled: number
  dirty?: boolean
}
type Post = (date: string, event: string, minutes: number, note: string) => string | null

export function applyCarryover(date: string, versionId: string, variant: Variant, locationId: string | null, ledger: LedgerRow[], pools: CarryoverPool[], post: Post) {
  const events: Row[] = [], ledgerIds: string[] = []
  let settlementToday = 0
  for (const pool of pools) {
    if (!pool.expires_on || date <= pool.expires_on) continue
    const spent = spentFromCarryover(ledger, pool.year, pool.expires_on)
    const target = Math.max(0, pool.initial_minutes - spent)
    const delta = target - pool.expired_minutes
    if (!pool.settled || delta !== 0) {
      const id = post(date, 'carryover_expiry', -delta, `Carryover from ${pool.year}, last usable ${pool.expires_on}: ${pool.initial_minutes} minutes originally; ${spent} used first; ${target} total expiry (${delta} this settlement); policy version ${versionId}`)
      if (id) ledgerIds.push(id)
      events.push({ event: pool.settled ? 'expiry_reconciliation' : 'expiry', year: pool.year, initialMinutes: pool.initial_minutes, usedMinutes: spent,
        expiredMinutes: delta, totalExpiredMinutes: target, lastUsableDate: pool.expires_on })
      settlementToday -= delta
      pool.expired_minutes = target
      pool.settled = 1
      pool.dirty = true
    }
  }
  const year = date.slice(0, 4)
  if (date.endsWith('-01-01') && !pools.some(pool => pool.year === year)) {
    const before = Math.max(0, vested(ledger, addDays(date, -1)) + settlementToday)
    const carry = variant.carryover.capMinutes === null ? before : Math.min(before, variant.carryover.capMinutes)
    const removed = before - carry
    const id = post(date, 'carryover_clamp', -removed, `January 1 carryover clamp: ${before} to ${carry} minutes; location ${locationId ?? 'none'}; policy version ${versionId}`)
    if (id) ledgerIds.push(id)
    const expires = variant.carryover.expiresOn ? `${year}-${variant.carryover.expiresOn}` : null
    pools.push({ year, initial_minutes: carry, expires_on: expires, expired_minutes: 0, settled: 0, dirty: true })
    events.push({ event: 'clamp', beforeMinutes: before, carryoverMinutes: carry, removedMinutes: removed, capMinutes: variant.carryover.capMinutes, lastUsableDate: expires })
  }
  return { events, ledgerIds, pool: pools.find(pool => pool.year === year) ?? null }
}
