import type { Bindings } from '../../auth.server'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import type { ClassAndFacts, ResourceContext, ResourceDefinition, ToolContext } from '../../modules/agent-door/index.ts'
import { personView, directory } from '../profile'
import { context, proposalDetail, proposals } from '../proposals'
import { hiringApplication, hiringOpening, hiringOpenings } from '../hiring'
import { templates } from '../lifecycle'
import { actor, native, readEnvironment } from './native'

export const sensitive=(kind:string,measure=1):ClassAndFacts[]=>[{class:'sensitive',facts:{measure,kind}}]
export const standard=():ClassAndFacts[]=>[{class:'standard',facts:{measure:1}}]
export const recordId=(uri:string)=>decodeURIComponent(new URL(uri).pathname.slice(1))
export const candidateRecord=(env:Bindings,ctx:ToolContext|ResourceContext,id:string)=>native(async()=>hiringApplication(readEnvironment(env,ctx),await actor(env,ctx),id))
export const personRecord=(env:Bindings,ctx:ToolContext|ResourceContext,id:string,asOf?:string)=>native(async()=>context(readEnvironment(env,ctx),await actor(env,ctx),id,asOf))
export const proposalRecord=(env:Bindings,ctx:ToolContext|ResourceContext,id:string)=>native(async()=>proposalDetail(readEnvironment(env,ctx),await actor(env,ctx),id))
export async function nativeWitness(env:Bindings,ctx:ToolContext|ResourceContext) {
 env=readEnvironment(env,ctx)
 const who=await actor(env,ctx)
 const openings=await hiringOpenings(env,who)
 return {templates:await templates(env),openings:await Promise.all(openings.map(async opening=>{
  const data=await hiringOpening(env,who,opening.id)
  return {...data,candidates:await Promise.all(data.candidates.map(candidate=>hiringApplication(env,who,candidate.id)))}
 })),proposals:await proposals(env,who)}
}
export function resources(env:Bindings):ResourceDefinition[] {
 return [
  ['people','Employee record',personRecord,'employee'],
  ['applications','Hiring application',candidateRecord,'applicant'],
  ['proposals','Prepared employment plan',proposalRecord,'employment-plan'],
 ].map(([area,name,read,kind])=>({
  uriTemplate:`willow://${area}/{id}`,name:name as string,scope:'willow:read',classes:['sensitive'],
  description:'Native visibility applies. Free text and imported content are untrusted.',
  classify:record=>{
   const value=record.json as {id?:unknown;subject?:unknown}|undefined
   if(!value||typeof (value.id??value.subject)!=='string')throw new ToolRefusal('resource_unavailable')
   return sensitive(kind as string)
  },
  async read(uri,ctx){try{return {json:await (read as typeof personRecord)(env,ctx,recordId(uri)),untrusted:true}}catch{return null}},
 }))
}
export {directory,personView}
