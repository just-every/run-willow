import assert from 'node:assert/strict'

export async function calculationProof({h,api,fixture,staff,ask,calls}) {
 const person=await fixture.join('Leah Vargas',{workEmail:'leah.vargas@example.com',startDate:'2024-01-01',managerPersonId:staff.managera.person})
 const rules={kind:'vacation',eligibility:{employmentTypes:['full_time'],waitingDays:0},tiers:[{afterMonths:0,allowance:{unit:'hours',amount:366}}],cadence:'daily',proration:'calendar_days',capMinutes:null,carryover:{capMinutes:null,expiresOn:null},locations:[]}
 const source=await api('policy.write',{name:'Recorded vacation accrual',summary:'Vacation accrues under the approved calendar-day rules. HR confirms any entitlement decision.',accrualWeeks:'0',negativeLimitHours:'0',rules})
 await api('policy.approve',{version:source.id})
 await h.api('ai.policy.include',staff.hr.cookie,{version:source.id,included:true})
 const account=await api('account.open',{period:person.period,policy:source.policy,cutoverDate:'2024-12-30',openingHours:'2',note:'Approved opening balance'})
 await api('account.approve',{account:account.id})
 await api('leave.accrue',{account:account.id,through:'2024-12-31'})
 const native=(await api(`people/${person.person}`)).leave.accounts.find(row=>row.id===account.id)
 const answer=await ask(staff.managera.cookie,person.person,'Explain PTO eligibility')
 const calculation=answer.calculations.find(row=>row.policyVersion===source.id)
 assert.equal(calculation.withheld,false)
 assert.equal(calculation.balanceMinutes,native.balanceMinutes)
 assert.equal(calculation.openingMinutes+calculation.changesMinutes,calculation.balanceMinutes)
 assert.equal(calculation.balanceMinutes,180)
 assert.equal(calculation.accrual.date,'2024-12-31')
 assert.equal(calculation.accrual.eligible,true)
 assert.equal(calculation.accrual.annualMinutes/calculation.accrual.yearDays,calculation.accrual.earnedMinutes)
 assert.equal(calculation.accrual.creditMinutes,60)
 const payload=JSON.stringify(calls.at(-1))
 for(const value of ['annualMinutes','earnedMinutes','employmentStart','Leah Vargas',person.person])assert.ok(!payload.includes(value),'Native calculation records remain local')
 assert.deepEqual(JSON.parse(calls.at(-1).messages[1].content).inputs,[])
 console.log('AI-001 native recorded eligibility and calculation remain local: PASS')
 return person.person
}
