import { performanceWork } from './performance/work'
import { surveyWork } from './surveys/work'
import { latestAnnouncements } from './company/store'
import { currentMembership, matchesAudience } from './company/audience'
import { reviewsSelfChanges, handlesSelfExceptions } from './self-service/view'
// Adapters for every shipped work source. No private values enter this projection.
import type { Bindings } from '../auth.server'
import { actorFor, can, canAbout, employerZone, type Actor } from './actor'
import { readsCategory, sees } from './access'
import { all, json, type Row } from './core'
import { addDays, today } from './dates'
import { blockedBy } from './workflow-plan'
import { answersFor, missingFields } from './lifecycle'
import { renewalsDue } from './record-tables/rows'
import { CERTIFICATIONS, readsTable, recordTables } from './record-tables/schema'
import { mayApprove, mayRead, type ResolvedStep } from './change-requests/chain'
import { answersTask } from './date-alerts/alerts'

export interface WorkSource {
 key: string; kind: string; title: string; path: string; due: string; preferred?: string | null
 next: string; progress: string; personId: string | null
 visible: (actor: Actor) => boolean
 responsible: (actor: Actor) => boolean
}

export async function workMembers(env: Bindings) {
 const rows = await all(env, `SELECT m.id,m.email,m.name,m.person_id,o.role FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE m.status='active' AND o.status='active' ORDER BY CASE WHEN o.role='owner' THEN 0 ELSE 1 END,m.id`)
 const actors: Actor[] = []
 for (const row of rows) {
  try { actors.push(await actorFor(env, { id: row.id, email: row.email, name: row.name, personId: row.person_id, owner: row.role==='owner', sessionId: '' })) } catch { /* admission changed while reading */ }
 }
 return actors
}

export async function workSources(env: Bindings, defaultDays: number): Promise<WorkSource[]> {
 const zone = await employerZone(env), result: WorkSource[] = []
 const deadline = (instant: number) => addDays(today(zone, instant), defaultDays)
 const hr = (a: Actor) => can(a,'people.manage'), payroll = (a: Actor) => can(a,'payroll.handoff') && can(a,'pay.read')
 const add = (kind: string, row: Row, title: string, path: string, due: string, visible: WorkSource['visible'], responsible = visible, preferred?: string | null, progress = 'Awaiting action') => result.push({ key: `${kind}:${row.id}`, kind, title, path, due, visible, responsible, preferred, progress, personId: row.person_id??null, next: title })
 for (const r of await all(env,"SELECT c.*,d.outcome FROM wl_self_changes c LEFT JOIN wl_self_decisions d ON d.change_id=c.id WHERE d.change_id IS NULL")) add('self-change',r,'Review private profile change',`/app/self-changes/${r.id}`,r.due_date,a=>a.personId===r.person_id||can(a,'people.private'),a=>reviewsSelfChanges(a)&&a.id!==r.requested_by&&a.personId!==r.person_id)
 for (const r of await all(env,"SELECT c.* FROM wl_self_changes c JOIN wl_self_decisions d ON d.change_id=c.id WHERE d.outcome='approved' AND NOT EXISTS(SELECT 1 FROM wl_self_reconciliation r WHERE r.change_id=c.id)")) add('self-exception',r,'Reconcile approved profile revision','/app/self-changes',r.due_date,a=>a.personId===r.person_id||handlesSelfExceptions(a),handlesSelfExceptions,null,'Approved revision awaits a recorded downstream handoff; no provider confirmation')
 // SELF-002 read acknowledgments are owned work; completion remains the target member's.
 const companyPublications=(await latestAnnouncements(env)).filter(p=>!p.retired&&p.ack_required&&p.starts_on<=today(zone)&&(!p.ends_on||p.ends_on>=today(zone)))
 if(companyPublications.length){
  const receipts=new Set((await all(env,'SELECT version_id,member_id FROM wl_company_acknowledgements')).map(r=>`${r.version_id}:${r.member_id}`))
  for(const member of await workMembers(env)) {
   const membership=await currentMembership(env,member)
   for(const publication of companyPublications) {
    if(!matchesAudience(publication,membership)||receipts.has(`${publication.id}:${member.id}`))continue
    add('company-ack',{id:`${publication.id}:${member.id}`,person_id:member.personId},'Acknowledge company announcement','/app',publication.ends_on??addDays(publication.starts_on,defaultDays),a=>a.id===member.id||can(a,'people.manage'),a=>a.id===member.id,member.id)
   }
  }
 }

 for (const r of await all(env,"SELECT o.*,p.person_id FROM wl_leave_overrides o JOIN wl_leave_accounts a ON a.id=o.account_id JOIN wl_periods p ON p.id=a.period_id WHERE NOT EXISTS(SELECT 1 FROM wl_leave_override_decisions d WHERE d.override_id=o.id)")) add('leave-override',r,'Review leave balance override','/app/leave#overrides',deadline(r.requested_at),a=>can(a,'leave.manage'),a=>a.owner)
 const tasks = await all(env, `SELECT t.*,c.person_id FROM wl_case_tasks t JOIN wl_cases c ON c.id=t.case_id WHERE t.status='open' AND t.superseded_at IS NULL AND c.status='open'`)
 for (const t of tasks) {
 const blocked = await blockedBy(env,t)
 add('task',t,t.title,`/app/cases/${t.case_id}`,t.due_date,a=>sees(a,t.person_id,'lifecycle') || answersFor(a,t,t),a=>answersFor(a,t,t),null,t.failure?'External or assigned work failed; evidence still required':blocked.length?`Blocked by ${blocked.length} prerequisite(s)`:t.system?'External evidence required':'Task open')
 }
 const cases = await all(env, `SELECT c.*,t.required_fields FROM wl_cases c JOIN wl_templates t ON t.id=c.template_id WHERE c.status='open'`)
 for (const c of cases) {
  const missing = await missingFields(env,c,c)
  if (missing.length) add('information',c,'Complete required information',`/app/cases/${c.id}`,c.anchor_date,hr,hr,null,`${missing.length} required field(s) missing`)
 }
 for (const r of await all(env,"SELECT * FROM wl_leave_requests WHERE status='pending'")) {
  const decide = (a: Actor) => a.id!==r.requested_by && a.personId!==r.person_id && (a.id===r.approver_member_id || canAbout(a,'leave.manage',r.person_id))
  add('leave',r,'Review time-off request',`/app/leave/${r.id}`,r.start_date,a=>decide(a) || a.id===r.requested_by || a.personId===r.person_id,decide,r.approver_member_id)
 }
 for (const r of await all(env,"SELECT id,proposed_at FROM wl_proposals WHERE status='pending'")) add('proposal',r,'Review employee change',`/app/proposals/${r.id}`,deadline(r.proposed_at),hr)
 // PEOPLE-004: an alert's review task is work for its role holder who may read the date.
 for (const r of await all(env,"SELECT * FROM wl_date_alert_tasks WHERE status='open'")) {
  const answer = new Map<string,boolean>()
  for (const a of await workMembers(env)) answer.set(a.id, await answersTask(env,a,r))
  add('date-alert-task',r,r.title,'/app/dates',r.date,a=>!!answer.get(a.id),a=>!!answer.get(a.id))
 }
 // FLOW-004: the current chain step is approver work; a returned request is the requester's.
 for (const r of await all<{id:string;person_id:string;requested_by:string;steps_json:string;step:number;status:string;updated_at:number}>(env,"SELECT id,person_id,requested_by,steps_json,step,status,updated_at FROM wl_change_requests WHERE status IN ('pending','returned')")) {
  const steps = json<ResolvedStep[]>(r.steps_json,[]), step = r.status==='pending' ? steps[r.step] : undefined, decide = new Map<string,boolean>()
  for (const a of await workMembers(env)) decide.set(a.id, await mayApprove(env,a,r,step))
  if (step) add('change-request',r,'Approve employee change request',`/app/changes/${r.id}`,deadline(r.updated_at),a=>mayRead(a,r,steps),a=>!!decide.get(a.id),step.member,`Waiting on step ${r.step+1} of ${steps.length}`)
  else add('change-request',r,'Revise returned change request',`/app/changes/${r.id}`,deadline(r.updated_at),a=>a.id===r.requested_by,a=>a.id===r.requested_by,r.requested_by,'Sent back with comments')
 }
 for (const r of await all(env,"SELECT id,written_at FROM wl_policy_versions WHERE status='draft'")) add('policy',r,'Review leave policy','/app/settings',deadline(r.written_at),a=>a.owner)
 for (const r of await all(env,"SELECT a.id,a.created_at,p.person_id FROM wl_leave_accounts a JOIN wl_periods p ON p.id=a.period_id WHERE a.opening_status='proposed'")) add('opening',r,'Review opening balance',`/app/people/${r.person_id}`,deadline(r.created_at),a=>can(a,'leave.manage'))
 for (const r of await all(env,"SELECT id,proposed_at,status FROM wl_model_drafts WHERE status='pending'")) add('model',r,r.status==='failed'?'Resolve failed model draft':'Review model draft',`/app/proposals?draft=${r.id}`,deadline(r.proposed_at),hr,hr,null,r.status==='failed'?'Provider draft failed; no work executed':'Awaiting review')
 const receipts = await all(env, `SELECT v.id,v.uploaded_at,d.person_id,d.category_id,c.subject_reads,c.manager_reads FROM wl_document_versions v JOIN wl_documents d ON d.id=v.document_id JOIN wl_doc_categories c ON c.id=d.category_id WHERE c.acknowledgement=1 AND v.number=(SELECT MAX(v2.number) FROM wl_document_versions v2 WHERE v2.document_id=d.id) AND NOT EXISTS(SELECT 1 FROM wl_acknowledgements a WHERE a.version_id=v.id AND a.person_id=d.person_id)`)
 for (const r of receipts) add('receipt',r,'Acknowledge document receipt',`/app/people/${r.person_id}`,deadline(r.uploaded_at),a=>sees(a,r.person_id,'documents') && readsCategory(a,r.person_id,r),a=>a.personId===r.person_id && !!r.subject_reads,null,'Receipt pending; not a signature')
 const claims = new Set((await all(env,'SELECT source_kind,source_id FROM wl_payroll_items')).map(r=>`${r.source_kind}:${r.source_id}`))
 for (const r of await all(env,"SELECT id,period_end,status,exceptions FROM wl_payroll_batches WHERE status IN ('draft','exported')")) {
  const open = json<{key:string}[]>(r.exceptions,[]).filter(e=>!claims.has(e.key))
  if (open.length) add('payroll-exception',r,'Resolve payroll exceptions',`/app/payroll/${r.id}`,r.period_end,payroll,payroll,null,`${open.length} unresolved exception(s)`)
  if (r.status==='exported') add('payroll-receipt',r,'Record provider acknowledgment',`/app/payroll/${r.id}`,r.period_end,payroll)
 }
 const failures = await all(env, "SELECT id,template_id,proposed_at FROM wl_model_drafts f WHERE status='failed' AND NOT EXISTS(SELECT 1 FROM wl_model_drafts n WHERE n.template_id=f.template_id AND n.proposed_at>f.proposed_at AND n.status<>'failed')")
 for (const r of failures) add('model-failure',r,'Resolve failed model draft',`/app/proposals?draft=${r.id}`,deadline(r.proposed_at),hr,hr,null,'Draft failed; request a fresh draft or leave this exception open')
 const notices = await all(env, "SELECT id,created_at FROM wl_notices f WHERE status IN ('failed','refused') AND NOT EXISTS(SELECT 1 FROM wl_notices n WHERE n.kind=f.kind AND n.subject=f.subject AND n.recipient=f.recipient AND n.created_at>f.created_at AND n.status IN ('accepted','development'))")
 for (const r of notices) add('notice-failure',r,'Investigate email delivery failure','/app/connections',deadline(r.created_at),a=>a.owner,a=>a.owner,null,'Delivery failed; business work remains independent')
 for (const r of await all(env,'SELECT provider_id AS id,failing_since FROM oa_identity_provider_health WHERE failing_since IS NOT NULL')) add('identity-failure',r,'Restore identity connection','/app/connections',deadline(r.failing_since),a=>a.owner,a=>a.owner,null,'Provider unavailable; ordinary email sign-in remains available')
 for (const r of await all(env,'SELECT provider_id AS id,observed_at FROM wl_identity_token_health WHERE failed=1')) add('identity-token-failure',r,'Investigate refused token exchange','/app/connections',deadline(r.observed_at),a=>a.owner,a=>a.owner,null,'Token exchange unavailable')
 // PEOPLE-003: certifications expiring within the renewal lead are HR work until a renewed (or removed) row replaces them.
 const certifications = (await recordTables(env)).find(t => t.id === CERTIFICATIONS)!
 for (const r of await renewalsDue(env, today(zone, Date.now()))) add('renewal',r,'Renew certification',`/app/people/${r.person_id}`,r.due,a=>readsTable(a,r.person_id,certifications) && (hr(a) || a.personId===r.person_id),a=>hr(a) && readsTable(a,r.person_id,certifications),null,'Certification expiring; record the renewal on the person’s record')
 return [...result,...await surveyWork(env),...await performanceWork(env)]
}
