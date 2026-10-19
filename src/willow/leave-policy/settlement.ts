// Corrections to old absence dates remain reconcilable after earning has ended.
import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import { all, commit, guard, newId, now, one, stmt } from '../core'
import { spentFromCarryover, type LedgerRow } from './balances'
import type { CarryoverPool } from './carryover'

export async function settleExpiredCarryover(env:Bindings,actor:Actor,accountId:string,date:string) {
 const account=await one(env,'SELECT revision,policy_version_id FROM wl_leave_accounts WHERE id=?',accountId)
 if(!account)return 0
 const [pools,ledger]=await Promise.all([
  all<CarryoverPool>(env,'SELECT year,initial_minutes,expires_on,expired_minutes,settled FROM wl_leave_carryover_pools WHERE account_id=? AND expires_on<? ORDER BY year',accountId,date),
  all<LedgerRow>(env,'SELECT l.id,l.kind,l.minutes,l.effective_date,e.event FROM wl_ledger l LEFT JOIN wl_leave_policy_events e ON e.ledger_id=l.id WHERE l.account_id=?',accountId),
 ])
 const changes=pools.map(p=>({pool:p,target:Math.max(0,p.initial_minutes-spentFromCarryover(ledger,p.year,p.expires_on!))})).filter(c=>!c.pool.settled||c.target!==c.pool.expired_minutes)
 if(!changes.length)return 0
 const statements=[guard(env,'stale','EXISTS(SELECT 1 FROM wl_leave_accounts WHERE id=? AND revision=?)',accountId,account.revision),guard(env,'stale','(SELECT COUNT(*) FROM wl_ledger WHERE account_id=?)=?',accountId,ledger.length)]
 let minutes=0
 for(const {pool,target}of changes){
  const delta=target-pool.expired_minutes
  if(delta){
   const id=newId();minutes-=delta
   statements.push(stmt(env,"INSERT INTO wl_ledger(id,account_id,kind,minutes,effective_date,note,recorded_by,recorded_at) VALUES(?,?,'adjustment',?,?,?,?,?)",id,accountId,-delta,date,`Carryover ${pool.year} reconciled after a dated correction; total expired ${target} minutes; policy ${account.policy_version_id}`,actor.id,now()),stmt(env,"INSERT INTO wl_leave_policy_events(ledger_id,event) VALUES(?,'carryover_expiry')",id))
  }
  statements.push(stmt(env,'UPDATE wl_leave_carryover_pools SET expired_minutes=?,settled=1 WHERE account_id=? AND year=?',target,accountId,pool.year))
 }
 statements.push(stmt(env,'UPDATE wl_leave_accounts SET revision=? WHERE id=?',newId(),accountId))
 await commit(env,statements,{actor:actor.id,action:'leave.carryover.settle',subject:accountId,detail:{date,minutes,years:changes.map(c=>c.pool.year)}})
 return minutes
}

/** Only accounts with genuinely changed expiry settlement become scheduler work. */
export async function unsettledAccounts(env:Bindings,date:string) {
 return all(env,`SELECT a.* FROM wl_leave_accounts a WHERE a.opening_status='approved' AND EXISTS(
 SELECT 1 FROM wl_leave_carryover_pools c WHERE c.account_id=a.id AND c.expires_on<? AND
 (c.settled=0 OR c.expired_minutes<>MAX(0,c.initial_minutes-MAX(0,-(SELECT COALESCE(SUM(CASE WHEN l.kind IN ('use','reversal') THEN l.minutes WHEN l.kind='adjustment' AND l.minutes<0 THEN l.minutes ELSE 0 END),0)
 FROM wl_ledger l WHERE l.account_id=a.id AND l.effective_date>=c.year||'-01-01' AND l.effective_date<=c.expires_on AND NOT EXISTS(SELECT 1 FROM wl_leave_policy_events e WHERE e.ledger_id=l.id))))))
 ORDER BY a.accrued_through,a.id LIMIT 5`,date)
}
