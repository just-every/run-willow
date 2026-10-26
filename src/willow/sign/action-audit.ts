import type { Bindings } from '../../auth.server'
import type { Actor } from '../actor'
import type { Input } from '../input'
import { auditRead, WillowError } from '../core'

type Handler=(env:Bindings,actor:Actor,input:Input,request:Request)=>Promise<unknown>

/** Failed attempts retain metadata without copying submitted signing content or changing business reviews. */
export function auditedSigning(operation:string,handler:Handler):Handler {
 return async(env,actor,input,request)=>{
  try {return await handler(env,actor,input,request)}
  catch(error) {
   await auditRead(env,actor.id,'signature.attempt.read','employer',{operation,outcome:error instanceof WillowError?'denied':'uncertain',reason:error instanceof WillowError?error.code:'internal_error'})
   throw error
  }
 }
}
