import { request as httpsRequest } from 'node:https'

// Local Worker TLS is self-signed. The real provider leg always verifies TLS.
export async function liveProviderRequest(request) {
 const body=Buffer.from(await request.arrayBuffer())
 // Miniflare restores the original URL after loopback transport, but leaves
 // transport headers in place. Let Node derive Host from the provider URL.
 const headers=Object.fromEntries(['authorization','content-type','x-models-feature'].map(name=>[name,request.headers.get(name)]).filter(([,value])=>value!==null))
 return new Promise((resolve,reject)=>{
  const upstream=httpsRequest(request.url,{method:request.method,headers:{...headers,'accept-encoding':'identity'},rejectUnauthorized:true},response=>{
   const chunks=[];let size=0
   response.on('error',reject)
   response.on('data',chunk=>{
    size+=chunk.length
    if(size>40000){upstream.destroy(new Error('Provider response exceeded the journey bound'));return}
    chunks.push(chunk)
   })
   response.on('end',()=>{
    const bytes=Buffer.concat(chunks)
    if(response.statusCode>=400){
     let code
     try{code=JSON.parse(bytes.toString()).error?.code}catch{}
     const known=['model_not_found','insufficient_quota','invalid_api_key','permission_denied','rate_limit_exceeded','account_deactivated']
     console.log(JSON.stringify({providerStatus:response.statusCode,errorCode:known.includes(code)?code:'unclassified_provider_failure',requestId:response.headers['x-request-id']}))
    }
    resolve(new Response(bytes,{status:response.statusCode,headers:Object.fromEntries(Object.entries(response.headers).filter(([,value])=>typeof value==='string'))}))
   })
  })
  upstream.on('error',reject)
  upstream.setTimeout(30000,()=>upstream.destroy(new Error('Provider request timed out')))
  upstream.end(body)
 })
}
