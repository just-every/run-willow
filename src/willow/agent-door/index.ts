import type { Bindings } from '../../auth.server'
import { createAgentDoor, type Trust } from '../../modules/agent-door/index.ts'
import { willowPeople } from './people'
import { tools } from './tools'
import { resources } from './records'
export function willowAgentDoor(env:Bindings) {
 const issuer=env.RER_OWNER_CLAIM_ISSUER,installationId=env.RER_OWNER_CLAIM_INSTALLATION_ID,publicKeys=env.RER_OWNER_CLAIM_PUBLIC_KEYS
 const configured=[issuer,installationId,publicKeys].some(Boolean)
 if(configured&&(!issuer||!installationId||!publicKeys))throw Error('Incomplete agent trust configuration')
 const trust:Trust|null=configured?{issuer:issuer!,installationId:installationId!,appOrigin:env.AUTH_ORIGIN,publicKeys:JSON.parse(publicKeys!)}:null
 return createAgentDoor({seed:'willow',name:'Willow',specialist:'people operations coordinator',db:env.DB,origin:env.AUTH_ORIGIN,trust,
  capabilities:['tools','policy','pause','audit','idempotency'],
  people:willowPeople(env),tools:tools(env),resources:resources(env),
  notTools:[{clauses:['WIL-16','MIGRATE-001'],reason:'import-door'},{clauses:['OPS-001'],reason:'installation'},{clauses:['WIL-19','CONNECT-001'],reason:'connector'},{clauses:['SECURITY-002','SIGN-001'],reason:'screen'}],
 })
}
