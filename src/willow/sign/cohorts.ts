import type { Bindings } from '../../auth.server'
import { employerZone, type Actor } from '../actor'
import { all, commit, guard, insist, now, one, stmt, type Row } from '../core'
import type { Input } from '../input'
import { directory } from '../profile'
import { selectedPeriods } from '../employment'
import { today } from '../dates'
import { cohortRecipient, liveCohort } from './cohort-access'
import { enrollSignatureRecipient } from './recipients'

const SEQUENCE="COALESCE((SELECT MAX(seq) FROM wl_audit WHERE action NOT LIKE '%.read' AND action NOT LIKE '%.download'),0)"

export function cohortPolicy(input:Input,kind:string) {
 const futureJoiners=input.flag('futureJoiners'),notify=input.flag('notify')
 insist(!futureJoiners||kind!=='named','signature_future_selector_required')
 return {futureJoiners,notify}
}

/** Add to the issue transaction, after its actor-bound review and exact-source guards. */
export function cohortIssueStatements(env:Bindings,actor:Actor,review:Row,snapshot:Row) {
 const duration=snapshot.expiryDuration??snapshot.expiresAt-review.created_at
 insist(Number.isSafeInteger(duration)&&duration>0&&duration<=90*86400000,'invalid_signature_expiry')
 insist(!snapshot.futureJoiners||snapshot.cohortKind!=='named','signature_future_selector_required')
 return [stmt(env,`INSERT INTO wl_sign_cohorts(id,initiator,template_id,source_version,source_sha256,template_digest,category_id,hr_member,cohort_kind,cohort_value,future_joiners,notify,expiry_duration,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,review.id,actor.id,snapshot.template,snapshot.source,snapshot.sourceSha256,snapshot.templateDigest,snapshot.category,snapshot.hr,snapshot.cohortKind,snapshot.cohortValue??'',snapshot.futureJoiners===true?1:0,snapshot.notify===true?1:0,duration,now())]
}

/** Cancellation closes policy even when this cohort currently has no unsigned request. */
export function cohortCancelStatements(env:Bindings,cohort:string) {
 return [stmt(env,'UPDATE wl_sign_cohorts SET future_joiners=0,notify=0,stopped_at=COALESCE(stopped_at,?) WHERE id=?',now(),cohort)]
}

export async function enrollSignatureJoiners(env:Bindings,instant=now()) {
 let enrolled=0
 for(const cohort of await all(env,'SELECT * FROM wl_sign_cohorts WHERE future_joiners=1 AND stopped_at IS NULL ORDER BY created_at,id')) {
  const context=await liveCohort(env,cohort)
  if(!context)continue
  const {initiator}=context
  const periods=await selectedPeriods(env,initiator.today)
  const existing=new Set((await all(env,'SELECT person_id FROM wl_sign_requests WHERE cohort=?',cohort.id)).map(r=>r.person_id))
  // Include later employment starts, including already-recorded future hires, and newly recorded joiners.
  // Moving an existing employee into the selector alone never enrolls them.
  const issuedOn=today(await employerZone(env),cohort.created_at)
  let candidates=(await directory(env,initiator)).filter(p=>{
   const period=periods.get(p.id)
   return p.status==='active'&&!existing.has(p.id)&&period&&(period.created_at>cohort.created_at||period.start_date>issuedOn)
  })
  if(cohort.cohort_kind==='location')candidates=candidates.filter(p=>p.location?.id===cohort.cohort_value)
  if(cohort.cohort_kind==='department')candidates=candidates.filter(p=>p.department?.id===cohort.cohort_value)
  if(cohort.cohort_kind==='employment_type')candidates=candidates.filter(p=>periods.get(p.id)?.employment_type===cohort.cohort_value)
  if(cohort.cohort_kind==='access_level') {
   const members=await all(env,"SELECT m.person_id FROM wl_member_levels l JOIN wl_members m ON m.id=l.member_id WHERE l.level_id=? AND m.status='active'",cohort.cohort_value)
   candidates=candidates.filter(p=>members.some(m=>m.person_id===p.id))
  }
  for(const person of candidates) {
   const sequence=(await one(env,'SELECT '+SEQUENCE+' AS seq'))!.seq
   // Rebuild after each committed enrollment, then fence every business change in its atomic batch.
   const fresh=await liveCohort(env,cohort)
   if(!fresh||!await cohortRecipient(env,cohort,person.id,fresh))continue
   const statements=[guard(env,'signature_inputs_changed',SEQUENCE+'=?',sequence),guard(env,'signature_cohort_stopped','EXISTS(SELECT 1 FROM wl_sign_cohorts WHERE id=? AND future_joiners=1 AND stopped_at IS NULL)',cohort.id),guard(env,'signature_already_enrolled','NOT EXISTS(SELECT 1 FROM wl_sign_requests WHERE cohort=? AND person_id=?)',cohort.id,person.id)]
   const review=await one(env,'SELECT snapshot FROM wl_sign_reviews WHERE id=?',cohort.id)
   insist(review,'signature_review_missing',409)
   const snapshot={...JSON.parse(review.snapshot),expiryDuration:cohort.expiry_duration,expiresAt:instant+cohort.expiry_duration}
   const request=await enrollSignatureRecipient(env,fresh.initiator,snapshot,person.id,cohort.id,statements)
   await commit(env,statements,{actor:'scheduler',action:'signature.enrolled',subject:cohort.id,detail:{request,person:person.id,template:cohort.template_id}})
   enrolled++
  }
 }
 return {enrolled}
}
