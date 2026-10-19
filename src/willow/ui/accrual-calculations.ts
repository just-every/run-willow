import { formatDate } from '../dates'
import { h, table } from './html'
import type { calculationsFor } from '../leave-policy'
type Calculation=Awaited<ReturnType<typeof calculationsFor>>[number]
export function accrualCalculations(calculations:Calculation[],personId:string) {
 if(!calculations.length)return ''
 return h`<details><summary>Daily accrual calculations (${calculations.length} days)</summary><p>Each day retains the reviewed policy and dated employment terms used when posted. Later corrections use approved ledger overrides.</p>${table(['Date and source','Rule','Earned / credited','Limits and carryover'],calculations.map(c=>[h`<a href="/app/people/${personId}?asOf=${c.date}#terms-${c.termsId}">${formatDate(c.date)}</a>`,`${c.kind}; ${c.tierMonths} months of service; ${c.allowance.amount} ${c.allowance.unit} annually; ${c.weeklyMinutes} scheduled minutes/week${c.eligible?'':`; no accrual: ${c.reason}`}`,`${Number(c.earnedMinutes).toFixed(6)} earned minutes; ${c.creditMinutes} credited minutes (${c.cadence})`,`${c.yearDays}-day year; balance cap ${c.capMinutes??'none'} minutes; carryover ${c.carryoverRemainingMinutes??c.carryoverPoolMinutes} minutes. ${c.carryoverEvents.map((e:Record<string,unknown>)=>e.event==='clamp'?`${e.removedMinutes} minutes above carryover cap removed`:`${e.expiredMinutes} minutes expired`).join('; ')}`]))}</details>`
}
