import type { Bindings } from '../../auth.server'
import { requireOwner, type Actor } from '../actor'
import { commit, guard, insist, json, newId, now, one, stmt, WillowError, type Row } from '../core'
import type { Input } from '../input'
import { oktaOrigin, oktaRequest, oktaState, oktaId, validateGroups, type OktaState } from './okta-client'
import { currentOktaConfiguration, nativeOktaGuards, nativeOktaTask, ownerSessionGuard } from './okta-store'

export async function configureOkta(env: Bindings, actor: Actor, input: Input) {
 requireOwner(actor)
 const enabled = input.flag('enabled'), reason = input.text('reason',{max:500})
 if (enabled) { oktaOrigin(env); insist(input.flag('consent'),'okta_consent_required') }
 await commit(env,[ownerSessionGuard(env,actor),stmt(env,`INSERT INTO wl_okta_settings(singleton,enabled,revision,approved_by,approved_at) VALUES(1,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET enabled=excluded.enabled,revision=excluded.revision,approved_by=excluded.approved_by,approved_at=excluded.approved_at`,Number(enabled),newId(),actor.id,now())],{actor:actor.id,action:'okta.configure',subject:'connections',detail:{enabled,reason}})
 return {enabled}
}

export async function linkOktaAccount(env: Bindings, actor: Actor, input: Input) {
 const config = await currentOktaConfiguration(env,actor), personId = input.text('person'), account = oktaId(input.text('account'))
 const person = await one(env,'SELECT work_email,revision FROM wl_people WHERE id=?',personId)
 insist(person?.work_email,'person_not_found',404)
 const observed = await oktaState(env,account)
 insist(observed.profile.email.toLowerCase() === person.work_email.toLowerCase(),'okta_identity_mismatch',409)
 await commit(env,[ownerSessionGuard(env,actor),guard(env,'okta_consent_changed','EXISTS(SELECT 1 FROM wl_okta_settings WHERE enabled=1 AND revision=?)',config.settings.revision),
  guard(env,'okta_native_changed','EXISTS(SELECT 1 FROM wl_people WHERE id=? AND revision=?)',personId,person.revision),
  guard(env,'okta_mapping_immutable','NOT EXISTS(SELECT 1 FROM wl_okta_accounts WHERE tenant=? AND (person_id=? OR account_id=?))',config.tenant,personId,account),
  stmt(env,'INSERT INTO wl_okta_accounts(person_id,tenant,account_id,linked_by,linked_at) VALUES(?,?,?,?,?)',personId,config.tenant,account,actor.id,now())],{actor:actor.id,action:'okta.account.link',subject:personId,detail:{account}})
 return {person:personId,account}
}

export async function previewOkta(env: Bindings, actor: Actor, input: Input) {
 const config = await currentOktaConfiguration(env,actor), native = await nativeOktaTask(env,input.text('task'))
 const account = await one(env,'SELECT account_id FROM wl_okta_accounts WHERE person_id=? AND tenant=?',native.person.id,config.tenant)
 insist(account,'okta_account_mapping_required',409)
 insist(!await one(env,"SELECT 1 FROM wl_okta_reviews WHERE task_id=? AND status IN ('applying','uncertain')",native.task.id),'okta_observation_required',409)
 const before = await oktaState(env,account.account_id)
 insist(before.profile.email.toLowerCase() === native.person.work_email.toLowerCase(),'okta_identity_mismatch',409)
 const leave = native.c.kind === 'leaver', ids = input.list('groups').flatMap(value=>value.split(',').map(id=>id.trim()).filter(Boolean))
 insist(ids.length <= 40 && new Set(ids).size === ids.length && (!leave || !ids.length),'invalid_okta_groups')
 const groups = await validateGroups(env,ids)
 const desired = new Set(groups.map(g=>g.id)), existing = new Set(before.groups.map(g=>g.id))
 insist(leave || ['ACTIVE','STAGED','SUSPENDED','PROVISIONED'].includes(before.status),'okta_account_state_unsupported',409)
 const plan = {account:before.id,person:native.person.id,name:native.person.legal_name,task:native.task.id,kind:native.c.kind,date:native.c.anchor_date,
  profile:leave ? null : native.profile, groups,
  add:groups.filter(g=>!existing.has(g.id)),remove:before.groups.filter(g=>g.managed && !desired.has(g.id)),
  lifecycle:leave ? 'suspend' : before.status === 'STAGED' ? 'activate' : before.status === 'SUSPENDED' ? 'unsuspend' : null,
  revokeSessions:leave,applications:before.applications,boundary:'Application assignments and licenses are outside this slice. Remaining application links keep a leaver task open. Downstream application sessions require their own verification.'}
 const id = newId()
 await commit(env,[ownerSessionGuard(env,actor),...nativeOktaGuards(env,native),guard(env,'okta_consent_changed','EXISTS(SELECT 1 FROM wl_okta_settings WHERE enabled=1 AND revision=?)',config.settings.revision),
  stmt(env,`INSERT INTO wl_okta_reviews(id,person_id,task_id,actor,created_at,configuration,native_snapshot,before_state,plan,status) VALUES(?,?,?,?,?,?,?,?,?,'pending')`,id,native.person.id,native.task.id,actor.id,now(),config.fingerprint,native.snapshot,JSON.stringify(before),JSON.stringify(plan))],{actor:actor.id,action:'okta.preview',subject:id,detail:{person:native.person.id,task:native.task.id,account:before.id}})
 return {id,plan,before}
}

async function execution(env: Bindings, actor: Actor, id: string) {
 const config = await currentOktaConfiguration(env,actor)
 const review = await one(env,'SELECT * FROM wl_okta_reviews WHERE id=? AND actor=?',id,actor.id)
 insist(review,'okta_review_not_found',404)
 insist(review.configuration === config.fingerprint,'okta_consent_changed',409)
 const native = await nativeOktaTask(env,review.task_id)
 insist(native.snapshot === review.native_snapshot,'okta_native_changed',409)
 insist(actor.today >= native.c.anchor_date,'okta_effective_date_pending',409)
 const plan = json<any>(review.plan,{})
 return {config,review,native,plan}
}

function meetsPlan(plan: any, observed: OktaState) {
 const groups = observed.groups.filter(g=>g.managed).map(g=>g.id).sort()
 const desired = plan.groups.map((g:any)=>g.id).sort()
 const status = plan.kind === 'leaver' ? observed.status === 'SUSPENDED' : observed.status === 'ACTIVE'
 return observed.id === plan.account && status && JSON.stringify(groups) === JSON.stringify(desired) &&
  (plan.kind === 'leaver' ? observed.applications.length === 0 : Object.entries(plan.profile).every(([key,value])=>observed.profile[key as keyof OktaState['profile']] === value))
}

async function failExecution(env: Bindings, actor: Actor, review: Row, native: Awaited<ReturnType<typeof nativeOktaTask>>, code: string, observed?: OktaState) {
 await commit(env,[stmt(env,"UPDATE wl_okta_reviews SET status='uncertain',failure=?,observed=? WHERE id=?",code,observed ? JSON.stringify(observed) : null,review.id),
  stmt(env,"UPDATE wl_case_tasks SET failure=? WHERE id=? AND status='open'",code,review.task_id),stmt(env,'UPDATE wl_cases SET revision=? WHERE id=?',newId(),native.c.id)],{actor:actor.id,action:'okta.unresolved',subject:review.id,detail:{task:review.task_id,failure:code}})
}

export async function applyOkta(env: Bindings, actor: Actor, input: Input) {
 requireOwner(actor)
 const {config,review,native,plan} = await execution(env,actor,input.text('review'))
 insist(review.status === 'pending' && now()-review.created_at <= 15*60*1000,'okta_review_not_pending',409)
 const before = await oktaState(env,plan.account)
 insist(JSON.stringify(before) === review.before_state,'okta_provider_changed',409)
 // Claim before the first write. Losing the response never permits a replay.
 await commit(env,[ownerSessionGuard(env,actor),...nativeOktaGuards(env,native),guard(env,'okta_consent_changed','EXISTS(SELECT 1 FROM wl_okta_settings WHERE enabled=1 AND revision=?)',config.settings.revision),
  guard(env,'okta_review_not_pending',"EXISTS(SELECT 1 FROM wl_okta_reviews WHERE id=? AND status='pending') AND NOT EXISTS(SELECT 1 FROM wl_okta_reviews WHERE task_id=? AND status IN ('applying','uncertain'))",review.id,review.task_id),
  stmt(env,"UPDATE wl_okta_reviews SET status='applying' WHERE id=?",review.id)],{actor:actor.id,action:'okta.apply',subject:review.id,detail:{task:review.task_id}})
 try {
  const stillAuthorized = async () => {
   const current = await currentOktaConfiguration(env,actor)
   insist(current.fingerprint === config.fingerprint,'okta_consent_changed',409)
   const currentNative = await nativeOktaTask(env,review.task_id)
   insist(currentNative.snapshot === review.native_snapshot,'okta_native_changed',409)
   await commit(env,[ownerSessionGuard(env,actor)],[])
  }
  const write = async (path:string,method:string,body?:unknown) => {await stillAuthorized();await oktaRequest(env,path,method,body)}
  const user = `/api/v1/users/${oktaId(plan.account)}`
  if (plan.kind === 'leaver' && before.status !== 'SUSPENDED') await write(`${user}/lifecycle/suspend`,'POST')
  if (plan.revokeSessions) await write(`${user}/sessions?oauthTokens=true&forgetDevices=true`,'DELETE')
  for (const group of plan.remove) await write(`/api/v1/groups/${oktaId(group.id)}/users/${plan.account}`,'DELETE')
  if (plan.profile) await write(user,'POST',{profile:plan.profile})
  for (const group of plan.add) await write(`/api/v1/groups/${oktaId(group.id)}/users/${plan.account}`,'PUT')
  if (plan.kind !== 'leaver' && plan.lifecycle) await write(`${user}/lifecycle/${plan.lifecycle}?sendEmail=false`,'POST')
  await stillAuthorized()
  const observed = await oktaState(env,plan.account)
  insist(meetsPlan(plan,observed),'okta_readback_pending',409)
  await commit(env,[ownerSessionGuard(env,actor),...nativeOktaGuards(env,native),guard(env,'okta_consent_changed','EXISTS(SELECT 1 FROM wl_okta_settings WHERE enabled=1 AND revision=?)',config.settings.revision),
   stmt(env,"UPDATE wl_okta_reviews SET status='verified',observed=?,failure=NULL,completed_at=? WHERE id=? AND status='applying'",JSON.stringify(observed),now(),review.id),
   stmt(env,"UPDATE wl_case_tasks SET status='done',failure=NULL,evidence=?,completed_by=?,completed_at=? WHERE id=? AND status='open'",`Okta observed state: ${review.id}`,actor.id,now(),review.task_id),stmt(env,'UPDATE wl_cases SET revision=? WHERE id=?',newId(),native.c.id)],{actor:actor.id,action:'okta.verified',subject:review.id,detail:{person:native.person.id,task:review.task_id,sessionRevocationAcknowledged:!!plan.revokeSessions}})
  return {id:review.id,status:'verified',observed}
 } catch (error) {
  const code = error instanceof WillowError ? error.code : 'okta_request_uncertain'
  await failExecution(env,actor,review,native,code)
  throw new WillowError(code,error instanceof WillowError ? error.status : 502)
 }
}

// Observation never repeats an external write and never claims session
// revocation after an uncertain request. The owner must resolve that exception.
export async function observeOkta(env: Bindings, actor: Actor, input: Input) {
 requireOwner(actor)
 const review = await one(env,'SELECT * FROM wl_okta_reviews WHERE id=?',input.text('review'))
 insist(review && ['applying','uncertain'].includes(review.status),'okta_observation_not_required',409)
 const config = await currentOktaConfiguration(env,actor)
 insist(config.fingerprint === review.configuration,'okta_consent_changed',409)
 const plan = json<any>(review.plan,{}), observed = await oktaState(env,plan.account)
 await commit(env,[ownerSessionGuard(env,actor),stmt(env,'UPDATE wl_okta_reviews SET observed=? WHERE id=?',JSON.stringify(observed),review.id)],{actor:actor.id,action:'okta.observed',subject:review.id,detail:{task:review.task_id,meetsReviewedState:meetsPlan(plan,observed)}})
 return {id:review.id,status:review.status,observed,meetsReviewedState:meetsPlan(plan,observed)}
}

export async function closeOktaException(env: Bindings, actor: Actor, input: Input) {
 requireOwner(actor)
 const id = input.text('review'), reason = input.text('reason',{max:500})
 // This releases no access and completes no work. Any later execution requires
 // fresh consent and a new preview of actual provider state.
 await commit(env,[ownerSessionGuard(env,actor),guard(env,'okta_observation_not_required',"EXISTS(SELECT 1 FROM wl_okta_reviews WHERE id=? AND status IN ('applying','uncertain'))",id),
  stmt(env,"UPDATE wl_okta_reviews SET status='closed',completed_at=? WHERE id=?",now(),id)],{actor:actor.id,action:'okta.exception.closed',subject:id,detail:{reason}})
 return {id,status:'closed'}
}
