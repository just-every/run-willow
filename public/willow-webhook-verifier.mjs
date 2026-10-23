// Receiver-side verification. Persist seen event IDs across receiver restarts.
export async function verifyWillowWebhook({secret,id,timestamp,signature,body,seen,now=Date.now(),toleranceSeconds=300}) {
 if(typeof id!=='string'||!id||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||typeof signature!=='string'||!/^v1=[a-f0-9]{64}$/.test(signature)||typeof body!=='string'||!seen||seen.has(id))return false
 if(!Number.isFinite(now)||!Number.isInteger(toleranceSeconds)||toleranceSeconds<0||toleranceSeconds>300||Math.abs(now-Number(timestamp)*1000)>toleranceSeconds*1000)return false
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])
 const bytes=Uint8Array.from(signature.slice(3).match(/../g),pair=>parseInt(pair,16))
 const valid=await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(id+'.'+timestamp+'.'+body))
 if(!valid||seen.has(id))return false
 seen.add(id)
 return true
}
