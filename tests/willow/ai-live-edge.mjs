import { request as httpsRequest } from 'node:https'

// Local Worker TLS is self-signed. The real provider leg always verifies TLS.
export async function liveProviderRequest(request) {
 const body=Buffer.from(await request.arrayBuffer())
 return new Promise((resolve,reject)=>{
  const upstream=httpsRequest(request.url,{method:request.method,headers:{...Object.fromEntries(request.headers),'accept-encoding':'identity'},rejectUnauthorized:true},response=>{
   const chunks=[];let size=0
   response.on('error',reject)
   response.on('data',chunk=>{
    size+=chunk.length
    if(size>40000){upstream.destroy(new Error('Provider response exceeded the journey bound'));return}
    chunks.push(chunk)
   })
   response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:Object.fromEntries(Object.entries(response.headers).filter(([,value])=>typeof value==='string'))})))
  })
  upstream.on('error',reject)
  upstream.setTimeout(30000,()=>upstream.destroy(new Error('Provider request timed out')))
  upstream.end(body)
 })
}
