import { entryHome } from './entries'
import { reviewCorrectionMode } from './corrections'
import { readsPerformanceField } from '../levels/performance'
import type { Bindings } from '../../auth.server'
import { type Actor } from '../actor'
import { all, auditRead, insist, json, type Row } from '../core'
import { goalHome } from './goals'
import { cycleRow, hr, reconcileRecipients } from './store'
const visibleCycle=`EXISTS(SELECT 1 FROM wl_review_assignments a WHERE a.cycle_id=c.id AND a.member_id=?1) OR EXISTS(SELECT 1 FROM wl_review_summaries s JOIN wl_review_recipients r ON r.summary_id=s.id WHERE s.cycle_id=c.id AND r.member_id=?1)`
// A level reads only explicit immutable releases. A named withholding blocks
// an additional level source; already delivered native copies retain custody.
async function levelReleasedReviews(env:Bindings,actor:Actor) {
 const people=(await all<{id:string}>(env,'SELECT id FROM wl_people')).filter(p=>readsPerformanceField(actor,p.id,'reviews')).map(p=>p.id)
 if(!people.length)return []
 return all<{id:string;cycle_id:string}>(env,`SELECT s.id,s.cycle_id FROM wl_review_summaries s WHERE s.person_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM wl_review_withholdings w WHERE w.summary_id=s.id AND w.manager=?)`,JSON.stringify(people),actor.id)
}
export async function performanceHome(env:Bindings,actor:Actor) {
 await reconcileRecipients(env,actor.today)
 const released=await levelReleasedReviews(env,actor)
 const cycles=await all(env,`SELECT c.id,c.name,c.due_date,c.status FROM wl_review_cycles c ${hr(actor)?'':`WHERE (${visibleCycle}) OR c.id IN (SELECT value FROM json_each(?2))`} ORDER BY c.created_at DESC`,...hr(actor)?[]:[actor.id,JSON.stringify([...new Set(released.map(r=>r.cycle_id))])])
 return {cycles,...await goalHome(env,actor),...await entryHome(env,actor),mayManage:hr(actor)}
}
export async function performanceDetail(env:Bindings,actor:Actor,id:string) {
 await reconcileRecipients(env,actor.today)
 const cycle=await cycleRow(env,id),privileged=hr(actor)
 const released=privileged?[]:await levelReleasedReviews(env,actor)
 const ownRecipients=new Set((await all<{summary_id:string}>(env,'SELECT summary_id FROM wl_review_recipients WHERE member_id=?',actor.id)).map(r=>r.summary_id))
 const assignments=await all(env,`SELECT a.*,m.name AS author_name,p.legal_name AS person_name FROM wl_review_assignments a JOIN wl_members m ON m.id=a.member_id JOIN wl_people p ON p.id=a.person_id WHERE a.cycle_id=? ${privileged?'':'AND a.member_id=?'} ORDER BY a.id`,id,...privileged?[]:[actor.id])
 const summaryRows=(await all(env,`SELECT s.*,p.legal_name AS person_name,(SELECT MAX(v.version) FROM wl_review_summaries v WHERE v.cycle_id=s.cycle_id AND v.person_id=s.person_id) AS latest_version FROM wl_review_summaries s JOIN wl_people p ON p.id=s.person_id WHERE s.cycle_id=? ${privileged?'':'AND (EXISTS(SELECT 1 FROM wl_review_recipients r WHERE r.summary_id=s.id AND r.member_id=?) OR s.id IN (SELECT value FROM json_each(?)))'} ORDER BY s.person_id,s.version`,id,...privileged?[]:[actor.id,JSON.stringify(released.map(r=>r.id))]))
 const summaries=summaryRows.map(({latest_version,...s})=>({...s,mayAcknowledge:ownRecipients.has(s.id)} as Row & {mayAcknowledge:boolean}))
 const reviewActions=summaryRows.filter(s=>s.version===s.latest_version&&cycle.status==='open'&&['edit','approval'].includes(reviewCorrectionMode(actor,s.person_id))).map(s=>({id:s.id,requiresApproval:reviewCorrectionMode(actor,s.person_id)==='approval'}))
 insist(privileged||assignments.length||summaries.length,'not_found',404)
 const inputs=(await all(env,`SELECT i.*,a.person_id,a.role,m.name AS author_name FROM wl_review_inputs i JOIN wl_review_assignments a ON a.id=i.assignment_id JOIN wl_members m ON m.id=i.author WHERE a.cycle_id=? ${privileged?'':'AND i.author=?'} ORDER BY i.seq`,id,...privileged?[]:[actor.id])).map(i=>({...i,answers:json<string[]>(i.answers,[])} as Row & {answers:string[]}))
 const notes=privileged?await all(env,'SELECT * FROM wl_review_notes WHERE cycle_id=? ORDER BY seq',id):[]
 const appeals=await all(env,`SELECT a.* FROM wl_review_appeals a JOIN wl_review_summaries s ON s.id=a.summary_id WHERE s.cycle_id=? ${privileged?'':'AND a.member_id=?'} ORDER BY a.created_at`,id,...privileged?[]:[actor.id])
 const acknowledgments=await all(env,`SELECT a.* FROM wl_review_acknowledgments a JOIN wl_review_summaries s ON s.id=a.summary_id WHERE s.cycle_id=? ${privileged?'':'AND a.member_id=?'}`,id,...privileged?[]:[actor.id])
 const subjects=privileged?await all(env,'SELECT s.person_id,p.legal_name AS name FROM wl_review_subjects s JOIN wl_people p ON p.id=s.person_id WHERE s.cycle_id=?',id):[]
 const members=privileged?await all(env,"SELECT id,name,person_id FROM wl_members WHERE status='active'"):[]
 const withholdings=privileged?await all(env,'SELECT w.* FROM wl_review_withholdings w JOIN wl_review_summaries s ON s.id=w.summary_id WHERE s.cycle_id=?',id):[]
 const recipients=privileged?await all(env,'SELECT r.* FROM wl_review_recipients r JOIN wl_review_summaries s ON s.id=r.summary_id WHERE s.cycle_id=?',id):[]
 const questions=json<Record<string,string[]>>(cycle.questions,{})
 const permittedQuestions=Object.fromEntries(Object.entries(questions).filter(([role])=>privileged||assignments.some(a=>a.role===role)))
 await auditRead(env,actor.id,'performance.read',id)
 return {reviewActions,cycle:{...cycle,questions:permittedQuestions},assignments,inputs,notes,summaries,appeals,acknowledgments,subjects,members,withholdings,recipients,mayManage:privileged}
}
export async function performanceFile(env:Bindings,actor:Actor,id:string) {
 return new Response(JSON.stringify(await performanceDetail(env,actor,id),null,2),{headers:{'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="performance-${id}.json"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}})
}
