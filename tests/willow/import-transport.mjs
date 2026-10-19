// Real public Base door transport, shared by Willow's existing HTTP journeys.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const digest = value => createHash('sha256').update(value).digest('hex')
export function imports(h, cookie) {
  const request = async (action, body, expected=200, headers={}) => {
    const response=await fetch(`${h.origin}/api/operator/import/${action}`, {method:'POST',headers:{cookie,origin:h.origin,'content-type':'application/json','x-import-source':'bamboohr',...headers},body:JSON.stringify(body)})
    const result=await response.json()
    assert.equal(response.status,expected,`${action}: ${response.status} ${JSON.stringify(result).slice(0,350)}`)
    return result
  }
  const upload = async input => {
    const bytes=Buffer.from(JSON.stringify(input)), totalChunks=Math.ceil(bytes.length/65_536), bundleSha256=digest(bytes)
    let uploadId
    for(let index=0;index<totalChunks;index++) {
      const chunk=bytes.subarray(index*65_536,(index+1)*65_536)
      uploadId=(await request('uploads',{uploadId,name:'bamboohr-bundle.json',bundleSha256,totalBytes:bytes.length,totalChunks,index,chunkSha256:digest(chunk),base64:chunk.toString('base64')})).uploadId
    }
    const inventory=await request('uploads',{uploadId})
    assert.equal(inventory.complete,true)
    return uploadId
  }
  const plan=async(input,{catchup=false,status=200}={})=>request('plan',{uploadId:await upload(input),...(catchup?{catchup:true}:{})},status)
  const finish=async(action,plan)=>{
    for(let batch=0;batch<100;batch++) {
      const result=await request(action,{planId:plan.planId,...(action==='apply'?{reviewedFingerprint:plan.fingerprint}:{})})
      if(!result.job || ['completed','undone'].includes(result.job.state)) return result
      assert.ok(['queued','applying','undoing'].includes(result.job.state))
    }
    assert.fail(`${action} never completed`)
  }
  return {request,upload,plan,apply:plan=>finish('apply',plan),undo:plan=>finish('undo',plan),reconcile:plan=>request('reconcile',{planId:plan.planId})}
}
