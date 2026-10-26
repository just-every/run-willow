import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { all } from './core'
import { readablePolicies, leaveFor } from './leave'
import { handbookSources } from './ai-handbooks'

export type PolicyTopic = 'leave-eligibility' | 'leave-balance' | 'policy-conflict' | 'attendance' | 'remote-work' | 'conduct' | 'general-policy'
export interface PolicySource {
 id: string; versionId: string; version: number; approvedAt: number; clause: string; summary: string
 kind: 'leave-policy' | 'handbook'; applicableFrom?: string
 accrualWeeks?: number; negativeLimitMinutes?: number
}

export function policyTopic(question: string): PolicyTopic | null {
 if (/conflict|contradict|different versions/i.test(question)) return 'policy-conflict'
 if (/\bbalance\b/i.test(question) && /pto|leave/i.test(question)) return 'leave-balance'
 if (/pto|leave|eligib|accru|entitle/i.test(question)) return 'leave-eligibility'
 if (/remote|work from home|hybrid/i.test(question)) return 'remote-work'
 if (/attendance|lateness|late arrival/i.test(question)) return 'attendance'
 if (/conduct|harassment|behavio[u]?r/i.test(question)) return 'conduct'
 if (/handbook|company policy|policy say/i.test(question)) return 'general-policy'
 return null
}

/** Build a closed source projection; no question text or person projection enters it. */
export async function policyContext(env: Bindings, actor: Actor, person: string | null, topic: PolicyTopic, numbers: boolean) {
 const included = new Set((await all(env,'SELECT version_id FROM wl_ai_sources')).map(row=>row.version_id))
 const leaveTopic = ['leave-eligibility','leave-balance','policy-conflict'].includes(topic)
 const policies: PolicySource[] = person && leaveTopic ? (await readablePolicies(env,actor,person)).flatMap(policy=>policy.versions.filter(version=>version.status==='approved' && included.has(version.id)).map(version=>({id:version.id,versionId:version.id,version:version.version,approvedAt:version.approvedAt,clause:'leave-policy',summary:version.summary,kind:'leave-policy' as const,accrualWeeks:version.accrualWeeks,negativeLimitMinutes:version.negativeLimitMinutes}))) : []
 const handbooks = await handbookSources(env,actor)
 for (const source of handbooks.filter(source=>source.included)) {
  for (const clause of source.clauses.filter(clause=>clause.topic===topic && clause.applicableFrom<=actor.today)) {
   policies.push({id:`${source.versionId}-clause-${clause.clauseId}`,versionId:source.versionId,version:source.version,approvedAt:source.approvedAt!,clause:`handbook-clause-${clause.clauseId}`,summary:clause.text,kind:'handbook',applicableFrom:clause.applicableFrom})
  }
 }
 const leave = person && numbers && topic==='leave-balance' ? await leaveFor(env,actor,person,false) : null
 const inputs = leave ? leave.accounts.filter(account=>account.policy && policies.some(policy=>policy.versionId===account.policy!.versionId)).map(account=>({policyVersion:account.policy!.versionId,...(account.balanceMinutes===undefined?{}:{balanceMinutes:account.balanceMinutes,openingMinutes:account.openingMinutes,cutoverDate:account.cutoverDate,accruedThrough:account.accruedThrough})})) : []
 return {policies,inputs}
}
