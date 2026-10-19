import { DoorError } from '../../modules/import-kit/src/door/protocol'
// The only native import pipeline: both signed-in forms and external grants use Base's door.
import { Buffer } from 'node:buffer'
import type { Bindings } from '../../auth.server'
import { currentActor } from '../actor'
import { insist, one, WillowError } from '../core'
import { Input } from '../input'
import { canonicalJson, sha256, type D1Database, type ImportMapping, type Json } from '../../modules/import-kit/src/d1/index'
import { createImportOperatorHandler } from '../../modules/import-kit/src/door/operator'
import { createImportDoorHandler } from '../../modules/import-kit/src/door/index'
import type { ImportDoorSource } from '../../modules/import-kit/src/door/types'
import { prepareBamboohr, undoBlockers, type Preview } from './bamboohr'
import { willowTargets } from './target'
import { doorKey, initializeDoor, ownerPredicate } from './authority'

const namespace = 'bamboohr'
const emptyMapping: ImportMapping = { version: 'bamboohr-people-1', map() { throw new Error('source_not_prepared') } }

/** Reconstruct the reader from retained original bytes, never from client-supplied effects. */
async function uploadedSource(env: Bindings, key: string, uploadId: unknown) {
  insist(typeof uploadId === 'string', 'upload_id_required')
  const upload = await one<{total_bytes:number;total_chunks:number;bundle_sha256:string}>(env,
    'SELECT total_bytes,total_chunks,bundle_sha256 FROM ik_door_uploads WHERE id=? AND installation_id=? AND namespace=?', uploadId, key, namespace)
  insist(upload && upload.total_bytes <= 40_000_000, 'upload_not_found', 404)
  const chunks = (await env.DB.prepare('SELECT ordinal,base64,size,sha256 FROM ik_door_chunks WHERE upload_id=? ORDER BY ordinal').bind(uploadId).all<{ordinal:number;base64:string;size:number;sha256:string}>()).results
  insist(chunks.length === upload.total_chunks, 'upload_incomplete', 409)
  const bytes = Buffer.concat(chunks.map((chunk, index) => {
    const value = Buffer.from(chunk.base64, 'base64')
    insist(chunk.ordinal === index && value.length === chunk.size && sha256(value) === chunk.sha256, 'upload_custody_mismatch', 409)
    return value
  }))
  insist(bytes.length === upload.total_bytes && sha256(bytes) === upload.bundle_sha256, 'bundle_hash_mismatch', 409)
  const input = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes))
  insist(input && typeof input === 'object' && !Array.isArray(input), 'invalid_source')
  const prepared = await prepareBamboohr(env, Input.of(input))
  // Private content-addressed upload custody; no native people/document records yet.
  for (const [name, value] of prepared.files) {
    const hash=prepared.hashes.get(name)!
    if (!await env.FILES.head(`sha256/${hash}`)) await env.FILES.put(`sha256/${hash}`, value, {httpMetadata:{contentType:'application/octet-stream'}})
  }
  const source: ImportDoorSource = {
    mapping: prepared.mapping,
    parse(value) {
      insist(canonicalJson(value) === canonicalJson(input), 'source_changed', 409)
      return prepared.records.map(({kind,sourceId,payload}) => ({kind,sourceId,payload}))
    },
  }
  return {...source,preview:prepared.preview}
}

export async function importDoorResponse(request: Request, env: Bindings): Promise<Response | null> {
  const path = new URL(request.url).pathname
  const operator = path.startsWith('/api/operator/import/'), grant = path.startsWith('/api/rer/import/')
  if (!operator && !grant) return null
  try {
    if(operator) insist(request.headers.get('x-import-source')==='bamboohr','unknown_import_source')
    const key = await doorKey(env)
    const owner = await one<{id:string}>(env, "SELECT m.id FROM wl_members m JOIN oa_operators o ON lower(o.email)=m.email WHERE o.role='owner' AND o.status='active' AND m.status='active'")
    if (!owner) return Response.json({error:'owner_required'}, {status:401})
    let prepared: (ImportDoorSource & {preview:Preview}) | null = null
    const body = async () => {
      const length = request.headers.get('content-length')
      insist(!length || Number(length)<=100_000, 'request_too_large', 413)
      const reader=request.clone().body?.getReader()
      insist(reader,'json_body_required')
      const chunks:Uint8Array[]=[]; let size=0
      try { for(;;) {
        const {done,value}=await reader.read(); if(done) break
        size+=value.byteLength; insist(size<=100_000,'request_too_large',413); chunks.push(value)
      } } finally { await reader.cancel(); reader.releaseLock() }
      const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      insist(parsed && typeof parsed==='object' && !Array.isArray(parsed),'invalid_input')
      return parsed as Record<string,unknown>
    }
    const source = async (name: string) => {
      if (name !== namespace) return null
      if (path.endsWith('/undo')) {
        const input=await body()
        const plan=await one<{job_id:string}>(env,'SELECT job_id FROM ik_door_plans WHERE id=? AND installation_id=? AND namespace=?',input.planId,key,namespace)
        if(plan?.job_id) {
          const blockers=await undoBlockers(env,plan.job_id)
          if(blockers.length) throw new DoorError('undo_blocked',409,{blockers})
        }
      }
      if (path.endsWith('/plan')) {
        try { prepared = await uploadedSource(env,key,(await body()).uploadId) }
        catch(error) { if(error instanceof WillowError) throw new DoorError(error.code,error.status); throw error }
      }
      return prepared ?? { mapping: emptyMapping, parse() { throw new Error('source_not_prepared') } }
    }
    const runtime = { database: env.DB as unknown as D1Database, targets: willowTargets,
      ownerPrincipalId: owner.id, destination: 'people', format: 'json' as const,
      limits: {maxBytes:40_000_000,maxRecords:100_000,maxRecordBytes:40_000_000} }
    if (grant) {
      if (!env.RER_OWNER_CLAIM_PUBLIC_KEYS) return Response.json({error:'not_found'}, {status:404})
      return createImportDoorHandler({ ...runtime, installationId:key, source,
        claim: {issuer:env.RER_OWNER_CLAIM_ISSUER ?? '',installationId:env.RER_OWNER_CLAIM_INSTALLATION_ID ?? '',
          appOrigin:env.AUTH_ORIGIN,expectedEmail:env.OWNER_EMAIL,publicKeys:JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS)} })(request)
    }
    // The closures are filled only after authenticating the owner; Base then rechecks SQL authority.
    const response=await createImportOperatorHandler({ ...runtime, installationId:key, namespace, appOrigin:env.AUTH_ORIGIN,
      ownerEmail:env.OWNER_EMAIL, mapping:{version:emptyMapping.version,map(record){return (prepared?.mapping ?? emptyMapping).map(record)}},
      parse(value,index){ if (!prepared) throw new Error('source_not_prepared'); return prepared.parse(value,index) },
      async authorize() {
        const actor = await currentActor(env, request)
        if (!actor?.owner) return null
        await initializeDoor(env, actor)
        await source(namespace)
        return ownerPredicate(actor)
      },
    })(request)
    if(response?.ok && path.endsWith('/plan') && prepared) {
      const summary=(prepared as {preview:Preview}).preview
      return Response.json({...summary,...await response.json() as object},{headers:response.headers})
    }
    return response
  } catch (error) {
    const known = error instanceof WillowError
    return Response.json({error:known?error.code:'invalid_import_source'}, {status:known?error.status:400,headers:{'cache-control':'no-store'}})
  }
}

/** Server-rendered forms call the same HTTP handler with the current cookie and Origin. */
export async function doorCall(env: Bindings, request: Request, action: string, body: unknown) {
  const response = await importDoorResponse(new Request(`${env.AUTH_ORIGIN}/api/operator/import/${action}`, {
    method:'POST',headers:{cookie:request.headers.get('cookie') ?? '',origin:request.headers.get('origin') ?? '', 'content-type':'application/json','x-import-source':'bamboohr'},body:JSON.stringify(body),
  }), env)
  const result = await response!.json() as any
  insist(response!.ok, result.error ?? 'import_failed', response!.status, result.details)
  return result
}

export async function uploadAndPlan(env: Bindings, request: Request, values: Record<string,string>) {
  const bytes = Buffer.from(JSON.stringify(values)), bundleSha256=sha256(bytes), totalChunks=Math.ceil(bytes.length/65_536)
  let uploadId: string | undefined
  for(let index=0; index<totalChunks; index++) {
    const chunk=bytes.subarray(index*65_536,(index+1)*65_536)
    uploadId=(await doorCall(env,request,'uploads',{uploadId,name:'bamboohr-bundle.json',bundleSha256,totalBytes:bytes.length,totalChunks,index,chunkSha256:sha256(chunk),base64:chunk.toString('base64')})).uploadId
  }
  return doorCall(env,request,'plan',{uploadId,catchup:values.catchup==='yes'})
}
