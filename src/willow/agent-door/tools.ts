import type { Bindings } from '../../auth.server'
import { defineTool, type ToolDefinition, type JsonSchema } from '../../modules/agent-door/index.ts'
import { actions } from '../actions'
import { Input } from '../input'
import { hiringOpening } from '../hiring'
import { prepareJoiner } from '../lifecycle'
import { actor, native, agentEnvironment } from './native'
import { directory,personRecord,proposalRecord,candidateRecord,nativeWitness,sensitive,standard } from './records'

const text={type:'string',minLength:1,maxLength:200}
const schema=(properties:Record<string,JsonSchema>,required=Object.keys(properties))=>({type:'object' as const,properties,required,additionalProperties:false})
const result={type:'object',additionalProperties:true}
export function tools(env:Bindings):ToolDefinition[] {
 const read=(name:string,title:string,properties:Record<string,JsonSchema>,required:string[],clauses:string[],classes:ToolDefinition['classes'],read:ToolDefinition['run'],classify:ToolDefinition['classify'])=>defineTool({name:`willow.${name}`,title,description:title+'. Native permissions and current record visibility apply.',scope:'willow:read',readOnly:true,inputSchema:schema(properties,required),outputSchema:result,clauses,classes,classify,run:read,untrusted:true})
 const list=read('candidates.list','Inspect current hiring work',{},[],['HIRING-003','WIL-15'],['sensitive'],async(_,ctx)=>({result:await nativeWitness(env,ctx)}),async(_,ctx)=>{await nativeWitness(env,ctx);return sensitive('applicant')})
 const mutations:Array<{name:string;title:string;action:string;properties:Record<string,JsonSchema>;required:string[];target:'opening'|'application';kind:string}>=[

   {name:'candidates.create',title:'Add an application to a native opening',action:'hiring.candidate',properties:{opening:text,name:text,contactEmail:{type:'string',format:'email'},source:text},required:['opening','name','contactEmail','source'],target:'opening',kind:'applicant'},
   {name:'candidates.move',title:'Move an application to an existing native stage',action:'hiring.move',properties:{application:text,revision:{type:'integer',minimum:1},stage:text},required:['application','revision','stage'],target:'application',kind:'applicant'},
   {name:'candidates.scorecard',title:'Record evidence as the sponsoring interviewer',action:'hiring.scorecard',properties:{application:text,version:{type:'integer',minimum:0},evidence:{type:'string',minLength:1,maxLength:4000}},required:['application','version','evidence'],target:'application',kind:'applicant'},
 ]
 return [
  list,
  read('hiring.status','Inspect permitted native hiring work counts',{},[],['HIRING-003','WIL-14'],['standard'],async(_,ctx)=>{const state=await nativeWitness(env,ctx);return {result:{applications:state.openings.reduce((n,o)=>n+o.candidates.length,0),revisions:state.openings.reduce((n,o)=>n+o.candidates.reduce((m,c)=>m+c.revision,0),0),scorecards:state.openings.reduce((n,o)=>n+o.candidates.reduce((m,c)=>m+c.scorecards.length,0),0),proposals:state.proposals.length}}},async()=>standard()),
  read('directory.browse','Browse the permitted employee directory',{asOf:{type:'string',format:'date'}},[],['PEOPLE-002','PEOPLE-005'],['standard'],async(args,ctx)=>({result:{people:await directory(env,await actor(env,ctx),args.asOf as string|undefined)}}),async()=>standard()),
  read('people.read','Read an employee record and cited policy context',{id:text,asOf:{type:'string',format:'date'}},['id'],['WIL-03','WIL-15','PEOPLE-005'],['sensitive'],async(args,ctx)=>({result:await personRecord(env,ctx,String(args.id),args.asOf as string|undefined)}),async(args,ctx)=>{await personRecord(env,ctx,String(args.id),args.asOf as string|undefined);return sensitive('employee')}),
  read('plans.read','Inspect an employment proposal',{id:text},['id'],['WIL-15'],['sensitive'],async(args,ctx)=>({result:await proposalRecord(env,ctx,String(args.id))}),async(args,ctx)=>{await proposalRecord(env,ctx,String(args.id));return sensitive('employment-plan')}),
  read('candidates.read','Read a hiring application',{id:text},['id'],['HIRING-003'],['sensitive'],async(args,ctx)=>({result:await candidateRecord(env,ctx,String(args.id))}),async(args,ctx)=>{await candidateRecord(env,ctx,String(args.id));return sensitive('applicant')}),
  defineTool({name:'willow.plans.prepare',title:'Prepare a joiner for native HR decision',description:'Validate and save a pending native employment proposal. This creates no employee or access and executes no pay or provider work.',scope:'willow:plans',readOnly:false,
   inputSchema:schema({summary:{type:'string',minLength:1,maxLength:500},plan:{type:'object',properties:{template:text,legalName:text,preferredName:text,workEmail:{type:'string',format:'email'},startDate:{type:'string',format:'date'},employmentType:{type:'string',enum:['full_time','part_time','casual','fixed_term']},jobTitle:text,payBasis:{type:'string',enum:['salary','hourly','unknown']},payAmount:{type:'string',pattern:'^[0-9]+(\\.[0-9]{1,2})?$'}},required:['template','legalName','startDate','employmentType','jobTitle'],additionalProperties:false}},['summary','plan']),outputSchema:result,classes:['sensitive'],clauses:['WIL-15'],untrusted:true,
   async classify(args,ctx){await native(async()=>prepareJoiner(env,await actor(env,ctx),Input.of(args.plan as Record<string,unknown>)));return sensitive('employment-plan')},
   summary:async args=>({target:{name:String((args.plan as Record<string,unknown>).legalName)},items:[String(args.summary),...Object.entries(args.plan as Record<string,unknown>).map(([key,value])=>`${key}: ${value}`)]}),
   async run(args,ctx){const scoped=await agentEnvironment(env,ctx);const output=await native(async()=>actions['proposal.create'](scoped,await actor(env,ctx),Input.of({...args,kind:'joiner',agent:ctx.actor.label}),new Request(env.AUTH_ORIGIN))) as {id:string};ctx.emit('proposal.prepared',`willow://proposals/${output.id}`);return {result:output,resources:[{uri:`willow://proposals/${output.id}`,name:'Pending employment plan'}]}},
  }),
  ...mutations.map(spec=>defineTool({
   name:`willow.${spec.name}`,title:spec.title,description:spec.title+'. No candidate identity matching, outreach, ranking or employment decision.',
   scope:'willow:hiring',readOnly:false,inputSchema:schema(spec.properties,spec.required),outputSchema:spec.name==='candidates.scorecard'?schema({id:text,version:{type:'integer',minimum:1}}):schema({id:text,stage:{type:'string'},revision:{type:'integer',minimum:1}}),classes:['sensitive'],clauses:['HIRING-003'],untrusted:true,
   async classify(args,ctx){
    const who=await actor(env,ctx)
    if(spec.target==='application')await candidateRecord(env,ctx,String(args.application))
    else await native(()=>hiringOpening(env,who,String(args.opening)))
    return sensitive(spec.kind)
   },
   async summary(args,ctx){const record=spec.target==='application'?await candidateRecord(env,ctx,String(args.application)):null;return {target:{id:String(args[spec.target]),name:record?.name??String(args.name)},items:[spec.title,...(args.stage?[String(args.stage)]:[]),...(args.contactEmail?[String(args.contactEmail)]:[]),...(args.evidence?[String(args.evidence)]:[])]}},
   async target(args,ctx){if(spec.target==='application')await candidateRecord(env,ctx,String(args.application));else await native(async()=>hiringOpening(env,await actor(env,ctx),String(args.opening)));return {kind:spec.target,id:String(args[spec.target])}},
   ...(spec.name==='candidates.move'?{revisionType:'integer' as const,revision:async(args:Record<string,unknown>,ctx:Parameters<ToolDefinition['classify']>[1])=>(await candidateRecord(env,ctx,String(args.application))).revision}:{}),
   async run(args,ctx){
    const scoped=await agentEnvironment(env,ctx)
    const output=await native(async()=>actions[spec.action](scoped,await actor(env,ctx),Input.of(args),new Request(env.AUTH_ORIGIN)))
    const id=String((output as {id:string}).id)
    ctx.emit('hiring.changed',`willow://applications/${spec.name==='candidates.create'?id:String(args.application)}`)
    return {result:output}
   },
  })),
 ]
}
