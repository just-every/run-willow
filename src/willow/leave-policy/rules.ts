// Structured policy definitions belong to one reviewed version forever.
import type { Bindings } from '../../auth.server'
import { insist, one, stmt } from '../core'
import { isDate } from '../dates'

import { EMPLOYMENT_TYPES } from '../people'
export { EMPLOYMENT_TYPES }
export interface Allowance { unit: 'hours' | 'days' | 'weeks'; amount: number; dayMinutes?: number }
export interface Tier { afterMonths: number; allowance: Allowance }
export interface Carryover { capMinutes: number | null; expiresOn: string | null }
export interface Variant { tiers: Tier[]; capMinutes: number | null; carryover: Carryover }
export interface LocationVariant extends Variant { locationId: string; reviewNote: string }
export interface LeaveRules extends Variant {
  kind: 'vacation' | 'sick' | 'unpaid'
  eligibility: { employmentTypes: string[]; waitingDays: number }
  cadence: 'daily' | 'monthly' | 'annual'
  proration: 'calendar_days'
  locations: LocationVariant[]
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k))
const integer = (v: unknown, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max
const nullableMinutes = (v: unknown) => v === null || integer(v, 10_000_000)

function validAllowance(v: unknown): v is Allowance {
  if (!object(v) || !keys(v, ['unit', 'amount', 'dayMinutes'])) return false
  if (typeof v.amount !== 'number' || !Number.isFinite(v.amount) || v.amount < 0 || v.amount > 10_000) return false
  if (v.unit === 'days') return integer(v.dayMinutes, 1440) && (v.dayMinutes as number) > 0
  return (v.unit === 'hours' || v.unit === 'weeks') && v.dayMinutes === undefined && (v.unit !== 'weeks' || v.amount <= 52)
}

function validVariant(v: Record<string, unknown>): boolean {
  if (!Array.isArray(v.tiers) || !v.tiers.length || v.tiers.length > 30 || !nullableMinutes(v.capMinutes) || !object(v.carryover)) return false
  const carry = v.carryover
  if (!keys(carry, ['capMinutes', 'expiresOn']) || !nullableMinutes(carry.capMinutes)) return false
  if (carry.expiresOn !== null && (typeof carry.expiresOn !== 'string' || !/^\d{2}-\d{2}$/.test(carry.expiresOn) || !isDate(`2001-${carry.expiresOn}`))) return false
  let previous = -1
  for (const tier of v.tiers) {
    if (!object(tier) || !keys(tier, ['afterMonths', 'allowance']) || !integer(tier.afterMonths, 1200) || (tier.afterMonths as number) <= previous || !validAllowance(tier.allowance)) return false
    if (previous === -1 && tier.afterMonths !== 0) return false
    previous = tier.afterMonths as number
  }
  return true
}

/** Missing rules denote an original weeks-only policy. Malformed rules are refused. */
export function validateRules(input: unknown): LeaveRules | null {
  if (input === undefined || input === null || input === '') return null
  let v: unknown = input
  if (typeof input === 'string') {
    insist(input.length <= 40_000, 'invalid_policy_rules')
    try { v = JSON.parse(input) } catch { insist(false, 'invalid_policy_rules') }
  }
  insist(object(v) && keys(v, ['kind', 'eligibility', 'tiers', 'cadence', 'proration', 'capMinutes', 'carryover', 'locations']), 'invalid_policy_rules')
  insist(['vacation', 'sick', 'unpaid'].includes(v.kind as string) && ['daily', 'monthly', 'annual'].includes(v.cadence as string) && v.proration === 'calendar_days', 'invalid_policy_rules')
  insist(object(v.eligibility) && keys(v.eligibility, ['employmentTypes', 'waitingDays']) && integer(v.eligibility.waitingDays, 3650), 'invalid_policy_eligibility')
  const types = v.eligibility.employmentTypes
  insist(Array.isArray(types) && types.length > 0 && new Set(types).size === types.length && types.every(t => (EMPLOYMENT_TYPES as readonly unknown[]).includes(t)), 'invalid_policy_eligibility')
  insist(validVariant(v), 'invalid_policy_tiers')
  insist(Array.isArray(v.locations) && v.locations.length <= 50, 'invalid_policy_locations')
  const ids = new Set<string>()
  for (const loc of v.locations) {
    insist(object(loc) && keys(loc, ['locationId', 'reviewNote', 'tiers', 'capMinutes', 'carryover']) && typeof loc.locationId === 'string' && loc.locationId.length > 0 && loc.locationId.length <= 100 && !ids.has(loc.locationId), 'invalid_policy_locations')
    insist(typeof loc.reviewNote === 'string' && loc.reviewNote.trim().length > 0 && loc.reviewNote.length <= 1000 && validVariant(loc), 'unreviewed_policy_location')
    ids.add(loc.locationId)
  }
  if (v.kind === 'unpaid') insist([v, ...v.locations].every(variant => (variant.tiers as Tier[]).every(t => t.allowance.amount === 0)), 'unpaid_policy_cannot_accrue')
  return v as unknown as LeaveRules
}

export function writeRuleStatement(env: Bindings, versionId: string, rules: LeaveRules) {
  validateRules(rules)
  return stmt(env, 'INSERT INTO wl_leave_policy_rules (version_id, rules_json) VALUES (?, ?)', versionId, JSON.stringify(rules))
}

export async function readRules(env: Bindings, versionId: string): Promise<LeaveRules | null> {
  const row = await one<{ rules_json: string }>(env, 'SELECT rules_json FROM wl_leave_policy_rules WHERE version_id = ?', versionId)
  return row ? validateRules(row.rules_json) : null
}
