import type { Bindings } from '../../auth.server'
import { ToolRefusal, type ToolContext, type ResourceContext } from '../../modules/agent-door/index.ts'
import { WillowError, guard, one } from '../core'
import { agentActor } from './people'
import { attributeAgent } from '../agent-attribution'

export async function native<T>(run:()=>Promise<T>):Promise<T> {
 try{return await run()}catch(error){if(error instanceof WillowError)throw new ToolRefusal(error.code);throw error}
}
/** Request-local D1 facade adds admission fences and attribution to the SAME
 * native batch, without changing authorization, native services or identities. */
export async function agentEnvironment(env:Bindings, ctx:ToolContext):Promise<Bindings> {
 const db=env.DB
 const snapshot=(await one<{seq:number}>(env,'SELECT COALESCE(MAX(seq),0) AS seq FROM wl_audit'))!.seq
 const wrapped=new Proxy(db, {get(target,key) {
  if(key==='batch')return async (statements:D1PreparedStatement[])=>{
   const identity=await one(env,`SELECT o.version FROM wl_agent_people b JOIN oa_operators o ON o.id=b.operator_id JOIN wl_members m ON m.id=b.member_id WHERE m.id=? AND o.status='active' AND m.status='active'`,ctx.person.id)
   if(!identity)throw new ToolRefusal('unauthenticated')
   // Native audit rows and their agent attribution share the business batch.

   return db.batch([
    guard(env,'agent_authority_changed',`EXISTS(SELECT 1 FROM wl_agent_people b JOIN oa_operators o ON o.id=b.operator_id JOIN wl_members m ON m.id=b.member_id WHERE m.id=? AND m.status='active' AND o.status='active' AND o.version=?)`,ctx.person.id,identity.version),
    guard(env,'agent_authority_changed','(SELECT COALESCE(MAX(seq),0) FROM wl_audit)=?',snapshot),
    guard(env,'agent_authority_changed',`EXISTS(SELECT 1 FROM agent_door_state s JOIN agent_door_audit a
      ON json_extract(a.row,'$.operation_id')=? AND json_extract(a.row,'$.outcome')='running'
      AND json_extract(a.row,'$.sponsor.id')=? AND json_extract(a.row,'$.agent.id')=?
      WHERE s.id=1 AND s.local_paused=0
      AND (s.envelope IS NULL OR (json_extract(s.envelope,'$.paused')=0 AND json_extract(s.envelope,'$.exp')*1000>?
        AND json_extract(s.envelope,'$.revision')=json_extract(a.row,'$.revision')
        AND NOT EXISTS(SELECT 1 FROM json_each(s.envelope,'$.revoked.agents') WHERE value=?)
        AND NOT EXISTS(SELECT 1 FROM json_each(s.envelope,'$.revoked.consents') WHERE value=?)))
      AND (s.envelope IS NOT NULL OR s.local_revision=json_extract(a.row,'$.revision'))
      AND EXISTS(SELECT 1 FROM agent_door_agents g WHERE g.id=? AND g.sponsor=? AND g.revoked=0))`,ctx.operationId,ctx.person.id,ctx.agent.id,Date.now(),ctx.agent.id,ctx.consent??'',ctx.agent.id,ctx.person.id),
    ...statements,
   ])
  }
  const value=Reflect.get(target,key,target)
  return typeof value==='function'?value.bind(target):value
 }})
 const scoped={...env,DB:wrapped}
 attributeAgent(scoped,ctx)
 return scoped
}
export const actor=(env:Bindings,ctx:ToolContext|ResourceContext)=>native(()=>agentActor(env,ctx.person))

/** Read callbacks receive authenticated identity even when the shared resource
 * API has no native operation handle. Do not manufacture a decision id. */
export function readEnvironment(env:Bindings,ctx:ToolContext|ResourceContext):Bindings {
 const scoped={...env}
 attributeAgent(scoped,{agent:ctx.agent,actor:{label:`${ctx.agent.name} for ${ctx.person.name}`},operationId:'operationId' in ctx?ctx.operationId??null:null,approvers:'approvers' in ctx?ctx.approvers:[]})
 return scoped
}
