// Translate the ordinary HTML form controls to the same structured rules as JSON.
import type { Input } from './input'
import { insist } from './core'
import { parseHours } from './dates'

export function policyRulesInput(input: Input): unknown {
 if(input.has('rules')) return input.json('rules')
 const kind=input.text('ruleKind',{optional:true,max:20})
 if(!kind)return null
 const unit=input.text('ruleUnit',{max:10}),dayMinutes=input.integer('ruleDayMinutes',{min:1,max:1440})!
 const tiers=[]
 for(let i=0;i<3;i++) {
  if(!input.has(`ruleAmount${i}`)&&i>0)continue
  const amount=Number(input.text(`ruleAmount${i}`,{max:20}))
  insist(Number.isFinite(amount),'invalid_allowance')
  tiers.push({afterMonths:input.integer(`ruleMonths${i}`,{max:1200}),allowance:{unit,amount,...(unit==='days'?{dayMinutes}:{})}})
 }
 const hours=(name:string)=>input.has(name)?parseHours(input.text(name,{max:10}),`invalid_${name}`):null
 const locations=[]
 for(let i=0;i<2;i++) {
  const locationId=input.text(`ruleLocation${i}`,{optional:true,max:100})
  if(!locationId)continue
  const variantTiers=tiers.map((tier,t)=>({afterMonths:tier.afterMonths,allowance:{...tier.allowance,amount:Number(input.text(`ruleLocationAmount${i}_${t}`,{max:20}))}}))
  locations.push({locationId,reviewNote:input.text(`ruleLocationReview${i}`,{max:500}),tiers:variantTiers,capMinutes:hours(`ruleLocationCap${i}`),carryover:{capMinutes:hours(`ruleLocationCarry${i}`),expiresOn:input.text(`ruleLocationExpiry${i}`,{optional:true,max:5})||null}})
 }

 return {kind,eligibility:{employmentTypes:input.list('ruleTypes'),waitingDays:input.integer('ruleWaitingDays',{max:3650})},tiers,cadence:input.text('ruleCadence'),proration:'calendar_days',capMinutes:hours('ruleCapHours'),carryover:{capMinutes:hours('ruleCarryHours'),expiresOn:input.text('ruleExpiry',{optional:true,max:5})||null},locations}
}
