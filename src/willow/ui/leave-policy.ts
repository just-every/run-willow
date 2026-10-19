// LEAVE-001 policy controls extend the existing settings forms and card style.
import type { Row } from '../core'
import type { LeaveRules, Variant } from '../leave-policy'
import { EMPLOYMENT_TYPES } from '../people'
import { TYPE_LABELS } from './labels'
import { checks, field, h, select, table } from './html'

export function policyRuleFields(locations: Row[]) {
 return h`<details><summary>Scheduled PTO rules</summary><fieldset><legend>Scheduled US PTO (optional)</legend>
<p>Use these controls for a scheduled policy, or leave the kind blank to retain the weekly allowance above. The owner reviews the complete draft before activation. Rules are employer supplied; no statutory entitlement is inferred.</p>
${select('Scheduled policy kind','ruleKind',[{value:'vacation',label:'Vacation'},{value:'sick',label:'Sick'},{value:'unpaid',label:'Unpaid'}],'',{required:false,blank:'Use weekly allowance'})}
${select('Credit cadence','ruleCadence',[{value:'daily',label:'Daily'},{value:'monthly',label:'Month end'},{value:'annual',label:'Year end'}],'monthly',{required:false})}
${select('Allowance unit','ruleUnit',[{value:'hours',label:'Hours per year'},{value:'days',label:'Days per year'},{value:'weeks',label:'Weeks of dated scheduled hours per year'}],'hours',{required:false})}
${field('Minutes in a policy day','ruleDayMinutes',{value:'480',required:false})}
${checks('Eligible employment types','ruleTypes',EMPLOYMENT_TYPES.map(value=>({value,label:TYPE_LABELS[value]})),['full_time','part_time'])}
${field('Waiting period (calendar days)','ruleWaitingDays',{value:'0',required:false})}
${[0,1,2].map(i=>h`<fieldset><legend>Service tier ${i+1}</legend>${field('Completed service months',`ruleMonths${i}`,{value:i===0?'0':'',required:false})}${field('Annual allowance',`ruleAmount${i}`,{value:i===0?'120':'',required:false})}</fieldset>`)}
${field('Maximum balance (hours, blank for no cap)','ruleCapHours',{required:false})}
${field('January 1 carryover maximum (hours, blank for all)','ruleCarryHours',{required:false})}
${field('Carryover expires (MM-DD, optional)','ruleExpiry',{required:false})}
<p>Location variants use the same tiers, units and carryover controls. A reviewed variant replaces the base allowance and limits on each day in that location.</p>
${[0,1].map(i=>h`<fieldset><legend>Location variant ${i+1}</legend>${select('Work location',`ruleLocation${i}`,locations.map(l=>({value:l.id,label:l.name})),'',{required:false,blank:'No variant'})}${field('Review reference',`ruleLocationReview${i}`,{required:false})}${[0,1,2].map(t=>field(`Tier ${t+1} annual allowance`,`ruleLocationAmount${i}_${t}`,{required:false}))}${field('Maximum balance (hours, optional)',`ruleLocationCap${i}`,{required:false})}${field('Carryover maximum (hours, optional)',`ruleLocationCarry${i}`,{required:false})}${field('Carryover expires (MM-DD, optional)',`ruleLocationExpiry${i}`,{required:false})}</fieldset>`)}
<p class="muted">Credits prorate by actual calendar days in the year; month/year end credits are earned in arrears. Service restarts with each employment period. Corrections after posting use a dated, reasoned override; prior calculations remain immutable.</p></fieldset></details>`
}

export function policyRuleSummary(rules: LeaveRules,locations:Row[]) {
 const variant=(r:Variant)=>h`${table(['Service from','Annual allowance'],r.tiers.map(t=>[`${t.afterMonths} completed months`,`${t.allowance.amount} ${t.allowance.unit}${t.allowance.unit==='days'?` (${t.allowance.dayMinutes} minutes per day)`:t.allowance.unit==='weeks'?' of scheduled hours':''}`]))}<p>Balance cap: ${r.capMinutes===null?'none':`${r.capMinutes} minutes`}. January 1 carryover: ${r.carryover.capMinutes===null?'all unused minutes':`at most ${r.carryover.capMinutes} minutes`}.${r.carryover.expiresOn?` Last usable carryover day: ${r.carryover.expiresOn}.`:''}</p>`
 return h`<details><summary>Reviewed scheduled rules</summary><p>${rules.kind}; ${rules.cadence} credits. Eligible: ${rules.eligibility.employmentTypes.map(t=>TYPE_LABELS[t]??t).join(', ')} after ${rules.eligibility.waitingDays} calendar days.</p>${variant(rules)}${rules.locations.map(l=>h`<h4>${locations.find(p=>p.id===l.locationId)?.name??'Location no longer available'}</h4><p>${l.reviewNote}</p>${variant(l)}`)}</details>`
}
