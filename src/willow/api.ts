import { requestChange } from './change-requests/requests'
import { registerWebhook, webhookList, webhookLog } from './webhooks'
import { publishedDocumentVersion } from './document-publication'
import { proposeSelfChange } from './self-service/requests'
import { personalField } from './self-service/personal'
import { otherPersonalMode } from './levels/other-personal'
import { Input } from './input'
// Versioned API transport delegates every value to the existing native credential projections.
import type { Bindings } from '../auth.server'
import type { Actor } from './actor'
import { insist, now, one, sha256Hex, type Row } from './core'
import { credentialContext, credentialPersonAllowed } from './api-credentials/principal'
import { assertCredentialCurrent } from './api-credentials/authenticate'
import { credentialRead } from './api-credentials/response'
import { openCursor, sealCursor, type CursorState } from './api-credentials/cursor'
import { documentFile } from './documents'
import { V1_API_DOORS, match } from './doors'

const PREFIX='/api/willow/v1/'
const PERSON_FIELDS=['name','legalName','preferredName','workEmail','revision','asOf','status','selectedPeriod','current','employment','employeeNumber','private','pay','compensation','compensationFields','compensationRecords','jobFields','customFields','recordTables','leave','cases','documents','facets'] as const
async function native(env:Bindings,actor:Actor,path:string,params:URLSearchParams=new URLSearchParams()) {
 const url=new URL('/api/willow/'+path,env.AUTH_ORIGIN);url.search=params.toString()
 return credentialRead(env,actor,new Request(url),url) as Promise<any>
}
function selection(params:URLSearchParams) {
 const fields=params.has('fields')?params.get('fields')!.split(','):['name','workEmail','status','current']
 insist(fields.length>0&&new Set(fields).size===fields.length&&fields.every(field=>(PERSON_FIELDS as readonly string[]).includes(field)),'invalid_fields')
 return fields
}
async function employee(env:Bindings,actor:Actor,id:string,params:URLSearchParams) {
 const record=await native(env,actor,'people/'+id,params),fields=selection(params)
 const data:Row={id:record.id},withheld:string[]=[]
 for(const field of fields) {
  if(Object.hasOwn(record,field)) data[field]=record[field]
  else withheld.push(field)
 }
 return {data,withheld}
}
const identity=(params:URLSearchParams,path:string)=>JSON.stringify([path,[...params].filter(([key])=>!['cursor','changedSince','limit'].includes(key)).sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv))])

async function list(env:Bindings,actor:Actor,url:URL,path:string,records:Row[]) {
 const context=credentialContext(actor)!,params=url.searchParams
 insist(!params.has('cursor')||!params.has('changedSince'),'invalid_cursor')
 const value=params.get('limit')??'50'
 insist(/^[1-9]\d*$/.test(value)&&Number(value)<=100,'invalid_limit')
 const limit=Number(value),query=identity(params,path)
 records.sort((a,b)=>String(a.id).localeCompare(String(b.id)))
 const manifest=Object.fromEntries(await Promise.all(records.map(async record=>[record.id,await sha256Hex(JSON.stringify(record))])))
 let before:Record<string,string>|null=null,offset=0,expires=now()+86400000
 const cursor=params.get('cursor'),since=params.get('changedSince')
 if(cursor) {
  const state=await openCursor(env,cursor,context.id,query,'page')
  insist(state.date===actor.today&&JSON.stringify(state.manifest)===JSON.stringify(manifest),'cursor_stale',409)
  before=state.before;offset=state.offset;expires=state.expires
 } else if(since) before=(await openCursor(env,since,context.id,query,'sync')).manifest
 const changed=before?records.filter(record=>before![record.id]!==manifest[record.id]):records
 const data=changed.slice(offset,offset+limit),more=offset+limit<changed.length
 const state:CursorState={kind:'page',credential:context.id,query,expires,manifest,before,offset:offset+limit,date:actor.today}
 await assertCredentialCurrent(env,actor)
 return {apiVersion:'1',data,nextCursor:more?await sealCursor(env,state):null,syncCursor:more?null:await sealCursor(env,{...state,kind:'sync',before:null,offset:0}),resetRequired:!!before&&Object.keys(before).some(id=>!Object.hasOwn(manifest,id))}
}

export async function versionedRead(env:Bindings,actor:Actor,request:Request,url:URL):Promise<Response|unknown> {
 const path=url.pathname.slice(PREFIX.length),found=match(V1_API_DOORS,path)
 insist(found,'not_found',404)
 if(found.name==='v1Webhooks')return webhookList(env,actor)
 if(found.name==='v1WebhookLog')return webhookLog(env,actor,found.id)
 const allowed=['fields','asOf','limit','cursor','changedSince']
 insist([...url.searchParams.keys()].every(key=>allowed.includes(key)),'invalid_query')
 if(found.name==='v1Employees') {
  const roster=await native(env,actor,'people',url.searchParams)
  const records=[]
  for(const person of roster) { const row=await employee(env,actor,person.id,url.searchParams);records.push({...row.data,withheld:row.withheld}) }
  return list(env,actor,url,path,records)
 }
 if(found.name==='v1Employee') {
  const result=await employee(env,actor,found.id,url.searchParams)
  await assertCredentialCurrent(env,actor)
  return {apiVersion:'1',...result}
 }
 if(found.name==='v1DocumentFile') {
  const row=await one(env,`SELECT d.person_id FROM wl_document_versions v JOIN wl_documents d ON d.id=v.document_id WHERE v.id=? AND ${publishedDocumentVersion()}`,found.id)
  insist(row&&credentialPersonAllowed(actor,row.person_id),'not_found',404)
  const response=await documentFile(env,actor,found.id,true)
  // Native download audits do not change business authority.
  await assertCredentialCurrent(env,actor)
  return response
 }
 let records:Row[]
 switch(found.name) {
  case 'v1Organization': records=(await native(env,actor,'organization',url.searchParams)).nodes;break
  case 'v1CustomFields': records=await native(env,actor,'custom-fields',url.searchParams);break
  case 'v1Tables': records=await native(env,actor,'record-tables',url.searchParams);break
  case 'v1Table': {
   const report=await native(env,actor,'record-tables/'+found.id,url.searchParams)
   await assertCredentialCurrent(env,actor)
   return {apiVersion:'1',data:report}
  }
  case 'v1AccessLevel': {
   const context=credentialContext(actor)!
   const level=await one(env,'SELECT id,name,version FROM wl_levels WHERE id=?',context.level)
   await assertCredentialCurrent(env,actor)
   return {apiVersion:'1',data:level}
  }
  case 'v1Balances': case 'v1Requests': case 'v1Calendar': case 'v1Documents': {
   const roster=await native(env,actor,'people'),rows:Row[]=[]
   for(const person of roster) {
    const record=await native(env,actor,'people/'+person.id,url.searchParams)
    if(found.name==='v1Documents')for(const doc of record.documents??[]) rows.push({...doc,personId:person.id})
    else for(const account of record.leave?.accounts??[]) {
     if(found.name==='v1Balances'&&Object.hasOwn(account,'balanceMinutes'))rows.push({id:account.id,personId:person.id,balanceMinutes:account.balanceMinutes,accruedThrough:account.accruedThrough})
    }
    if(found.name==='v1Requests')for(const leave of record.leave?.requests??[]) rows.push({...leave,personId:person.id})
    if(found.name==='v1Calendar')for(const [index,leave] of (record.leave?.calendar??[]).entries()) rows.push({id:await sha256Hex(JSON.stringify([person.id,index,leave])),...leave,personId:person.id})
   }
   records=rows;break
  }
  default:insist(false,'not_found',404)
 }
 return list(env,actor,url,path,records)
}

/** The initial write scope can request approval only; HR executes the unchanged native proposal. */
export async function versionedWrite(env:Bindings,actor:Actor,request:Request,url:URL) {
 if(url.pathname===PREFIX+'webhooks')return registerWebhook(env,actor,await Input.from(request))
 if(url.pathname===PREFIX+'employment-changes') {
  const input=await Input.from(request)
  input.only(['person','effectiveFrom','reason','jobTitle','departmentId','locationId','managerPersonId','scheduleId','employmentType','employmentStatus','fte','startDate','endDate','payBasis','payAmount','payIncreasePercent'])
  insist(credentialPersonAllowed(actor,input.text('person')),'not_found',404)
  const result=await requestChange(env,actor,input)
  return {apiVersion:'1',data:{id:result.id,status:result.status}}
 }
 insist(url.pathname===PREFIX+'changes','credential_read_only',403)
 const context=credentialContext(actor)!
 insist(context.writeScopes.includes('personal.approval'),'credential_read_only',403)
 const input=await Input.from(request)
 input.only(['person','field','value'])
 insist(input.provided('value'),'missing_value')
 const person=input.text('person'),field=personalField(input.text('field'))
 insist(credentialPersonAllowed(actor,person),'not_found',404)
 insist(otherPersonalMode(actor,person,field)==='approval','personal_field_forbidden',403)
 const result=await proposeSelfChange(env,actor,Input.of({kind:'personal',person,field,value:input.text('value',{optional:field!=='legalName',max:400})}))
 return {apiVersion:'1',data:result}
}
