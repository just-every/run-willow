import type { Bindings } from '../auth.server'
interface Attribution {
 agent:Readonly<{id:string;name:string}>
 actor:Readonly<{label:string}>
 operationId:string|null
 approvers:readonly Readonly<{id:string;name:string}>[]
}
const contexts=new WeakMap<Bindings,Attribution>()
export const attributeAgent=(env:Bindings,ctx:Attribution)=>contexts.set(env,ctx)
export const agentAttribution=(env:Bindings)=>contexts.get(env)
