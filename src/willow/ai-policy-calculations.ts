import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { leaveFor } from './leave'
import type { PolicySource } from './ai-policy-context'

/** Existing native read projection only. None of these records enter a provider request. */
export async function policyCalculations(env: Bindings, actor: Actor, person: string | null, policies: PolicySource[]) {
 if (!person) return []
 const leave = await leaveFor(env,actor,person,false)
 return leave.accounts.filter(account=>account.policy && policies.some(policy=>policy.versionId===account.policy!.versionId)).map(account=>{
  const policyVersion = account.policy!.versionId
  if (account.balanceMinutes===undefined || !account.ledger) return {policyVersion,withheld:true as const}
  const entries=account.ledger.map(entry=>({kind:entry.kind,minutes:entry.minutes,date:entry.effectiveDate}))
  const calculation=account.calculations?.at(-1)
  return {policyVersion,withheld:false as const,balanceMinutes:account.balanceMinutes,openingMinutes:account.openingMinutes,
   changesMinutes:entries.filter(entry=>entry.kind!=='opening').reduce((sum,entry)=>sum+entry.minutes,0),
   cutoverDate:account.cutoverDate,accruedThrough:account.accruedThrough,entries,
   accrual:calculation?{date:calculation.date,recordedAt:calculation.recordedAt,eligible:calculation.eligible,reason:calculation.reason,
    annualMinutes:calculation.annualMinutes,yearDays:calculation.yearDays,earnedMinutes:calculation.earnedMinutes,
    creditMinutes:calculation.creditMinutes,creditBeforeCapMinutes:calculation.creditBeforeCapMinutes,capMinutes:calculation.capMinutes,
    pendingBeforeMinutes:calculation.pendingBeforeMinutes,pendingAfterMinutes:calculation.pendingAfterMinutes,
    tierMonths:calculation.tierMonths,weeklyMinutes:calculation.weeklyMinutes,cadence:calculation.cadence,
    carryoverRemainingMinutes:calculation.carryoverRemainingMinutes}:null}
 })
}
export type PolicyCalculation = Awaited<ReturnType<typeof policyCalculations>>[number]
