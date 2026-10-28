import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { all, guard, insist, json, now, one, type Row } from '../core'
import { termsOn } from '../people'
import { blockedBy } from '../workflow-plan'
import { oktaConfiguration, oktaTenant } from './okta-client'

export const OKTA_SYSTEM = 'Okta connected'
export const oktaSettings = (env: Bindings) => one(env,'SELECT * FROM wl_okta_settings WHERE singleton=1')

export function ownerSessionGuard(env: Bindings, actor: Actor) {
 return guard(env,'okta_authority_changed',`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN wl_members m ON m.operator_id=o.id WHERE s.id=? AND m.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version AND o.status='active' AND o.role='owner' AND m.status='active')`,actor.sessionId,actor.id,now())
}

export async function currentOktaConfiguration(env: Bindings, actor: Actor) {
 requireOwner(actor)
 const settings = await oktaSettings(env)
 insist(settings?.enabled, 'okta_consent_required',409)
 return {settings,tenant:await oktaTenant(env),fingerprint:await oktaConfiguration(env,settings.revision)}
}

export async function nativeOktaTask(env: Bindings, taskId: string) {
 const task = await one(env,'SELECT * FROM wl_case_tasks WHERE id=?',taskId)
 insist(task?.system === OKTA_SYSTEM && task.assignee === 'it' && task.status === 'open' && !task.superseded_at,'okta_task_not_open',409)
 insist(!(await blockedBy(env,task)).length,'dependencies_open',409)
 const c = (await one(env,'SELECT * FROM wl_cases WHERE id=?',task.case_id))!
 insist(c.status === 'open','case_already_completed',409)
 const person = (await one(env,'SELECT id,legal_name,work_email,revision FROM wl_people WHERE id=?',c.person_id))!
 const period = (await one(env,'SELECT * FROM wl_periods WHERE id=?',c.period_id))!
 const terms = await termsOn(env,c.period_id,c.anchor_date)
 insist(terms && person.work_email,'okta_person_incomplete',409)
 const department = terms.department_id ? (await one(env,'SELECT name FROM wl_departments WHERE id=?',terms.department_id))?.name ?? '' : ''
 return { task, c, person, period, terms, profile:{displayName:person.legal_name,title:terms.job_title,department}, snapshot:JSON.stringify([c.id,c.revision,c.template_id,c.anchor_date,person.id,person.revision,period.id,period.revision,terms.id,department,task.id,task.source_task,task.dependencies]) }
}

export function nativeOktaGuards(env: Bindings, native: Awaited<ReturnType<typeof nativeOktaTask>>) {
 const {task,c,person,period,terms} = native
 return [guard(env,'okta_native_changed',`EXISTS(SELECT 1 FROM wl_cases c JOIN wl_case_tasks t ON t.case_id=c.id JOIN wl_people p ON p.id=c.person_id JOIN wl_periods e ON e.id=c.period_id WHERE c.id=? AND c.revision=? AND c.status='open' AND t.id=? AND t.status='open' AND t.superseded_at IS NULL AND p.revision=? AND e.revision=? AND EXISTS(SELECT 1 FROM wl_terms WHERE id=? AND status='active'))`,c.id,c.revision,task.id,person.revision,period.revision,terms.id),
  guard(env,'dependencies_open',"NOT EXISTS(SELECT 1 FROM wl_case_tasks d JOIN json_each(?) j ON d.id=j.value WHERE d.status<>'done' AND d.superseded_at IS NULL)",task.dependencies)]
}

export async function oktaOverview(env: Bindings, actor: Actor) {
 requireOwner(actor)
 const settings = await oktaSettings(env)
 return { enabled:!!settings?.enabled,configured:!!env.OKTA_ORG_URL && !!env.OKTA_API_TOKEN,
  accounts:await all(env,'SELECT a.person_id,a.account_id,p.legal_name AS name,a.linked_at FROM wl_okta_accounts a JOIN wl_people p ON p.id=a.person_id ORDER BY a.linked_at DESC'),
  tasks:await all(env,`SELECT t.id,t.title,t.failure,c.person_id,c.kind,c.anchor_date,p.legal_name AS name FROM wl_case_tasks t JOIN wl_cases c ON c.id=t.case_id JOIN wl_people p ON p.id=c.person_id WHERE t.system=? AND t.status='open' AND t.superseded_at IS NULL AND c.status='open' ORDER BY t.due_date`,OKTA_SYSTEM),
  reviews:(await all(env,'SELECT * FROM wl_okta_reviews ORDER BY created_at DESC LIMIT 30')).map((row:Row)=>({id:row.id,task:row.task_id,status:row.status,failure:row.failure,plan:json<any>(row.plan,{}),observed:json<any>(row.observed,null)})) }
}
