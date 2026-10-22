// Every override is immutable, dated and reasoned; the owner's action is its approval.
import type { Bindings } from '../../auth.server'
import { can, canAbout, requireOwner, type Actor } from '../actor'
import { all, commit, guard, insist, newId, now, one, stmt } from '../core'
import { parseHours, requireDate } from '../dates'
import type { Input } from '../input'
import { canAdjustLeave, readsLeaveField } from '../levels/leave'
import { displayName } from '../people'
import { liveLeaveActor, currentLeaveMember } from '../leave-projection'

export async function proposeOverride(env:Bindings,actor:Actor,input:Input) {
 const live=await liveLeaveActor(env,actor);actor=live.actor
 const account=await one(env,"SELECT a.*,p.person_id FROM wl_leave_accounts a JOIN wl_periods p ON p.id=a.period_id WHERE a.id=? AND opening_status='approved'",input.text('account',{max:100}))
 insist(account,'account_not_found',404)
 insist(canAdjustLeave(actor,account.person_id),'leave_adjust_forbidden',403)
 const minutes=parseHours(input.text('hours',{max:10}),'invalid_hours');insist(minutes!==0,'invalid_hours')
 const date=requireDate(input.text('effectiveDate'),'invalid_effectiveDate'),note=input.text('note',{max:500}),id=newId(),ledgerId=actor.owner?newId():null
 const count=(await one<{n:number}>(env,'SELECT COUNT(*) AS n FROM wl_ledger WHERE account_id=?',account.id))!.n
 await commit(env,[...live.guards,guard(env,'stale','(SELECT COUNT(*) FROM wl_ledger WHERE account_id=?)=?',account.id,count),stmt(env,'INSERT INTO wl_leave_overrides(id,account_id,minutes,effective_date,note,ledger_count,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?)',id,account.id,minutes,date,note,count,actor.id,now()),...(ledgerId?[stmt(env,"INSERT INTO wl_ledger(id,account_id,kind,minutes,effective_date,note,recorded_by,recorded_at) VALUES(?,?,'adjustment',?,?,?,?,?)",ledgerId,account.id,minutes,date,note,actor.id,now()),stmt(env,"INSERT INTO wl_leave_override_decisions(override_id,decision,decided_by,decided_at,ledger_id) VALUES(?,'approved',?,?,?)",id,actor.id,now(),ledgerId)]:[])],{actor:actor.id,action:actor.owner?'leave.override.approve':'leave.override.request',subject:id,detail:{account:account.id,minutes,date}})
 return {id,minutes,status:actor.owner?'approved':'pending'}
}

export async function decideOverride(env:Bindings,actor:Actor,input:Input) {
 const live=await liveLeaveActor(env,actor);actor=live.actor
 requireOwner(actor)
 const row=await one(env,'SELECT o.*,p.person_id FROM wl_leave_overrides o JOIN wl_leave_accounts a ON a.id=o.account_id JOIN wl_periods p ON p.id=a.period_id WHERE o.id=?',input.text('override',{max:100}));insist(row,'not_found',404)
 const decision=input.text('decision');insist(['approve','decline'].includes(decision),'invalid_decision')
 const ledgerId=decision==='approve'?newId():null
 if(ledgerId) insist(canAdjustLeave(await currentLeaveMember(env,row.requested_by),row.person_id),'leave_access_changed',403)
 await commit(env,[...live.guards,guard(env,'stale','NOT EXISTS(SELECT 1 FROM wl_leave_override_decisions WHERE override_id=?)',row.id),...(ledgerId?[guard(env,'stale','(SELECT COUNT(*) FROM wl_ledger WHERE account_id=?)=?',row.account_id,row.ledger_count),stmt(env,"INSERT INTO wl_ledger(id,account_id,kind,minutes,effective_date,note,recorded_by,recorded_at) VALUES(?,?,'adjustment',?,?,?,?,?)",ledgerId,row.account_id,row.minutes,row.effective_date,row.note,actor.id,now())]:[]),stmt(env,'INSERT INTO wl_leave_override_decisions(override_id,decision,decided_by,decided_at,ledger_id) VALUES(?,?,?,?,?)',row.id,decision==='approve'?'approved':'declined',actor.id,now(),ledgerId)],{actor:actor.id,action:`leave.override.${decision}`,subject:row.id,detail:{account:row.account_id,minutes:row.minutes}})
 return {id:row.id,status:decision==='approve'?'approved':'declined'}
}

interface OverrideRow {id:string;account:string;person_id:string;legal_name:string;preferred_name:string|null;minutes:number;effectiveDate:string;note:string;requestedBy:string;requestedAt:number;decision:string|null;decidedBy:string|null;decidedAt:number|null}
export async function leaveOverrides(env:Bindings,actor:Actor) {
 insist(can(actor,'leave.manage') || actor.scoped.some(grant=>grant.permissions.has('leave.manage')) || actor.leaveFields.some(grant=>['view','approval','edit'].includes(grant.fields.others.balances??'none') && (grant.scope.kind==='everyone'||grant.members.size>0)),'forbidden',403)
 const rows=await all<OverrideRow>(env,'SELECT o.id,o.account_id AS account,p.person_id,pe.legal_name,pe.preferred_name,o.minutes,o.effective_date AS effectiveDate,o.note,o.requested_by AS requestedBy,o.requested_at AS requestedAt,d.decision,d.decided_by AS decidedBy,d.decided_at AS decidedAt FROM wl_leave_overrides o JOIN wl_leave_accounts a ON a.id=o.account_id JOIN wl_periods p ON p.id=a.period_id JOIN wl_people pe ON pe.id=p.person_id LEFT JOIN wl_leave_override_decisions d ON d.override_id=o.id ORDER BY o.requested_at DESC')
 return rows.filter(row=>canAbout(actor,'leave.manage',row.person_id) || row.requestedBy===actor.id && readsLeaveField(actor,row.person_id,'balances')).map(({person_id,legal_name,preferred_name,...row})=>({...row,person:{id:person_id,name:displayName({legal_name,preferred_name})}}))
}
